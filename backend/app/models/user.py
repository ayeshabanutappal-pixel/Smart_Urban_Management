from datetime import datetime, timezone
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


USER_ROLE_VALUES = ("citizen", "admin", "worker")


class User(db.Model):
    """Registered citizen, municipal administrator, and sanitation worker accounts."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(190), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(
        db.Enum(*USER_ROLE_VALUES, name="user_role_enum"),
        nullable=False,
        default="citizen",
        index=True,
    )
    phone = db.Column(db.String(30), nullable=False, default="")
    ward = db.Column(db.String(120), nullable=False, default="")
    preferred_language = db.Column(
        db.String(16),
        nullable=False,
        default="en",
        server_default="en",
    )
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    joined_at = db.Column(db.Date, nullable=False, default=lambda: utcnow().date())
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    revoked_tokens = db.relationship(
        "TokenBlocklist",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )
    complaints = db.relationship(
        "Complaint",
        back_populates="citizen",
        lazy="dynamic",
    )
    status_logs = db.relationship(
        "ComplaintStatusLog",
        back_populates="changed_by",
        lazy="dynamic",
    )
    notifications = db.relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )
    worker_profile = db.relationship(
        "Worker",
        back_populates="user",
        uselist=False,
    )

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self) -> dict:
        """Serialize user safely without ever exposing password_hash."""
        data = {
            "id": str(self.id),
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "phone": self.phone,
            "ward": self.ward,
            "preferredLanguage": self.preferred_language or "en",
            "joinedAt": self.joined_at.isoformat(),
        }
        if self.role == "worker" and self.worker_profile is not None:
            data["workerId"] = str(self.worker_profile.id)
        return data
