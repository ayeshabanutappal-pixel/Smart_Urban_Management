"""
Complaints API routes for WasteSmart.

Endpoints:
  GET   /api/complaints                     — List complaints (citizen: own only; admin: all)
  POST  /api/complaints                     — Create a complaint persisted in MySQL
  GET   /api/complaints/<complaint_ref>     — Get single complaint + status logs (owner or admin)
  PATCH /api/complaints/<complaint_ref>     — Update complaint status / worker assignment (admin only)
  PATCH /api/complaints/<complaint_ref>/status — Alias for status updates (admin only)
  GET   /api/complaints/uploads/<filename>  — Serve uploaded complaint images safely

Security guarantees:
  - JWT authentication required for all complaint APIs.
  - Current user and role are always resolved from g.current_user (MySQL User row).
  - Citizens can only view/create their own complaints and cannot modify status/assignments.
  - Client-supplied citizenId, ticket_code, initial status, or initial worker are ignored.
"""
import base64
import binascii
import math
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from flask import Blueprint, current_app, g, jsonify, request, send_from_directory
from sqlalchemy import or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.complaint import (
    COMPLAINT_SEVERITY_VALUES,
    COMPLAINT_STATUS_VALUES,
    WASTE_CATEGORY_VALUES,
    Complaint,
    utcnow,
)
from app.models.complaint_status_log import ComplaintStatusLog
from app.models.notification import Notification
from app.models.user import User
from app.models.worker import Worker
from app.utils.auth_decorators import roles_required

complaints_bp = Blueprint("complaints", __name__, url_prefix="/api/complaints")

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MIME_TO_EXTENSION = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}
DATA_URI_PATTERN = re.compile(
    r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)
SAFE_FILENAME_PATTERN = re.compile(r"^[a-f0-9]{32}\.(png|jpg|jpeg|webp)$")


def _error_response(message: str, status_code: int, error_label: str):
    """Consistent JSON error response matching the project convention."""
    return (
        jsonify(
            {
                "error": error_label,
                "message": message,
                "status": status_code,
            }
        ),
        status_code,
    )


