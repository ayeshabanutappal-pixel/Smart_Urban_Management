"""
Workers management API routes for WasteSmart.

Endpoints (all require JWT authentication and role='admin'):
  GET    /api/workers                      – List workers (?active=true filters to active)
  POST   /api/workers                      – Create worker (+ optional Worker Portal login account)
  GET    /api/workers/<id>                 – Get single worker details
  PATCH  /api/workers/<id>                 – Edit worker details / provision or reset login
  PATCH  /api/workers/<id>/availability    – Update availability status
  PATCH  /api/workers/<id>/toggle-active   – Activate / deactivate worker & linked user login
"""
import re

from flask import Blueprint, jsonify, request
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.complaint import Complaint
from app.models.user import User
from app.models.worker import Worker, WORKER_AVAILABILITY_VALUES
from app.utils.auth_decorators import roles_required

workers_bp = Blueprint("workers", __name__, url_prefix="/api/workers")

PHONE_RE = re.compile(r"^\+?[\d\s\-().]{7,20}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _counts_map() -> dict[int, tuple[int, int]]:
    """Return {worker_id: (active_tasks, completed_count)} from live complaints."""
    rows = (
        db.session.query(
            Complaint.assigned_worker_id,
            func.sum(
                case((Complaint.status.in_(("Assigned", "In Progress")), 1), else_=0)
            ).label("active_tasks"),
            func.sum(case((Complaint.status == "Resolved", 1), else_=0)).label("completed_count"),
        )
        .filter(Complaint.assigned_worker_id.isnot(None))
        .group_by(Complaint.assigned_worker_id)
        .all()
    )
    return {
        row.assigned_worker_id: (int(row.active_tasks or 0), int(row.completed_count or 0))
        for row in rows
    }


def _serialize(worker: Worker, counts: dict) -> dict:
    active_tasks, completed_count = counts.get(worker.id, (0, 0))
    return worker.to_dict(active_tasks=active_tasks, completed_count=completed_count)


def _validation_error(errors: list[str], status_code: int = 400, error_label: str = "Validation Error"):
    return (
        jsonify(
            {
                "error": error_label,
                "message": errors[0] if errors else error_label,
                "messages": errors,
                "status": status_code,
            }
        ),
        status_code,
    )


# ---------------------------------------------------------------------------
# GET /api/workers
# ---------------------------------------------------------------------------
@workers_bp.get("")
@roles_required("admin")
def list_workers():
    """Return workers from MySQL with live complaint counts."""
    active_param = request.args.get("active", "").lower()

    query = Worker.query.order_by(Worker.name.asc())
    if active_param == "true":
        query = query.filter(Worker.is_active.is_(True))
    elif active_param == "false":
        query = query.filter(Worker.is_active.is_(False))

    workers = query.all()
    counts = _counts_map()
    return jsonify({"workers": [_serialize(w, counts) for w in workers]}), 200


# ---------------------------------------------------------------------------
# POST /api/workers
# ---------------------------------------------------------------------------
@workers_bp.post("")
@roles_required("admin")
def create_worker():
    """Create a new sanitation worker (and optional linked User account). Admin only."""
    body = request.get_json(silent=True) or {}

    name = str(body.get("name") or "").strip()
    phone = str(body.get("phone") or "").strip()
    role_title = str(body.get("roleTitle") or body.get("role_title") or "").strip()
    ward = str(body.get("ward") or "").strip()
    vehicle_code = str(body.get("vehicleCode") or body.get("vehicle_code") or "").strip()
    availability = str(body.get("availability") or "Available").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")

    # --- Validation ---
    errors = []
    if not name or len(name) < 2:
        errors.append("Full name must be at least 2 characters.")
    if not phone:
        errors.append("Phone number is required.")
    elif not PHONE_RE.match(phone):
        errors.append("Phone number format is invalid (7-20 digits, spaces, dashes, or +).")
    if not role_title or len(role_title) < 2:
        errors.append("Role / Designation must be at least 2 characters.")
    if not ward or len(ward) < 2:
        errors.append("Ward / Zone must be at least 2 characters.")
    if availability not in WORKER_AVAILABILITY_VALUES:
        errors.append(
            f"Availability must be one of: {', '.join(WORKER_AVAILABILITY_VALUES)}."
        )

    if email or password:
        if not email or len(email) > 190 or not EMAIL_RE.match(email):
            errors.append("Please provide a valid login email address for the worker account.")
        if not password or len(password) < 6 or len(password) > 128:
            errors.append("Worker login password must be between 6 and 128 characters.")

    if errors:
        return _validation_error(errors, 400)

    if Worker.query.filter_by(phone=phone).first():
        return (
            jsonify(
                {
                    "error": "Conflict",
                    "message": f"A worker with phone number '{phone}' already exists.",
                }
            ),
            409,
        )

    if vehicle_code and Worker.query.filter_by(vehicle_code=vehicle_code).first():
        return (
            jsonify(
                {
                    "error": "Conflict",
                    "message": f"Vehicle code '{vehicle_code}' is already assigned to another worker.",
                }
            ),
            409,
        )

    if email and User.query.filter_by(email=email).first():
        return (
            jsonify(
                {
                    "error": "Conflict",
                    "message": f"An account with email '{email}' already exists.",
                }
            ),
            409,
        )

    linked_user = None
    if email and password:
        linked_user = User(
            name=name,
            email=email,
            role="worker",
            phone=phone,
            ward=ward,
            is_active=True,
        )
        linked_user.set_password(password)
        db.session.add(linked_user)
        db.session.flush()

    worker = Worker(
        name=name,
        phone=phone,
        role_title=role_title,
        ward=ward,
        vehicle_code=vehicle_code or f"TBD-{re.sub(r'\\D', '', phone)[-4:] or '0000'}",
        availability=availability,
        is_active=True,
        user_id=linked_user.id if linked_user is not None else None,
    )

    try:
        db.session.add(worker)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return (
            jsonify(
                {
                    "error": "Conflict",
                    "message": "A worker with that phone, vehicle code, or email already exists.",
                }
            ),
            409,
        )

    return jsonify({"worker": _serialize(worker, _counts_map()), "message": "Worker created."}), 201


# ---------------------------------------------------------------------------
# GET /api/workers/<id>
# ---------------------------------------------------------------------------
@workers_bp.get("/<int:worker_id>")
@roles_required("admin")
def get_worker(worker_id: int):
    """Return a single worker record by ID."""
    worker = db.get_or_404(Worker, worker_id)
    return jsonify({"worker": _serialize(worker, _counts_map())}), 200


# ---------------------------------------------------------------------------
# PATCH /api/workers/<id>
# ---------------------------------------------------------------------------
@workers_bp.patch("/<int:worker_id>")
@roles_required("admin")
def update_worker(worker_id: int):
    """Edit worker details and optionally provision/update linked worker login credentials."""
    worker = db.get_or_404(Worker, worker_id)
    body = request.get_json(silent=True) or {}

    errors = []

    if "name" in body:
        name = str(body["name"] or "").strip()
        if len(name) < 2:
            errors.append("Name must be at least 2 characters.")
        else:
            worker.name = name

    if "phone" in body:
        phone = str(body["phone"] or "").strip()
        if not PHONE_RE.match(phone):
            errors.append("Phone number format is invalid.")
        else:
            existing = Worker.query.filter(
                Worker.phone == phone, Worker.id != worker_id
            ).first()
            if existing:
                errors.append(f"Phone '{phone}' is already used by another worker.")
            else:
                worker.phone = phone

    if "roleTitle" in body or "role_title" in body:
        rt = str(body.get("roleTitle") or body.get("role_title") or "").strip()
        if len(rt) < 2:
            errors.append("Role / Designation must be at least 2 characters.")
        else:
            worker.role_title = rt

    if "ward" in body:
        ward = str(body["ward"] or "").strip()
        if len(ward) < 2:
            errors.append("Ward must be at least 2 characters.")
        else:
            worker.ward = ward

    if "vehicleCode" in body or "vehicle_code" in body:
        vc = str(body.get("vehicleCode") or body.get("vehicle_code") or "").strip()
        if vc:
            existing = Worker.query.filter(
                Worker.vehicle_code == vc, Worker.id != worker_id
            ).first()
            if existing:
                errors.append(f"Vehicle code '{vc}' is already assigned to another worker.")
            else:
                worker.vehicle_code = vc

    if "availability" in body:
        av = str(body["availability"] or "").strip()
        if av not in WORKER_AVAILABILITY_VALUES:
            errors.append(f"Availability must be one of: {', '.join(WORKER_AVAILABILITY_VALUES)}.")
        else:
            worker.availability = av

    raw_email = str(body.get("email") or "").strip().lower() if "email" in body else None
    raw_password = str(body.get("password") or "") if "password" in body else None

    if raw_email is not None and raw_email != "":
        if len(raw_email) > 190 or not EMAIL_RE.match(raw_email):
            errors.append("Please provide a valid email address.")
        else:
            dup_user_q = User.query.filter(User.email == raw_email)
            if worker.user_id is not None:
                dup_user_q = dup_user_q.filter(User.id != worker.user_id)
            if dup_user_q.first() is not None:
                errors.append(f"Email '{raw_email}' is already used by another account.")

    if raw_password is not None and raw_password != "":
        if len(raw_password) < 6 or len(raw_password) > 128:
            errors.append("Worker login password must be between 6 and 128 characters.")

    if worker.user_id is None:
        if raw_email and not raw_password:
            errors.append("Set an initial password (at least 6 characters) to enable worker login.")
        elif raw_password and not raw_email:
            errors.append("Provide an email address to create worker login credentials.")

    if errors:
        return _validation_error(errors, 400)

    # Sync / provision linked User login record
    if worker.user is not None:
        worker.user.name = worker.name
        worker.user.phone = worker.phone
        worker.user.ward = worker.ward
        if raw_email:
            worker.user.email = raw_email
        if raw_password:
            worker.user.set_password(raw_password)
    elif raw_email and raw_password:
        new_user = User(
            name=worker.name,
            email=raw_email,
            role="worker",
            phone=worker.phone,
            ward=worker.ward,
            is_active=worker.is_active,
        )
        new_user.set_password(raw_password)
        db.session.add(new_user)
        db.session.flush()
        worker.user_id = new_user.id

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return (
            jsonify({"error": "Conflict", "message": "Phone, vehicle code, or email already in use."}),
            409,
        )

    return jsonify({"worker": _serialize(worker, _counts_map()), "message": "Worker updated."}), 200


# ---------------------------------------------------------------------------
# PATCH /api/workers/<id>/availability
# ---------------------------------------------------------------------------
@workers_bp.patch("/<int:worker_id>/availability")
@roles_required("admin")
def update_availability(worker_id: int):
    """Change only the availability status of a worker."""
    worker = db.get_or_404(Worker, worker_id)
    body = request.get_json(silent=True) or {}
    availability = str(body.get("availability") or "").strip()

    if availability not in WORKER_AVAILABILITY_VALUES:
        return (
            jsonify(
                {
                    "error": "Validation Error",
                    "message": f"availability must be one of: {', '.join(WORKER_AVAILABILITY_VALUES)}.",
                }
            ),
            400,
        )

    worker.availability = availability
    db.session.commit()
    return jsonify({"worker": _serialize(worker, _counts_map()), "message": "Availability updated."}), 200


# ---------------------------------------------------------------------------
# PATCH /api/workers/<id>/toggle-active
# ---------------------------------------------------------------------------
@workers_bp.patch("/<int:worker_id>/toggle-active")
@roles_required("admin")
def toggle_active(worker_id: int):
    """
    Activate or deactivate a worker and synchronize linked portal login access.
    Deactivating preserves all existing complaint assignment history.
    """
    worker = db.get_or_404(Worker, worker_id)
    body = request.get_json(silent=True) or {}

    if "isActive" in body:
        worker.is_active = bool(body["isActive"])
    else:
        worker.is_active = not worker.is_active

    if worker.user is not None:
        worker.user.is_active = worker.is_active

    db.session.commit()
    action = "activated" if worker.is_active else "deactivated"
    return (
        jsonify(
            {
                "worker": _serialize(worker, _counts_map()),
                "message": f"Worker {action} successfully.",
            }
        ),
        200,
    )
