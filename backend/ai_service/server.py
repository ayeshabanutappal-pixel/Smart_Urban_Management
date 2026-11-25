"""
WasteSmart AI Sidecar HTTP Service (localhost-only: 127.0.0.1:5001).

Uses the AI module and YOLO model stored inside this project:
  backend/ai_module/ai/detector.py
  backend/ai_module/yolov8n.pt

Run using a Python environment with the AI dependencies installed:
  python backend/ai_service/server.py
"""
from __future__ import annotations

import base64
import binascii
from email.parser import BytesParser
from email.policy import default as email_policy
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sys
import uuid

# ---------------------------------------------------------------------------
# Configuration (strictly localhost-bound, never 0.0.0.0)
# ---------------------------------------------------------------------------

HOST = "127.0.0.1"
PORT = int(os.getenv("AI_SIDECAR_PORT", "5001"))

DEFAULT_AI_MODULE_DIR = str(
    Path(__file__).resolve().parent.parent / "ai_module"
)
AI_MODULE_DIR = os.path.abspath(
    os.getenv("AI_MODULE_DIR", DEFAULT_AI_MODULE_DIR)
)
YOLO_MODEL_PATH = os.path.abspath(
    os.getenv("YOLO_MODEL_PATH", os.path.join(AI_MODULE_DIR, "yolov8n.pt"))
)

SERVICE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SERVICE_DIR.parent
TMP_UPLOAD_DIR = Path(
    os.getenv("AI_SIDECAR_TMP_DIR", str(BACKEND_DIR / "uploads" / "ai_sidecar_tmp"))
)
OUTPUT_DIR = Path(
    os.getenv("AI_SIDECAR_OUTPUT_DIR", str(BACKEND_DIR / "uploads" / "ai_outputs"))
)

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
SAFE_OUTPUT_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")

# ---------------------------------------------------------------------------
# Import unmodified external ai.detector module & initialize model explicitly
# ---------------------------------------------------------------------------

if AI_MODULE_DIR not in sys.path:
    sys.path.insert(0, AI_MODULE_DIR)

import cv2  # noqa: E402
from ai.detector import detect_waste, get_model  # noqa: E402

_MODEL_INITIALIZED = False


def ensure_model_loaded() -> None:
    """Explicitly load yolov8n.pt using its absolute path before any inference."""
    global _MODEL_INITIALIZED
    if not os.path.isfile(YOLO_MODEL_PATH):
        raise FileNotFoundError(f"YOLO model weights not found at '{YOLO_MODEL_PATH}'.")
    get_model(YOLO_MODEL_PATH)
    _MODEL_INITIALIZED = True


def _extract_upload_from_multipart(
    raw_body: bytes, content_type: str
) -> tuple[bytes, str]:
    """Parse multipart/form-data body using stdlib email.parser."""
    header_block = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
    msg = BytesParser(policy=email_policy).parsebytes(header_block + raw_body)
    if not msg.is_multipart():
        raise ValueError("Request body is not valid multipart/form-data.")

    for part in msg.iter_parts():
        field_name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        if field_name in {"image", "file"} or filename:
            raw_bytes = part.get_payload(decode=True) or b""
            mime = (part.get_content_type() or "").lower()
            ext = ""
            if filename and "." in filename:
                ext = filename.rsplit(".", 1)[-1].lower()
            if ext not in ALLOWED_EXTENSIONS and mime in MIME_TO_EXT:
                ext = MIME_TO_EXT[mime]
            return raw_bytes, ext

    raise ValueError("No image field found in multipart upload.")


