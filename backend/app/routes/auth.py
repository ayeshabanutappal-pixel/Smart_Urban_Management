"""
Authentication & account preference API routes for WasteSmart.

Endpoints:
  POST  /api/auth/register     – Public citizen registration (always role='citizen')
  POST  /api/auth/login        – Login by email or worker phone + password -> JWT + user
  GET   /api/auth/me           – Authoritative authenticated user profile
  POST  /api/auth/logout       – Revoke current JWT access token in DB blocklist
  PATCH /api/auth/preferences  – Save user language preference in MySQL
  GET   /api/auth/admin-check  – Admin-only RBAC smoke endpoint
"""
import re
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    get_jwt,
    jwt_required,
)
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.token_blocklist import TokenBlocklist
from app.models.user import User
from app.models.worker import Worker
from app.utils.auth_decorators import get_current_user, roles_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_LOGIN_REGEX = re.compile(r"^\+?[\d\s\-().]{7,20}$")

# English + all 22 Scheduled Languages of India (ISO 639-1 / 639-3 / IANA codes)
SUPPORTED_LANGUAGE_CODES = frozenset(
    {
        "en",   # English
        "as",   # Assamese
        "bn",   # Bengali
        "brx",  # Bodo
        "doi",  # Dogri
        "gu",   # Gujarati
        "hi",   # Hindi
        "kn",   # Kannada
        "ks",   # Kashmiri
        "kok",  # Konkani
        "mai",  # Maithili
        "ml",   # Malayalam
        "mni",  # Manipuri (Meitei)
        "mr",   # Marathi
        "ne",   # Nepali
        "or",   # Odia
        "pa",   # Punjabi
        "sa",   # Sanskrit
        "sat",  # Santali
        "sd",   # Sindhi
        "ta",   # Tamil
        "te",   # Telugu
        "ur",   # Urdu
    }
)


def _error_response(message: str, status_code: int, error_label: str):
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


def _normalize_email(raw_email: str) -> str:
    return raw_email.strip().lower()


def _digits_only(raw_phone: str) -> str:
    return re.sub(r"\D", "", raw_phone or "")


def _find_user_for_login(identifier: str) -> User | None:
    """Resolve user by email address or (for field workers) by registered phone number."""
    if "@" in identifier:
        return User.query.filter_by(email=_normalize_email(identifier)).first()

    # Phone-based lookup (strictly matches Worker.phone first, then non-empty User.phone)
    worker = Worker.query.filter_by(phone=identifier).first()
    if worker is not None and worker.user is not None:
        return worker.user

    target_digits = _digits_only(identifier)
    if len(target_digits) >= 7:
        for candidate in Worker.query.filter(Worker.user_id.isnot(None)).all():
            cand_digits = _digits_only(candidate.phone)
            if cand_digits == target_digits or (
                len(target_digits) >= 10
                and len(cand_digits) >= 10
                and cand_digits[-10:] == target_digits[-10:]
            ):
                return candidate.user

    return User.query.filter(User.phone == identifier, User.phone != "").first()


@auth_bp.post("/register")
def register():
    """
    Public citizen registration endpoint.
    Security guarantee: always creates a 'citizen' account regardless of any role supplied.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response("Request body must be valid JSON.", 400, "Bad Request")

    name = str(payload.get("name", "")).strip()
    email = _normalize_email(str(payload.get("email", "")))
    password = str(payload.get("password", ""))
    phone = str(payload.get("phone", "")).strip()[:30]
    ward = str(payload.get("ward", "")).strip()[:120]

    if len(name) < 2 or len(name) > 120:
        return _error_response(
            "Full name must be between 2 and 120 characters.", 400, "Validation Error"
        )
    if not email or len(email) > 190 or not EMAIL_REGEX.match(email):
        return _error_response("Please provide a valid email address.", 400, "Validation Error")
    if len(password) < 6 or len(password) > 128:
        return _error_response(
            "Password must be between 6 and 128 characters.", 400, "Validation Error"
        )

    existing = User.query.filter_by(email=email).first()
    if existing is not None:
        return _error_response(
            "An account with this email address already exists.", 409, "Conflict"
        )

    # Never trust a client-supplied role during public registration.
    user = User(
        name=name,
        email=email,
        role="citizen",
        phone=phone,
        ward=ward,
    )
    user.set_password(password)

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error_response(
            "An account with this email address already exists.", 409, "Conflict"
        )

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
    )

    return (
        jsonify(
            {
                "token": access_token,
                "user": user.to_dict(),
            }
        ),
        201,
    )


@auth_bp.post("/login")
def login():
    """
    Authenticate an existing user (citizen, admin, or worker) and issue a JWT access token.
    Accepts email (all roles) or registered phone number (workers) alongside password.
    The authoritative role is always loaded from the database user record.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response("Request body must be valid JSON.", 400, "Bad Request")

    identifier = str(
        payload.get("email") or payload.get("phone") or payload.get("identifier") or ""
    ).strip()
    password = str(payload.get("password", ""))

    valid_email = "@" in identifier and EMAIL_REGEX.match(identifier)
    valid_phone = "@" not in identifier and PHONE_LOGIN_REGEX.match(identifier)

    if not identifier or (not valid_email and not valid_phone) or not password:
        return _error_response(
            "Valid email or phone number and password are required.",
            400,
            "Validation Error",
        )

    user = _find_user_for_login(identifier)
    if user is None or not user.is_active or not user.check_password(password):
        return _error_response(
            "Invalid credentials.", 401, "Unauthorized"
        )

    if user.role == "worker":
        worker_profile = user.worker_profile
        if worker_profile is None or not worker_profile.is_active:
            return _error_response(
                "Worker account is inactive or unlinked. Contact your administrator.",
                401,
                "Unauthorized",
            )

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
    )

    return (
        jsonify(
            {
                "token": access_token,
                "user": user.to_dict(),
            }
        ),
        200,
    )


@auth_bp.get("/me")
@jwt_required()
def get_me():
    """Return the authenticated user's authoritative profile from MySQL."""
    user = get_current_user()
    if user is None:
        return _error_response(
            "Authenticated user account was not found or is inactive.",
            401,
            "Unauthorized",
        )
    if user.role == "worker" and (user.worker_profile is None or not user.worker_profile.is_active):
        return _error_response(
            "Worker account is inactive.",
            401,
            "Unauthorized",
        )

    return jsonify({"user": user.to_dict()}), 200


@auth_bp.patch("/preferences")
@jwt_required()
def update_preferences():
    """Save the authenticated user's preferred interface language in MySQL."""
    user = get_current_user()
    if user is None:
        return _error_response(
            "Authenticated user account was not found or is inactive.",
            401,
            "Unauthorized",
        )

    payload = request.get_json(silent=True) or {}
    lang = str(payload.get("preferredLanguage") or payload.get("language") or "").strip().lower()
    if lang not in SUPPORTED_LANGUAGE_CODES:
        return _error_response(
            "Unsupported language code.",
            400,
            "Validation Error",
        )

    user.preferred_language = lang
    db.session.commit()
    return jsonify({"user": user.to_dict(), "message": "Language preference saved."}), 200


@auth_bp.post("/logout")
@jwt_required()
def logout():
    """Revoke the current JWT access token by persisting its jti to token_blocklist."""
    jwt_payload = get_jwt()
    jti = jwt_payload.get("jti")
    exp_timestamp = jwt_payload.get("exp")
    user = get_current_user()

    if not jti or user is None:
        return _error_response("Invalid authentication token.", 401, "Unauthorized")

    existing = TokenBlocklist.query.filter_by(jti=jti).first()
    if existing is None:
        expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        db.session.add(
            TokenBlocklist(
                jti=jti,
                user_id=user.id,
                expires_at=expires_at,
            )
        )
        db.session.commit()

    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.get("/admin-check")
@roles_required("admin")
def admin_check():
    """Verify admin-only role-based access control."""
    return (
        jsonify(
            {
                "authorized": True,
                "role": g.current_user.role,
                "user": g.current_user.to_dict(),
            }
        ),
        200,
    )
