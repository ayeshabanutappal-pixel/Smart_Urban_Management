"""
AI / YOLO sidecar bridge routes for WasteSmart (Flask 127.0.0.1:5000 -> Sidecar 127.0.0.1:5001).

Endpoints:
  GET  /api/detect/status             – Probe AI sidecar health cleanly
  POST /api/detect                    – Authenticated raster upload -> raw COCO detections
  GET  /api/detect/outputs/<filename> – Serve annotated image safely via Flask
  POST /api/detect/verify-cleanup     – Admin-only advisory check on after-cleaning photo
"""
from __future__ import annotations

import base64
import binascii
import json
from pathlib import Path
import re
import socket
from urllib import error as urllib_error
from urllib import request as urllib_request

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from app.routes.complaints import _find_complaint_by_ref
from app.utils.auth_decorators import roles_required

detect_bp = Blueprint("detect", __name__, url_prefix="/api/detect")

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_RASTER_EXTS = {"jpg", "jpeg", "png", "webp"}
MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
DATA_URI_RE = re.compile(
    r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)
SAFE_OUTPUT_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


def _error(message: str, status_code: int, error_label: str):
    return (
        jsonify(
            {
                "success": False,
                "error": error_label,
                "message": message,
                "status": status_code,
            }
        ),
        status_code,
    )


def _sidecar_url() -> str:
    return str(current_app.config.get("AI_SERVICE_URL") or "http://127.0.0.1:5001").rstrip("/")


def _sidecar_timeout() -> float:
    return float(current_app.config.get("AI_SERVICE_TIMEOUT_SECONDS") or 30.0)