def _extract_upload_from_json(raw_body: bytes) -> tuple[bytes, str]:
    """Accept JSON payload with imageBase64 (+ optional filename/ext)."""
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid JSON request body.") from exc

    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    raw_b64 = str(payload.get("imageBase64") or "").strip()
    if not raw_b64:
        raise ValueError("imageBase64 is required.")

    if raw_b64.startswith("data:"):
        match = re.match(
            r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$",
            raw_b64,
            re.IGNORECASE,
        )
        if not match:
            raise ValueError("Unsupported data URI format. Only JPG, JPEG, PNG, and WEBP are allowed.")
        ext = match.group(1).lower()
        b64_payload = match.group(2)
    else:
        filename = str(payload.get("filename") or "")
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        b64_payload = raw_b64

    try:
        decoded = base64.b64decode(b64_payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 image data.") from exc

    return decoded, ext


class AiSidecarHandler(BaseHTTPRequestHandler):
    """Thread-safe HTTP handler for localhost-only YOLO inference."""

    server_version = "WasteSmartAISidecar/1.0"

    def log_message(self, format: str, *args) -> None:
        # Keep console logs concise without exposing payload data
        print(f"[AI Sidecar] {self.address_string()} - {format % args}")

    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            model_exists = os.path.isfile(YOLO_MODEL_PATH)
            self._send_json(
                HTTPStatus.OK,
                {
                    "status": "ok" if model_exists else "degraded",
                    "service": "wastesmart-ai-sidecar",
                    "modelLoaded": _MODEL_INITIALIZED,
                    "modelConfigured": model_exists,
                },
            )
            return

        if self.path.startswith("/outputs/"):
            filename = self.path[len("/outputs/"):].split("?", 1)[0]
            if not filename or not SAFE_OUTPUT_NAME_RE.match(filename) or ".." in filename:
                self._send_json(HTTPStatus.NOT_FOUND, {"success": False, "error": "Output not found."})
                return
            target = (OUTPUT_DIR / filename).resolve()
            if not str(target).startswith(str(OUTPUT_DIR.resolve())) or not target.is_file():
                self._send_json(HTTPStatus.NOT_FOUND, {"success": False, "error": "Output not found."})
                return
            data = target.read_bytes()
            ext = target.suffix.lower().lstrip(".")
            ctype = f"image/{'jpeg' if ext in {'jpg', 'jpeg'} else ext}"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"success": False, "error": "Endpoint not found."})

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/detect":
            self._send_json(HTTPStatus.NOT_FOUND, {"success": False, "error": "Endpoint not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"success": False, "error": "Invalid Content-Length."})
            return

        if content_length <= 0:
            self._send_json(HTTPStatus.BAD_REQUEST, {"success": False, "error": "Empty request body."})
            return

        if content_length > MAX_IMAGE_BYTES + 2 * 1024 * 1024:
            self._send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"success": False, "error": "Image upload exceeds the 10 MB maximum size."},
            )
            return

        raw_body = self.rfile.read(content_length)
        content_type = (self.headers.get("Content-Type") or "").lower()

        try:
            if "multipart/form-data" in content_type:
                image_bytes, ext = _extract_upload_from_multipart(raw_body, self.headers.get("Content-Type", ""))
            elif "application/json" in content_type:
                image_bytes, ext = _extract_upload_from_json(raw_body)
            else:
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"success": False, "error": "Content-Type must be multipart/form-data or application/json."},
                )
                return
        except ValueError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"success": False, "error": str(exc)})
            return

        if not image_bytes:
            self._send_json(HTTPStatus.BAD_REQUEST, {"success": False, "error": "Uploaded image is empty."})
            return
        if len(image_bytes) > MAX_IMAGE_BYTES:
            self._send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"success": False, "error": "Image exceeds the 10 MB size limit."},
            )
            return

        clean_ext = "jpg" if ext == "jpeg" else ext
        if clean_ext not in ALLOWED_EXTENSIONS:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "success": False,
                    "error": "Unsupported image format. Only JPG, JPEG, PNG, and WEBP are supported.",
                },
            )
            return

        TMP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        tmp_path = TMP_UPLOAD_DIR / f"{uuid.uuid4().hex}.{clean_ext}"
        try:
            tmp_path.write_bytes(image_bytes)

            # Validate raster readability & dimensions via OpenCV before calling detect_waste
            decoded_img = cv2.imread(str(tmp_path))
            if decoded_img is None:
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {
                        "success": False,
                        "error": "Invalid or corrupted image file. Unable to decode raster image.",
                    },
                )
                return

            height, width = decoded_img.shape[:2]
            ensure_model_loaded()
            result = detect_waste(
                str(tmp_path),
                output_dir=str(OUTPUT_DIR),
            )

            if not result.get("success"):
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {
                        "success": False,
                        "detected": False,
                        "detections": [],
                        "totalDetections": 0,
                        "error": result.get("error") or "Detection failed.",
                    },
                )
                return

            detections = result.get("detections") or []
            total = int(result.get("total_detections") or len(detections))
            annotated_path = result.get("annotated_image")
            annotated_filename = Path(annotated_path).name if annotated_path else None

            self._send_json(
                HTTPStatus.OK,
                {
                    "success": True,
                    "detected": total > 0,
                    "detections": detections,
                    "totalDetections": total,
                    "imageDimensions": [int(width), int(height)],
                    "annotatedImageFilename": annotated_filename,
                    "annotatedImageUrl": f"/outputs/{annotated_filename}" if annotated_filename else None,
                    "error": None,
                },
            )
        except FileNotFoundError as exc:
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"success": False, "error": str(exc)})
        except Exception as exc:
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"success": False, "error": f"AI sidecar error: {str(exc)}"},
            )
        finally:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except OSError:
                pass


def main() -> None:
    print(f"[AI Sidecar] Loading model from: {YOLO_MODEL_PATH}")
    ensure_model_loaded()
    server = ThreadingHTTPServer((HOST, PORT), AiSidecarHandler)
    print(f"[AI Sidecar] Listening strictly on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[AI Sidecar] Shutting down.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
