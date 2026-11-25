"""
Worker Portal API routes for WasteSmart (role='worker' only).

Endpoints:
  GET   /api/worker/tasks                     – List ONLY tasks assigned to current worker
  PATCH /api/worker/tasks/<ref>/start         – Move Assigned -> In Progress
  POST  /api/worker/tasks/<ref>/complete      – Upload after-photo + notes -> Pending Verification

Security guarantees:
  - Protected by @roles_required("worker") on every route.
  - Worker identity is always resolved strictly from g.current_user.worker_profile in MySQL.
  - Workers can NEVER view or modify tasks assigned to other workers (403 Forbidden).
  - Workers can NEVER mark any complaint as 'Resolved' directly.
"""
from flask import Blueprint, g, jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.complaint import Complaint, utcnow
from app.models.complaint_status_log import ComplaintStatusLog
from app.models.notification import Notification
from app.models.user import User
from app.models.worker import Worker
from app.routes.complaints import (
    _error_response,
    _find_complaint_by_ref,
    resolve_image_url_from_request,
)
from app.utils.auth_decorators import roles_required

worker_portal_bp = Blueprint("worker_portal", __name__, url_prefix="/api/worker")


def _resolve_active_worker() -> Worker | None:
    user = g.current_user
    worker = user.worker_profile
    if worker is None or not worker.is_active:
        return None
    return worker


def _parse_payload() -> dict:
    if request.content_type and "multipart/form-data" in request.content_type.lower():
        return dict(request.form)
    payload = request.get_json(silent=True)
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise ValueError("Request body must be valid JSON.")
    return payload


@worker_portal_bp.get("/tasks")
@roles_required("worker")
def list_worker_tasks():
    """Return complaints assigned exclusively to the authenticated worker."""
    worker = _resolve_active_worker()
    if worker is None:
        return _error_response("Active worker profile not found.", 403, "Forbidden")

    tasks = (
        Complaint.query.options(
            joinedload(Complaint.citizen),
            joinedload(Complaint.assigned_worker),
        )
        .filter(Complaint.assigned_worker_id == worker.id)
        .order_by(Complaint.updated_at.desc(), Complaint.id.desc())
        .all()
    )

    counts = {
        "assigned": sum(1 for t in tasks if t.status == "Assigned"),
        "inProgress": sum(1 for t in tasks if t.status == "In Progress"),
        "pendingVerification": sum(1 for t in tasks if t.status == "Pending Verification"),
        "completed": sum(1 for t in tasks if t.status == "Resolved"),
        "total": len(tasks),
    }

    return (
        jsonify(
            {
                "worker": worker.to_dict(
                    active_tasks=counts["assigned"] + counts["inProgress"],
                    completed_count=counts["completed"],
                ),
                "tasks": [t.to_dict() for t in tasks],
                "counts": counts,
            }
        ),
        200,
    )


@worker_portal_bp.patch("/tasks/<string:complaint_ref>/start")
@roles_required("worker")
def start_worker_task(complaint_ref: str):
    """Transition an Assigned task belonging to the current worker to 'In Progress'."""
    worker = _resolve_active_worker()
    if worker is None:
        return _error_response("Active worker profile not found.", 403, "Forbidden")

    complaint = _find_complaint_by_ref(complaint_ref)
    if complaint is None:
        return _error_response("Task not found.", 404, "Not Found")

    if complaint.assigned_worker_id != worker.id:
        return _error_response(
            "You do not have permission to start a task assigned to another worker.",
            403,
            "Forbidden",
        )

    if complaint.status != "Assigned":
        return _error_response(
            f"Only 'Assigned' tasks can be started (current status: '{complaint.status}').",
            400,
            "Validation Error",
        )

    now = utcnow()
    complaint.status = "In Progress"
    complaint.updated_at = now
    if worker.availability == "Available":
        worker.availability = "On Duty"

    db.session.add(
        ComplaintStatusLog(
            complaint_id=complaint.id,
            changed_by_user_id=g.current_user.id,
            status="In Progress",
            note=f"Cleanup started by {worker.name}."[:255],
        )
    )
    db.session.add(
        Notification(
            user_id=complaint.citizen_id,
            complaint_id=complaint.id,
            title=f"Cleanup Started: {complaint.ticket_code}"[:160],
            message=f"{worker.name} is on site cleaning {complaint.location_name}.",
            type="assignment",
        )
    )

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _error_response("Unable to start task.", 500, "Database Error")

    db.session.refresh(complaint)
    return (
        jsonify(
            {
                "task": complaint.to_dict(),
                "message": "Task started.",
            }
        ),
        200,
    )


@worker_portal_bp.post("/tasks/<string:complaint_ref>/complete")
@roles_required("worker")
def submit_task_completion(complaint_ref: str):
    """
    Submit an after-cleaning photograph and optional short completion notes.
    Always sets status to 'Pending Verification' — workers cannot mark 'Resolved'.
    """
    worker = _resolve_active_worker()
    if worker is None:
        return _error_response("Active worker profile not found.", 403, "Forbidden")

    complaint = _find_complaint_by_ref(complaint_ref)
    if complaint is None:
        return _error_response("Task not found.", 404, "Not Found")

    if complaint.assigned_worker_id != worker.id:
        return _error_response(
            "You do not have permission to complete a task assigned to another worker.",
            403,
            "Forbidden",
        )

    if complaint.status != "In Progress":
        return _error_response(
            "Please tap 'Start Task' before submitting cleanup completion.",
            400,
            "Validation Error",
        )

    try:
        payload = _parse_payload()
        after_image_url = resolve_image_url_from_request(
            payload,
            file_fields=("afterImage", "image"),
            url_keys=("afterImageUrl", "after_image_url", "imageUrl"),
            required_message="Please upload an after-cleaning photograph before submitting.",
        )
    except ValueError as exc:
        return _error_response(str(exc), 400, "Validation Error")

    raw_notes = (
        payload.get("completionNotes")
        if payload.get("completionNotes") is not None
        else payload.get("completion_notes", "")
    )
    completion_notes = str(raw_notes or "").strip()[:1000] or None

    now = utcnow()
    complaint.after_image_url = after_image_url
    complaint.completion_notes = completion_notes
    complaint.rejection_reason = None
    complaint.completed_at = now
    complaint.updated_at = now
    complaint.status = "Pending Verification"

    log_note = (
        f"Completion submitted by {worker.name}: {completion_notes}"
        if completion_notes
        else f"Completion photo submitted by {worker.name} for admin verification."
    )
    db.session.add(
        ComplaintStatusLog(
            complaint_id=complaint.id,
            changed_by_user_id=g.current_user.id,
            status="Pending Verification",
            note=log_note[:255],
        )
    )

    # Notify active admins that cleanup proof awaits review
    active_admins = User.query.filter(
        User.role == "admin", User.is_active.is_(True)
    ).all()
    for admin_user in active_admins:
        db.session.add(
            Notification(
                user_id=admin_user.id,
                complaint_id=complaint.id,
                title=f"Verification Required: {complaint.ticket_code}"[:160],
                message=f"{worker.name} submitted cleanup photo for {complaint.location_name}.",
                type="assignment",
            )
        )

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _error_response("Unable to submit task completion.", 500, "Database Error")

    db.session.refresh(complaint)
    return (
        jsonify(
            {
                "task": complaint.to_dict(),
                "message": "Completion submitted for admin verification.",
            }
        ),
        200,
    )