def _upload_folder() -> Path:
    folder = Path(current_app.config["COMPLAINT_UPLOAD_FOLDER"])
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _save_image_bytes(raw_bytes: bytes, ext: str) -> str:
    """Validate byte size, persist image safely to disk, and return its API URL."""
    if not raw_bytes:
        raise ValueError("Uploaded waste image file is empty.")
    if len(raw_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("Waste image exceeds the 10 MB size limit.")
    clean_ext = "jpg" if ext.lower() == "jpeg" else ext.lower()
    if clean_ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Unsupported image format. Please upload PNG, JPG, or WEBP.")

    filename = f"{uuid.uuid4().hex}.{clean_ext}"
    dest = _upload_folder() / filename
    dest.write_bytes(raw_bytes)
    return f"/api/complaints/uploads/{filename}"


def resolve_image_url_from_request(
    payload: dict,
    file_fields: tuple[str, ...] = ("image",),
    url_keys: tuple[str, ...] = ("imageUrl", "image_url"),
    required_message: str = "Please upload or provide a photograph of the waste.",
) -> str:
    """
    Accept either an uploaded multipart image file, a base64 data URI,
    or a safe relative/http(s) image URL string (<= 500 chars).
    """
    uploaded_file = None
    for field in file_fields:
        candidate = request.files.get(field)
        if candidate is not None and candidate.filename:
            uploaded_file = candidate
            break

    if uploaded_file is not None and uploaded_file.filename:
        ext = ""
        if "." in uploaded_file.filename:
            ext = uploaded_file.filename.rsplit(".", 1)[-1].lower()
        if not ext and uploaded_file.mimetype:
            ext = MIME_TO_EXTENSION.get(uploaded_file.mimetype.lower(), "")
        if ext not in ALLOWED_IMAGE_EXTENSIONS and uploaded_file.mimetype:
            ext = MIME_TO_EXTENSION.get(uploaded_file.mimetype.lower(), ext)
        raw_bytes = uploaded_file.read(MAX_IMAGE_BYTES + 1)
        return _save_image_bytes(raw_bytes, ext)

    raw_image_url = ""
    for key in url_keys:
        if payload.get(key) is not None and str(payload.get(key)).strip():
            raw_image_url = str(payload.get(key)).strip()
            break

    if not raw_image_url:
        raise ValueError(required_message)

    if raw_image_url.startswith("data:"):
        match = DATA_URI_PATTERN.match(raw_image_url)
        if not match:
            raise ValueError(
                "Invalid image upload format. Only PNG, JPG, and WEBP images are supported."
            )
        img_ext, b64_data = match.group(1), match.group(2)
        try:
            decoded = base64.b64decode(b64_data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Uploaded image data is corrupted or invalid base64.") from exc
        return _save_image_bytes(decoded, img_ext)

    if not (
        raw_image_url.startswith("/")
        or raw_image_url.startswith("http://")
        or raw_image_url.startswith("https://")
    ):
        raise ValueError("Image URL must be a valid path or HTTP(S) URL.")

    if len(raw_image_url) > 500:
        raise ValueError("Image URL cannot exceed 500 characters.")

    return raw_image_url


def _resolve_image_url_from_request(payload: dict) -> str:
    return resolve_image_url_from_request(payload)


def _parse_bool(val, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val)
    text = str(val).strip().lower()
    if text in {"true", "1", "yes"}:
        return True
    if text in {"false", "0", "no", ""}:
        return False
    raise ValueError("Invalid boolean value.")


def _parse_decimal(
    val,
    field_name: str,
    quantum: str,
    min_val: Decimal | None = None,
    max_val: Decimal | None = None,
) -> Decimal:
    if val is None or val == "":
        raise ValueError(f"{field_name} is required.")
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        raise ValueError(f"{field_name} must be a finite number.")
    try:
        dec = Decimal(str(val)).quantize(Decimal(quantum))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"{field_name} must be a valid number.") from exc
    if min_val is not None and dec < min_val:
        raise ValueError(f"{field_name} must be at least {min_val}.")
    if max_val is not None and dec > max_val:
        raise ValueError(f"{field_name} must be at most {max_val}.")
    return dec


def _find_complaint_by_ref(complaint_ref: str) -> Complaint | None:
    """Resolve a complaint by ticket_code (e.g. WS-2026-1001) or numeric PK."""
    clean_ref = (complaint_ref or "").strip()
    if not clean_ref:
        return None

    complaint = (
        Complaint.query.options(
            joinedload(Complaint.citizen),
            joinedload(Complaint.assigned_worker),
        )
        .filter(Complaint.ticket_code == clean_ref)
        .first()
    )
    if complaint is not None:
        return complaint

    if clean_ref.isdigit():
        return (
            Complaint.query.options(
                joinedload(Complaint.citizen),
                joinedload(Complaint.assigned_worker),
            )
            .filter(Complaint.id == int(clean_ref))
            .first()
        )
    return None


def _assign_unique_ticket_code(complaint: Complaint) -> None:
    """Generate a unique sequential WS-YYYY-NNNN ticket code after flush."""
    year = datetime.now(timezone.utc).year
    seq = 1000 + complaint.id
    candidate = f"WS-{year}-{seq}"
    while db.session.query(Complaint.id).filter_by(ticket_code=candidate).first() is not None:
        seq += 1
        candidate = f"WS-{year}-{seq}"
    complaint.ticket_code = candidate
    db.session.flush()


def _parse_create_payload() -> dict:
    """Extract normalized request payload from either multipart form or JSON."""
    if request.content_type and "multipart/form-data" in request.content_type.lower():
        data = dict(request.form)
        if "latitude" in data or "longitude" in data:
            data["coordinates"] = {
                "lat": data.get("latitude"),
                "lng": data.get("longitude"),
            }
        return data

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValueError("Request body must be valid JSON.")
    return payload


@complaints_bp.get("/uploads/<string:filename>")
def serve_complaint_upload(filename: str):
    """Serve stored complaint image uploads safely without path traversal."""
    if not SAFE_FILENAME_PATTERN.match(filename):
        return _error_response("Invalid image filename.", 404, "Not Found")

    upload_dir = _upload_folder()
    file_path = upload_dir / filename
    if not file_path.is_file():
        return _error_response("Image not found.", 404, "Not Found")

    return send_from_directory(str(upload_dir), filename)


@complaints_bp.get("")
@roles_required("citizen", "admin", "worker")
def list_complaints():
    """
    List complaints scoped strictly by the authenticated JWT user's role.

    Citizens receive only their own complaints.
    Workers receive only complaints assigned to them.
    Admins receive all complaints and may optionally filter by status, category, ward, or search.
    """
    current_user = g.current_user

    query = Complaint.query.options(
        joinedload(Complaint.citizen),
        joinedload(Complaint.assigned_worker),
    )

    if current_user.role == "citizen":
        query = query.filter(Complaint.citizen_id == current_user.id)
    elif current_user.role == "worker":
        worker_profile = current_user.worker_profile
        if worker_profile is None or not worker_profile.is_active:
            return _error_response(
                "Worker profile not found or inactive.",
                403,
                "Forbidden",
            )
        query = query.filter(Complaint.assigned_worker_id == worker_profile.id)

    status_filter = request.args.get("status", "").strip()
    if status_filter and status_filter != "All":
        if status_filter not in COMPLAINT_STATUS_VALUES:
            return _error_response(
                f"Invalid status filter '{status_filter}'.",
                400,
                "Validation Error",
            )
        query = query.filter(Complaint.status == status_filter)

    category_filter = request.args.get("category", "").strip()
    if category_filter and category_filter != "All":
        if category_filter not in WASTE_CATEGORY_VALUES:
            return _error_response(
                f"Invalid category filter '{category_filter}'.",
                400,
                "Validation Error",
            )
        query = query.filter(Complaint.category == category_filter)

    ward_filter = request.args.get("ward", "").strip()
    if ward_filter and ward_filter != "All":
        query = query.filter(Complaint.ward == ward_filter)

    search_filter = (request.args.get("search") or request.args.get("q") or "").strip()
    if search_filter:
        like_term = f"%{search_filter}%"
        search_clauses = [
            Complaint.ticket_code.ilike(like_term),
            Complaint.title.ilike(like_term),
            Complaint.location_name.ilike(like_term),
            Complaint.ward.ilike(like_term),
        ]
        if current_user.role == "admin":
            query = query.outerjoin(User, Complaint.citizen_id == User.id).outerjoin(
                Worker, Complaint.assigned_worker_id == Worker.id
            )
            search_clauses.extend(
                [
                    User.name.ilike(like_term),
                    Worker.name.ilike(like_term),
                ]
            )
        query = query.filter(or_(*search_clauses))

    complaints = query.order_by(
        Complaint.reported_at.desc(), Complaint.id.desc()
    ).all()

    return (
        jsonify(
            {
                "complaints": [c.to_dict() for c in complaints],
                "total": len(complaints),
            }
        ),
        200,
    )


@complaints_bp.get("/<string:complaint_ref>")
@roles_required("citizen", "admin", "worker")
def get_complaint_detail(complaint_ref: str):
    """
    Return a single complaint and its status logs.

    Citizens may access only complaints they own (403 otherwise).
    Workers may access only complaints assigned to them (403 otherwise).
    Admins may access any complaint.
    """
    current_user = g.current_user
    complaint = _find_complaint_by_ref(complaint_ref)

    if complaint is None:
        return _error_response("Complaint not found.", 404, "Not Found")

    if current_user.role == "citizen" and complaint.citizen_id != current_user.id:
        return _error_response(
            "You do not have permission to access this complaint.",
            403,
            "Forbidden",
        )

    if current_user.role == "worker":
        worker_profile = current_user.worker_profile
        if (
            worker_profile is None
            or not worker_profile.is_active
            or complaint.assigned_worker_id != worker_profile.id
        ):
            return _error_response(
                "You do not have permission to access this complaint.",
                403,
                "Forbidden",
            )

    return (
        jsonify(
            {
                "complaint": complaint.to_dict(),
                "statusLogs": [log.to_dict() for log in complaint.status_logs],
            }
        ),
        200,
    )


@complaints_bp.post("")
@roles_required("citizen", "admin")
def create_complaint():
    """
    Create and persist a new garbage complaint in MySQL.

    Security guarantee: citizen_id is derived strictly from the verified JWT user,
    and initial status is always 'Pending' with no assigned worker.
    """
    current_user = g.current_user

    try:
        payload = _parse_create_payload()
    except ValueError as exc:
        return _error_response(str(exc), 400, "Bad Request")

    title = str(payload.get("title", "")).strip()
    description = str(payload.get("description", "")).strip()
    category = str(payload.get("category", "")).strip()
    severity = str(payload.get("severity") or "Medium").strip()
    location_name = str(
        payload.get("locationName")
        if payload.get("locationName") is not None
        else payload.get("location_name", "")
    ).strip()
    ward = str(payload.get("ward", "")).strip()

    if len(title) < 3 or len(title) > 200:
        return _error_response(
            "Complaint title must be between 3 and 200 characters.",
            400,
            "Validation Error",
        )
    if len(description) < 3 or len(description) > 5000:
        return _error_response(
            "Complaint description must be between 3 and 5000 characters.",
            400,
            "Validation Error",
        )
    if category not in WASTE_CATEGORY_VALUES:
        return _error_response(
            f"Category must be one of: {', '.join(WASTE_CATEGORY_VALUES)}.",
            400,
            "Validation Error",
        )
    if severity not in COMPLAINT_SEVERITY_VALUES:
        return _error_response(
            f"Severity must be one of: {', '.join(COMPLAINT_SEVERITY_VALUES)}.",
            400,
            "Validation Error",
        )
    if len(location_name) < 2 or len(location_name) > 255:
        return _error_response(
            "Location name must be between 2 and 255 characters.",
            400,
            "Validation Error",
        )
    if len(ward) < 2 or len(ward) > 120:
        return _error_response(
            "Ward / zone must be between 2 and 120 characters.",
            400,
            "Validation Error",
        )

    coords_raw = payload.get("coordinates")
    if isinstance(coords_raw, dict):
        raw_lat = coords_raw.get("lat")
        raw_lng = coords_raw.get("lng")
    else:
        raw_lat = payload.get("latitude")
        raw_lng = payload.get("longitude")

    try:
        latitude = _parse_decimal(
            raw_lat, "Latitude", "0.000001", Decimal("-90"), Decimal("90")
        )
        longitude = _parse_decimal(
            raw_lng, "Longitude", "0.000001", Decimal("-180"), Decimal("180")
        )
        ai_detected = _parse_bool(
            payload.get("aiDetected")
            if "aiDetected" in payload
            else payload.get("ai_detected"),
            default=False,
        )
        raw_conf = (
            payload.get("aiConfidence")
            if "aiConfidence" in payload
            else payload.get("ai_confidence", 0)
        )
        ai_confidence = int(raw_conf if raw_conf not in (None, "") else 0)
        if not (0 <= ai_confidence <= 100):
            raise ValueError("AI confidence must be between 0 and 100.")

        raw_weight = (
            payload.get("estimatedWeightKg")
            if "estimatedWeightKg" in payload
            else payload.get("estimated_weight_kg", "0.00")
        )
        estimated_weight = _parse_decimal(
            raw_weight if raw_weight not in (None, "") else "0.00",
            "Estimated weight",
            "0.01",
            Decimal("0"),
            Decimal("100000"),
        )
        image_url = _resolve_image_url_from_request(payload)
    except (ValueError, TypeError) as exc:
        return _error_response(str(exc), 400, "Validation Error")

    temp_ticket = f"TMP-{uuid.uuid4().hex[:24]}"
    complaint = Complaint(
        ticket_code=temp_ticket,
        citizen_id=current_user.id,
        assigned_worker_id=None,
        title=title,
        description=description,
        category=category,
        ai_detected=ai_detected,
        ai_confidence=ai_confidence,
        status="Pending",
        severity=severity,
        location_name=location_name,
        ward=ward,
        latitude=latitude,
        longitude=longitude,
        image_url=image_url,
        estimated_weight_kg=estimated_weight,
    )

    try:
        db.session.add(complaint)
        db.session.flush()
        _assign_unique_ticket_code(complaint)

        status_log = ComplaintStatusLog(
            complaint_id=complaint.id,
            changed_by_user_id=current_user.id,
            status="Pending",
            note=f"Report submitted: {complaint.title}"[:255],
        )
        db.session.add(status_log)

        # Notify submitting user
        db.session.add(
            Notification(
                user_id=current_user.id,
                complaint_id=complaint.id,
                title=f"Complaint {complaint.ticket_code} Submitted",
                message=f"{complaint.category} waste reported at {complaint.location_name}.",
                type="complaint",
            )
        )

        # Notify active municipal administrators so dashboards and alert bells stay live
        admin_users = User.query.filter(
            User.role == "admin",
            User.is_active.is_(True),
            User.id != current_user.id,
        ).all()
        for admin_user in admin_users:
            db.session.add(
                Notification(
                    user_id=admin_user.id,
                    complaint_id=complaint.id,
                    title=f"New Complaint {complaint.ticket_code} Submitted",
                    message=(
                        f"{current_user.name} reported {complaint.category} waste "
                        f"at {complaint.location_name}."
                    ),
                    type="complaint",
                )
            )

        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _error_response(
            "Unable to save complaint to database.",
            500,
            "Database Error",
        )

    return (
        jsonify(
            {
                "complaint": complaint.to_dict(),
                "message": "Complaint submitted successfully.",
            }
        ),
        201,
    )


@complaints_bp.patch("/<string:complaint_ref>")
@complaints_bp.patch("/<string:complaint_ref>/status")
@roles_required("admin")
def update_complaint(complaint_ref: str):
    """
    Update complaint status, worker assignment, or resolution notes (admin only).

    Citizens calling this endpoint receive 403 Forbidden via @roles_required("admin").
    Records an audit entry in complaint_status_logs and notifies the complaint's citizen.
    """
    current_user = g.current_user
    complaint = _find_complaint_by_ref(complaint_ref)

    if complaint is None:
        return _error_response("Complaint not found.", 404, "Not Found")

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response("Request body must be valid JSON.", 400, "Bad Request")

    has_status = "status" in payload
    has_worker = "assignedWorkerId" in payload or "assigned_worker_id" in payload
    has_notes = "resolutionNotes" in payload or "resolution_notes" in payload
    has_note = "note" in payload

    if not (has_status or has_worker or has_notes or has_note):
        return _error_response(
            "No valid update fields were provided.",
            400,
            "Validation Error",
        )

    prev_status = complaint.status
    prev_worker_id = complaint.assigned_worker_id
    assigned_worker_obj: Worker | None = complaint.assigned_worker

    if has_worker:
        raw_worker = (
            payload.get("assignedWorkerId")
            if "assignedWorkerId" in payload
            else payload.get("assigned_worker_id")
        )
        if raw_worker is None or str(raw_worker).strip() == "":
            complaint.assigned_worker_id = None
            assigned_worker_obj = None
        else:
            try:
                worker_id = int(str(raw_worker).strip())
            except ValueError:
                return _error_response(
                    "assignedWorkerId must be a valid numeric worker ID.",
                    400,
                    "Validation Error",
                )
            worker = db.session.get(Worker, worker_id)
            if worker is None or not worker.is_active:
                return _error_response(
                    "Assigned sanitation worker was not found.",
                    404,
                    "Not Found",
                )
            complaint.assigned_worker_id = worker.id
            assigned_worker_obj = worker

    if has_status:
        new_status = str(payload.get("status", "")).strip()
        if new_status not in COMPLAINT_STATUS_VALUES:
            return _error_response(
                f"Status must be one of: {', '.join(COMPLAINT_STATUS_VALUES)}.",
                400,
                "Validation Error",
            )
        complaint.status = new_status

    if has_notes:
        raw_notes = (
            payload.get("resolutionNotes")
            if "resolutionNotes" in payload
            else payload.get("resolution_notes")
        )
        complaint.resolution_notes = (
            str(raw_notes).strip() if raw_notes is not None and str(raw_notes).strip() else None
        )

    if complaint.status == "Resolved" and not complaint.resolution_notes:
        complaint.resolution_notes = "Site cleared and verified clean by municipal team."

    status_changed = complaint.status != prev_status
    worker_changed = complaint.assigned_worker_id != prev_worker_id

    explicit_note = str(payload.get("note", "")).strip() if has_note else ""
    if status_changed or worker_changed or explicit_note:
        if explicit_note:
            log_note = explicit_note[:255]
        elif complaint.status == "Resolved":
            log_note = (complaint.resolution_notes or "Complaint marked as Resolved.")[:255]
        elif worker_changed and assigned_worker_obj is not None:
            log_note = f"Dispatched to {assigned_worker_obj.name}."[:255]
        elif worker_changed and assigned_worker_obj is None:
            log_note = "Worker assignment cleared."
        else:
            log_note = f"Status changed to {complaint.status}."

        complaint.updated_at = utcnow()
        db.session.add(
            ComplaintStatusLog(
                complaint_id=complaint.id,
                changed_by_user_id=current_user.id,
                status=complaint.status,
                note=log_note,
            )
        )

        # Notify the citizen who filed the complaint
        if status_changed or worker_changed:
            if complaint.status == "Resolved":
                notif_title = f"Complaint {complaint.ticket_code} Resolved"
                notif_msg = (
                    complaint.resolution_notes
                    or "Municipal team verified the location is clear and closed the ticket."
                )
                notif_type = "resolved"
            elif worker_changed and assigned_worker_obj is not None:
                notif_title = f"Worker Assigned to {complaint.ticket_code}"
                notif_msg = (
                    f"{assigned_worker_obj.name} has been dispatched to handle "
                    f"{complaint.ticket_code}."
                )
                notif_type = "assignment"
            else:
                notif_title = f"Complaint {complaint.ticket_code} Updated"
                notif_msg = f"Complaint status changed to {complaint.status}."
                notif_type = "assignment"

            db.session.add(
                Notification(
                    user_id=complaint.citizen_id,
                    complaint_id=complaint.id,
                    title=notif_title[:160],
                    message=notif_msg,
                    type=notif_type,
                )
            )

            # Update worker availability and notify linked worker account on dispatch
            if worker_changed and assigned_worker_obj is not None:
                complaint.rejection_reason = None
                if assigned_worker_obj.availability == "Available":
                    assigned_worker_obj.availability = "On Duty"
                if assigned_worker_obj.user_id is not None:
                    db.session.add(
                        Notification(
                            user_id=assigned_worker_obj.user_id,
                            complaint_id=complaint.id,
                            title=f"New Task Assigned: {complaint.ticket_code}"[:160],
                            message=f"{complaint.category} waste at {complaint.location_name} ({complaint.ward}).",
                            type="assignment",
                        )
                    )

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _error_response(
            "Unable to update complaint in database.",
            500,
            "Database Error",
        )

    # Refresh to ensure relationships reflect newly assigned worker
    db.session.refresh(complaint)
    return (
        jsonify(
            {
                "complaint": complaint.to_dict(),
                "message": "Complaint updated successfully.",
            }
        ),
        200,
    )


@complaints_bp.post("/<string:complaint_ref>/verify")
@complaints_bp.patch("/<string:complaint_ref>/verify")
@roles_required("admin")
def verify_complaint(complaint_ref: str):
    """
    Admin verification of a worker-submitted cleanup completion.

    - decision='approve': marks complaint Resolved, records verified_at,
      updates worker availability back to Available if no active tasks remain,
      and notifies citizen & worker.
    - decision='reject': requires non-empty rejectionReason, returns task to the
      assigned worker with status='Assigned', and notifies the worker.
    """
    current_user = g.current_user
    complaint = _find_complaint_by_ref(complaint_ref)
    if complaint is None:
        return _error_response("Complaint not found.", 404, "Not Found")

    if complaint.status != "Pending Verification":
        return _error_response(
            "Only complaints in 'Pending Verification' status can be approved or rejected.",
            400,
            "Validation Error",
        )

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response("Request body must be valid JSON.", 400, "Bad Request")

    decision = str(payload.get("decision") or "").strip().lower()
    if decision not in {"approve", "reject"}:
        return _error_response(
            "decision must be either 'approve' or 'reject'.",
            400,
            "Validation Error",
        )

    now = utcnow()
    worker = complaint.assigned_worker

    if decision == "approve":
        note = str(payload.get("note") or "").strip()
        complaint.status = "Resolved"
        complaint.verified_at = now
        complaint.rejection_reason = None
        complaint.resolution_notes = (
            note
            or complaint.completion_notes
            or "Site cleared and verified clean by municipal administrator."
        )
        complaint.updated_at = now

        db.session.add(
            ComplaintStatusLog(
                complaint_id=complaint.id,
                changed_by_user_id=current_user.id,
                status="Resolved",
                note=(complaint.resolution_notes or "Verified clean by admin.")[:255],
            )
        )
        db.session.add(
            Notification(
                user_id=complaint.citizen_id,
                complaint_id=complaint.id,
                title=f"Complaint {complaint.ticket_code} Resolved"[:160],
                message=complaint.resolution_notes,
                type="resolved",
            )
        )
        if worker is not None:
            remaining_active = Complaint.query.filter(
                Complaint.assigned_worker_id == worker.id,
                Complaint.id != complaint.id,
                Complaint.status.in_(("Assigned", "In Progress")),
            ).count()
            if remaining_active == 0 and worker.availability == "On Duty":
                worker.availability = "Available"
            if worker.user_id is not None:
                db.session.add(
                    Notification(
                        user_id=worker.user_id,
                        complaint_id=complaint.id,
                        title=f"Task Approved: {complaint.ticket_code}"[:160],
                        message=f"Admin approved your cleanup at {complaint.location_name}.",
                        type="resolved",
                    )
                )
        msg = "Complaint verified and marked as Resolved."
    else:
        reason = str(
            payload.get("rejectionReason")
            if payload.get("rejectionReason") is not None
            else payload.get("rejection_reason", "")
        ).strip()
        if len(reason) < 3:
            return _error_response(
                "A rejection reason of at least 3 characters is required.",
                400,
                "Validation Error",
            )

        complaint.status = "Assigned"
        complaint.rejection_reason = reason
        complaint.verified_at = None
        complaint.updated_at = now

        db.session.add(
            ComplaintStatusLog(
                complaint_id=complaint.id,
                changed_by_user_id=current_user.id,
                status="Assigned",
                note=f"Verification rejected: {reason}"[:255],
            )
        )
        db.session.add(
            Notification(
                user_id=complaint.citizen_id,
                complaint_id=complaint.id,
                title=f"Cleanup Re-opened: {complaint.ticket_code}"[:160],
                message="Municipal admin requested follow-up cleanup before final closure.",
                type="assignment",
            )
        )
        if worker is not None:
            if worker.availability == "Available":
                worker.availability = "On Duty"
            if worker.user_id is not None:
                db.session.add(
                    Notification(
                        user_id=worker.user_id,
                        complaint_id=complaint.id,
                        title=f"Rework Required: {complaint.ticket_code}"[:160],
                        message=f"Rejected by admin: {reason}",
                        type="assignment",
                    )
                )
        msg = "Verification rejected. Task returned to assigned worker."

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _error_response(
            "Unable to save verification decision.",
            500,
            "Database Error",
        )

    db.session.refresh(complaint)
    return (
        jsonify(
            {
                "complaint": complaint.to_dict(),
                "message": msg,
            }
        ),
        200,
    )

