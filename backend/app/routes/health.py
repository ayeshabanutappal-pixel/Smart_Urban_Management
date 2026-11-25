from datetime import datetime, timezone
from flask import Blueprint, jsonify
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.get("/health")
def health_check():
    """
    Report Flask application status and verify live MySQL connectivity.
    Executes a lightweight `SELECT 1` query and never reports connected on failure.
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    try:
        db.session.execute(text("SELECT 1"))
        return (
            jsonify(
                {
                    "status": "ok",
                    "service": "wastesmart-backend",
                    "database": "connected",
                    "timestamp": timestamp,
                }
            ),
            200,
        )
    except SQLAlchemyError as exc:
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "degraded",
                    "service": "wastesmart-backend",
                    "database": "disconnected",
                    "error": "Database connectivity check failed.",
                    "detail": exc.__class__.__name__,
                    "timestamp": timestamp,
                }
            ),
            503,
        )
    except Exception as exc:
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "degraded",
                    "service": "wastesmart-backend",
                    "database": "disconnected",
                    "error": "Unexpected error while verifying database connectivity.",
                    "detail": exc.__class__.__name__,
                    "timestamp": timestamp,
                }
            ),
            503,
        )
    finally:
        db.session.remove()
