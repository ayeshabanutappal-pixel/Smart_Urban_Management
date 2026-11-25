from functools import wraps
from flask import g, jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.models.user import User


def get_current_user() -> User | None:
    """Resolve the active User record from the current JWT identity."""
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        user_id = int(identity)
    except (TypeError, ValueError):
        return None

    user = User.query.filter_by(id=user_id, is_active=True).first()
    if user is not None and user.role == "worker":
        if user.worker_profile is None or not user.worker_profile.is_active:
            return None
    return user


def roles_required(*allowed_roles: str):
    """
    Protect a route with JWT authentication and enforce role-based authorization
    against the authoritative User record in MySQL (never trusting client claims alone).
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = get_current_user()
            if user is None:
                return (
                    jsonify(
                        {
                            "error": "Unauthorized",
                            "message": "Authenticated user account was not found or is inactive.",
                            "status": 401,
                        }
                    ),
                    401,
                )

            if allowed_roles and user.role not in allowed_roles:
                return (
                    jsonify(
                        {
                            "error": "Forbidden",
                            "message": "You do not have permission to access this resource.",
                            "status": 403,
                        }
                    ),
                    403,
                )

            g.current_user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator
