import os
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from app import models  # noqa: F401 - ensure SQLAlchemy registers models for Flask-Migrate
from app.cli import register_cli_commands
from app.config import CONFIG_BY_NAME, build_mysql_database_uri
from app.extensions import cors, db, jwt, migrate
from app.models.token_blocklist import TokenBlocklist
from app.routes.auth import auth_bp
from app.routes.complaints import complaints_bp
from app.routes.dashboard import dashboard_bp
from app.routes.detect import detect_bp
from app.routes.geocode import geocode_bp
from app.routes.health import health_bp
from app.routes.notifications import notifications_bp
from app.routes.worker_portal import worker_portal_bp
from app.routes.workers import workers_bp


def _validate_required_config(app: Flask) -> None:
    """Ensure required secrets and MySQL configuration exist in environment variables."""
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError(
            "SECRET_KEY is not set. Copy backend/.env.example to backend/.env "
            "and configure SECRET_KEY before starting the server."
        )

    if not app.config.get("JWT_SECRET_KEY"):
        raise RuntimeError(
            "JWT_SECRET_KEY is not set. Configure JWT_SECRET_KEY or SECRET_KEY in backend/.env."
        )

    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        raise RuntimeError(
            "MySQL database configuration is missing. Set DATABASE_URL or "
            "DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in backend/.env."
        )


def _register_jwt_callbacks() -> None:
    """Register standardized JSON error handlers and token blocklist checks for JWTs."""

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(_jwt_header: dict, jwt_payload: dict) -> bool:
        jti = jwt_payload.get("jti")
        if not jti:
            return True
        return db.session.query(TokenBlocklist.id).filter_by(jti=jti).first() is not None

    @jwt.revoked_token_loader
    def handle_revoked_token(_jwt_header: dict, _jwt_payload: dict):
        return (
            jsonify(
                {
                    "error": "Token Revoked",
                    "message": "Your session has been logged out. Please sign in again.",
                    "status": 401,
                }
            ),
            401,
        )

    @jwt.expired_token_loader
    def handle_expired_token(_jwt_header: dict, _jwt_payload: dict):
        return (
            jsonify(
                {
                    "error": "Token Expired",
                    "message": "Your session has expired. Please sign in again.",
                    "status": 401,
                }
            ),
            401,
        )

    @jwt.invalid_token_loader
    def handle_invalid_token(reason: str):
        return (
            jsonify(
                {
                    "error": "Invalid Token",
                    "message": reason or "Invalid authentication token.",
                    "status": 401,
                }
            ),
            401,
        )

    @jwt.unauthorized_loader
    def handle_missing_token(reason: str):
        return (
            jsonify(
                {
                    "error": "Unauthorized",
                    "message": reason or "Authentication token is required.",
                    "status": 401,
                }
            ),
            401,
        )


def _register_error_handlers(app: Flask) -> None:
    """Register consistent JSON error responses across all routes."""

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        return (
            jsonify(
                {
                    "error": exc.name,
                    "message": exc.description,
                    "status": exc.code,
                }
            ),
            exc.code or 500,
        )

    @app.errorhandler(Exception)
    def handle_unexpected_exception(exc: Exception):
        app.logger.exception("Unhandled server exception: %s", exc)
        return (
            jsonify(
                {
                    "error": "Internal Server Error",
                    "message": "An unexpected server error occurred.",
                    "status": 500,
                }
            ),
            500,
        )


def create_app(config_name: str | None = None) -> Flask:
    """Application factory for the WasteSmart Flask backend."""
    env_name = (config_name or os.getenv("FLASK_ENV") or "development").strip().lower()
    config_cls = CONFIG_BY_NAME.get(env_name)
    if config_cls is None:
        raise ValueError(
            f"Invalid FLASK_ENV '{env_name}'. Expected one of: {', '.join(CONFIG_BY_NAME)}."
        )

    app = Flask(__name__)
    app.config.from_object(config_cls)

    # Re-evaluate environment variables in case .env or os.environ changed before factory call
    if not app.config.get("SECRET_KEY"):
        app.config["SECRET_KEY"] = os.getenv("SECRET_KEY") or None
    if not app.config.get("JWT_SECRET_KEY"):
        app.config["JWT_SECRET_KEY"] = (
            os.getenv("JWT_SECRET_KEY") or app.config.get("SECRET_KEY") or None
        )
    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        app.config["SQLALCHEMY_DATABASE_URI"] = build_mysql_database_uri()

    _validate_required_config(app)

    # Initialize Flask extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    _register_jwt_callbacks()
    cors.init_app(
        app,
        resources={
            r"/api/.*": {
                "origins": app.config["CORS_ORIGINS"],
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
                "supports_credentials": True,
            }
        },
    )

    # Register blueprints, CLI commands & error handlers
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(complaints_bp)
    app.register_blueprint(workers_bp)
    app.register_blueprint(worker_portal_bp)
    app.register_blueprint(detect_bp)
    app.register_blueprint(geocode_bp)
    register_cli_commands(app)
    _register_error_handlers(app)

    return app

