import os
import tempfile
from datetime import timedelta
from urllib.parse import quote_plus
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)


def build_mysql_database_uri() -> str | None:
    """
    Build the SQLAlchemy MySQL connection URI strictly from environment variables.
    Supports either a full DATABASE_URL or individual DB_* components.
    """
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        return database_url

    db_host = os.getenv("DB_HOST", "").strip()
    db_port = os.getenv("DB_PORT", "3306").strip() or "3306"
    db_name = os.getenv("DB_NAME", "").strip()
    db_user = os.getenv("DB_USER", "").strip()
    db_password = os.getenv("DB_PASSWORD", "")

    if not (db_host and db_name and db_user):
        return None

    encoded_user = quote_plus(db_user)
    encoded_password = quote_plus(db_password)
    return (
        f"mysql+pymysql://{encoded_user}:{encoded_password}"
        f"@{db_host}:{db_port}/{db_name}?charset=utf8mb4"
    )


def parse_cors_origins(raw_origins: str | None, default: list[str]) -> list[str]:
    """Parse comma-separated CORS origins into a clean list."""
    if not raw_origins:
        return default
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or default


def _parse_positive_int(raw_val: str | None, fallback: int) -> int:
    try:
        parsed = int((raw_val or "").strip())
        return parsed if parsed > 0 else fallback
    except ValueError:
        return fallback


class BaseConfig:
    """Base configuration shared across all environments."""

    SECRET_KEY: str | None = os.getenv("SECRET_KEY") or None
    JWT_SECRET_KEY: str | None = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY") or None
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(
        minutes=_parse_positive_int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES"), 60)
    )
    SQLALCHEMY_DATABASE_URI: str | None = build_mysql_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    SQLALCHEMY_ENGINE_OPTIONS: dict = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }
    CORS_ORIGINS: list[str] = parse_cors_origins(
        os.getenv("CORS_ORIGINS"),
        default=["http://localhost:3000"],
    )
    JSON_SORT_KEYS: bool = False
    MAX_CONTENT_LENGTH: int = 12 * 1024 * 1024
    COMPLAINT_UPLOAD_FOLDER: str = os.getenv(
        "COMPLAINT_UPLOAD_FOLDER",
        str(BACKEND_DIR / "uploads" / "complaints"),
    )
    DETECT_OUTPUT_FOLDER: str = os.getenv(
        "DETECT_OUTPUT_FOLDER",
        str(BACKEND_DIR / "uploads" / "ai_outputs"),
    )
    AI_SERVICE_URL: str = (os.getenv("AI_SERVICE_URL") or "http://127.0.0.1:5001").rstrip("/")
    AI_SERVICE_TIMEOUT_SECONDS: float = float(
        os.getenv("AI_SERVICE_TIMEOUT_SECONDS") or "30"
    )


class DevelopmentConfig(BaseConfig):
    """Local development configuration."""

    DEBUG: bool = True
    CORS_ORIGINS: list[str] = parse_cors_origins(
        os.getenv("CORS_ORIGINS"),
        default=["http://localhost:3000"],
    )


class TestingConfig(BaseConfig):
    """Isolated automated testing configuration."""

    TESTING: bool = True
    DEBUG: bool = False
    SECRET_KEY: str = os.getenv("TEST_SECRET_KEY", "test-ephemeral-secret-key-min-32-chars")
    JWT_SECRET_KEY: str = os.getenv(
        "TEST_JWT_SECRET_KEY", "test-ephemeral-jwt-secret-key-min-32-chars"
    )
    SQLALCHEMY_DATABASE_URI: str = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    SQLALCHEMY_ENGINE_OPTIONS: dict = {}
    COMPLAINT_UPLOAD_FOLDER: str = str(
        Path(tempfile.gettempdir()) / "wastesmart_test_uploads"
    )
    DETECT_OUTPUT_FOLDER: str = str(
        Path(tempfile.gettempdir()) / "wastesmart_test_ai_outputs"
    )


class ProductionConfig(BaseConfig):
    """Production configuration."""

    DEBUG: bool = False


CONFIG_BY_NAME = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}

