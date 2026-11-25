from datetime import datetime, timezone
from sqlalchemy.orm import validates

from app.extensions import db

WORKER_AVAILABILITY_VALUES = ("Available", "On Duty", "Off Shift")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Worker(db.Model):
    """Municipal sanitation field worker and assigned vehicle details."""

    __tablename__ = "workers"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(120), nullable=False)
    role_title = db.Column(db.String(120), nullable=False)
    ward = db.Column(db.String(120), nullable=False, index=True)
    phone = db.Column(db.String(30), nullable=False, unique=True)
    availability = db.Column(
        db.Enum(*WORKER_AVAILABILITY_VALUES, name="worker_availability_enum"),
        nullable=False,
        default="Available",
        server_default="Available",
        index=True,
    )
    vehicle_code = db.Column(db.String(40), nullable=False, unique=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    is_active = db.Column(
        db.Boolean,
        nullable=False,
        default=True,
        server_default=db.true(),
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=db.func.now(),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=db.func.now(),
        onupdate=utcnow,
    )

    user = db.relationship("User", back_populates="worker_profile")
    complaints = db.relationship(
        "Complaint",
        back_populates="assigned_worker",
        lazy="dynamic",
    )

    @validates("availability")
    def validate_availability(self, _key: str, value: str) -> str:
        if value not in WORKER_AVAILABILITY_VALUES:
            raise ValueError(
                f"Invalid worker availability '{value}'. Must be one of {WORKER_AVAILABILITY_VALUES}."
            )
        return value

    def to_dict(self, active_tasks: int = 0, completed_count: int = 0) -> dict:
        return {
            "id": str(self.id),
            "name": self.name,
            "roleTitle": self.role_title,
            "ward": self.ward,
            "phone": self.phone,
            "availability": self.availability,
            "activeTasks": active_tasks,
            "completedCount": completed_count,
            "vehicleCode": self.vehicle_code,
            "isActive": self.is_active,
            "userId": str(self.user_id) if self.user_id is not None else None,
            "email": self.user.email if self.user else None,
        }