def _output_folder() -> Path:
    folder = Path(current_app.config["DETECT_OUTPUT_FOLDER"])
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _probe_sidecar_health() -> dict:
    url = f"{_sidecar_url()}/health"
    req = urllib_request.Request(url, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            ready = resp.status == 200 and bool(data.get("modelConfigured", True))
            return {
                "available": ready,
                "mode": "sidecar-yolo" if ready else "unavailable",
                "modelLoaded": bool(data.get("modelLoaded", False)),
                "modelConfigured": bool(data.get("modelConfigured", False)),
                "engine": "YOLOv8n Sidecar (ai/detector.py)" if ready else "YOLO model not configured",
                "autoResolveSupported": False,
            }
    except (urllib_error.URLError, TimeoutError, socket.timeout, OSError, ValueError):
        return {
            "available": False,
            "mode": "unavailable",
            "modelLoaded": False,
            "modelConfigured": False,
            "engine": "AI sidecar service is offline",
            "autoResolveSupported": False,
        }


def _extract_validated_raster_upload() -> tuple[bytes, str]:
    """
    Validate incoming multipart file or JSON base64 data URI.
    Returns (raw_bytes, normalized_ext). Raises ValueError (400) or OverflowError (413).
    """
    uploaded = request.files.get("image") or request.files.get("file")
    if uploaded is not None and uploaded.filename:
        filename = uploaded.filename.strip()
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ALLOWED_RASTER_EXTS:
            mime = (uploaded.mimetype or "").lower()
            if ext == "" and mime in MIME_TO_EXT:
                ext = MIME_TO_EXT[mime]
            else:
                raise ValueError(
                    "Unsupported file format. Only JPG, JPEG, PNG, and WEBP raster images are accepted."
                )

        raw_bytes = uploaded.read(MAX_IMAGE_BYTES + 1)
        if not raw_bytes:
            raise ValueError("Uploaded image file is empty.")
        if len(raw_bytes) > MAX_IMAGE_BYTES:
            raise OverflowError("Image exceeds the 10 MB maximum upload size.")
        clean_ext = "jpg" if ext == "jpeg" else ext
        return raw_bytes, clean_ext

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValueError("Please upload an image file (JPG, JPEG, PNG, WEBP) or provide base64 imageUrl.")

    raw_url = str(payload.get("imageUrl") or payload.get("imageBase64") or "").strip()
    if not raw_url:
        raise ValueError("No image was provided for detection.")

    if raw_url.lower().endswith(".svg") or raw_url.startswith("data:image/svg"):
        raise ValueError("SVG files are not supported. Please upload JPG, JPEG, PNG, or WEBP.")

    if raw_url.startswith("data:"):
        match = DATA_URI_RE.match(raw_url)
        if not match:
            raise ValueError(
                "Invalid or unsupported image data URI. Only PNG, JPG, JPEG, and WEBP are supported."
            )
        ext = match.group(1).lower()
        try:
            decoded = base64.b64decode(match.group(2), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Uploaded base64 image data is invalid or corrupted.") from exc
        if not decoded:
            raise ValueError("Uploaded image is empty.")
        if len(decoded) > MAX_IMAGE_BYTES:
            raise OverflowError("Image exceeds the 10 MB maximum upload size.")
        return decoded, ("jpg" if ext == "jpeg" else ext)

    raise ValueError("Unsupported image reference. Upload a JPG, JPEG, PNG, or WEBP file.")


def _call_sidecar_detect(raw_bytes: bytes, ext: str) -> tuple[int, dict]:
    """Forward validated raster bytes to localhost AI sidecar and fetch annotated image if needed."""
    sidecar_endpoint = f"{_sidecar_url()}/detect"
    body = json.dumps(
        {
            "imageBase64": base64.b64encode(raw_bytes).decode("ascii"),
            "filename": f"upload.{ext}",
        }
    ).encode("utf-8")

    req = urllib_request.Request(
        sidecar_endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib_request.urlopen(req, timeout=_sidecar_timeout()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            status_code = resp.status
    except urllib_error.HTTPError as exc:
        try:
            err_body = json.loads(exc.read().decode("utf-8"))
        except Exception:
            err_body = {"success": False, "error": f"AI sidecar returned HTTP {exc.code}."}
        return exc.code, err_body
    except (TimeoutError, socket.timeout):
        return 504, {
            "success": False,
            "error": "Gateway Timeout",
            "message": "AI detection service timed out while processing the image.",
        }
    except urllib_error.URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            return 504, {
                "success": False,
                "error": "Gateway Timeout",
                "message": "AI detection service timed out while processing the image.",
            }
        return 503, {
            "success": False,
            "error": "Service Unavailable",
            "message": "AI detection service is currently unavailable.",
        }
    except (OSError, ValueError):
        return 502, {
            "success": False,
            "error": "Bad Gateway",
            "message": "Received an invalid response from the AI detection service.",
        }

    # Ensure annotated image is accessible via Flask /api/detect/outputs/<filename>
    ann_name = data.get("annotatedImageFilename")
    if ann_name and SAFE_OUTPUT_RE.match(ann_name):
        dest_path = _output_folder() / ann_name
        if not dest_path.is_file():
            try:
                out_req = urllib_request.Request(f"{_sidecar_url()}/outputs/{ann_name}", method="GET")
                with urllib_request.urlopen(out_req, timeout=5.0) as out_resp:
                    if out_resp.status == 200:
                        dest_path.write_bytes(out_resp.read())
            except Exception:
                pass
        if dest_path.is_file():
            data["annotatedImageUrl"] = f"/api/detect/outputs/{ann_name}"

    return status_code, data


@detect_bp.get("/status")
def get_detect_status():
    """Report live status of the localhost AI sidecar service."""
    return jsonify(_probe_sidecar_health()), 200


@detect_bp.get("/outputs/<string:filename>")
def serve_annotated_output(filename: str):
    """Serve annotated YOLO output images safely without exposing the sidecar port."""
    if not filename or not SAFE_OUTPUT_RE.match(filename) or ".." in filename:
        return _error("Invalid output filename.", 404, "Not Found")

    out_dir = _output_folder()
    target = out_dir / filename
    if not target.is_file():
        return _error("Annotated image not found.", 404, "Not Found")

    return send_from_directory(str(out_dir), filename)


@detect_bp.post("")
@roles_required("citizen", "admin", "worker")
def detect_waste_proxy():
    """
    Authenticated endpoint bridging Flask uploads to the localhost AI sidecar.
    Preserves raw COCO class labels, raw bounding boxes [x1, y1, x2, y2],
    raw confidence values, image dimensions, and zero-detection honesty.
    """
    try:
        raw_bytes, ext = _extract_validated_raster_upload()
    except OverflowError as exc:
        return _error(str(exc), 413, "Payload Too Large")
    except ValueError as exc:
        return _error(str(exc), 400, "Validation Error")

    status_code, data = _call_sidecar_detect(raw_bytes, ext)
    if status_code >= 400 or not data.get("success"):
        err_msg = data.get("message") or data.get("error") or "AI detection failed."
        err_label = data.get("error") if isinstance(data.get("error"), str) else "Detection Error"
        return _error(err_msg, status_code if status_code >= 400 else 502, err_label)

    detections = data.get("detections") or []
    total = int(data.get("totalDetections") or len(detections))

    return (
        jsonify(
            {
                "success": True,
                "detected": total > 0,
                "detections": detections,
                "totalDetections": total,
                "imageDimensions": data.get("imageDimensions"),
                "annotatedImageUrl": data.get("annotatedImageUrl"),
                "modelEngine": "YOLOv8n Sidecar (ai/detector.py)",
                "isMockResult": False,
                "error": None,
            }
        ),
        200,
    )


@detect_bp.post("/verify-cleanup")
@roles_required("admin")
def verify_cleanup_with_ai():
    """
    Advisory-only AI check on a complaint's uploaded after-cleaning photograph.
    Never automatically resolves complaints; Admin visual review is authoritative.
    """
    payload = request.get_json(silent=True) or {}
    complaint_ref = str(payload.get("complaintId") or "").strip()
    if not complaint_ref:
        return _error("complaintId is required.", 400, "Validation Error")

    complaint = _find_complaint_by_ref(complaint_ref)
    if complaint is None:
        return _error("Complaint not found.", 404, "Not Found")

    if not complaint.after_image_url:
        return _error("No after-cleaning photograph has been uploaded yet.", 400, "Validation Error")

    # Resolve locally stored complaint upload bytes if available
    after_url = complaint.after_image_url
    if not after_url.startswith("/api/complaints/uploads/"):
        return (
            jsonify(
                {
                    "yoloAvailable": False,
                    "advisoryOnly": True,
                    "autoResolved": False,
                    "wasteStillDetected": None,
                    "message": "After-cleaning image is external; manual Admin verification required.",
                }
            ),
            200,
        )

    filename = after_url.rsplit("/", 1)[-1]
    upload_path = Path(current_app.config["COMPLAINT_UPLOAD_FOLDER"]) / filename
    if not upload_path.is_file():
        return _error("Stored after-cleaning image file could not be found.", 404, "Not Found")

    ext = upload_path.suffix.lower().lstrip(".")
    clean_ext = "jpg" if ext == "jpeg" else ext
    if clean_ext not in ALLOWED_RASTER_EXTS:
        return _error("Unsupported after-cleaning image format.", 400, "Validation Error")

    status_code, data = _call_sidecar_detect(upload_path.read_bytes(), clean_ext)
    if status_code >= 400 or not data.get("success"):
        return (
            jsonify(
                {
                    "yoloAvailable": False,
                    "advisoryOnly": True,
                    "autoResolved": False,
                    "wasteStillDetected": None,
                    "message": (
                        "AI sidecar service is unavailable. Please verify before and after photographs manually."
                    ),
                }
            ),
            200,
        )

    detections = data.get("detections") or []
    total = int(data.get("totalDetections") or len(detections))
    return (
        jsonify(
            {
                "yoloAvailable": True,
                "advisoryOnly": True,
                "autoResolved": False,
                "wasteStillDetected": total > 0,
                "totalDetections": total,
                "detections": detections,
                "annotatedImageUrl": data.get("annotatedImageUrl"),
                "message": (
                    f"Advisory AI check found {total} object(s). Admin review is still required."
                    if total > 0
                    else "Advisory AI check detected 0 objects. Admin approval is still required."
                ),
            }
        ),
        200,
    )
