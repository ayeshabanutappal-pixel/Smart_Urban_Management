from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy.orm import validates

from app.extensions import db

WASTE_CATEGORY_VALUES = ("Organic", "Plastic", "Metal", "Others")
COMPLAINT_STATUS_VALUES = (
    "Pending",
    "Assigned",
    "In Progress",
    "Pending Verification",
    "Resolved",
)
COMPLAINT_SEVERITY_VALUES = ("Low", "Medium", "High")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Complaint(db.Model):
    """Citizen-submitted urban waste complaint record."""

    __tablename__ = "complaints"
    __table_args__ = (
        db.Index("ix_complaints_citizen_reported", "citizen_id", "reported_at"),
        db.Index("ix_complaints_status_category", "status", "category"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    ticket_code = db.Column(db.String(32), nullable=False, unique=True, index=True)
    citizen_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_worker_id = db.Column(
        db.Integer,
        db.ForeignKey("workers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(
        db.Enum(*WASTE_CATEGORY_VALUES, name="waste_category_enum"),
        nullable=False,
        index=True,
    )
    ai_detected = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
        server_default=db.false(),
    )
    ai_confidence = db.Column(
        db.Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    status = db.Column(
        db.Enum(*COMPLAINT_STATUS_VALUES, name="complaint_status_enum"),
        nullable=False,
        default="Pending",
        server_default="Pending",
        index=True,
    )
    severity = db.Column(
        db.Enum(*COMPLAINT_SEVERITY_VALUES, name="complaint_severity_enum"),
        nullable=False,
        default="Medium",
        server_default="Medium",
    )
    location_name = db.Column(db.String(255), nullable=False)
    ward = db.Column(db.String(120), nullable=False, index=True)
    latitude = db.Column(db.Numeric(9, 6), nullable=False)
    longitude = db.Column(db.Numeric(9, 6), nullable=False)
    image_url = db.Column(db.String(500), nullable=False)
    after_image_url = db.Column(db.String(500), nullable=True)
    estimated_weight_kg = db.Column(
        db.Numeric(8, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0.00",
    )
    completion_notes = db.Column(db.Text, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)
    resolution_notes = db.Column(db.Text, nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    verified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    reported_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=db.func.now(),
        index=True,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=db.func.now(),
        onupdate=utcnow,
    )

    citizen = db.relationship("User", back_populates="complaints")
    assigned_worker = db.relationship("Worker", back_populates="complaints")
    status_logs = db.relationship(
        "ComplaintStatusLog",
        back_populates="complaint",
        cascade="all, delete-orphan",
        order_by="ComplaintStatusLog.created_at.asc()",
    )
    notifications = db.relationship(
        "Notification",
        back_populates="complaint",
        lazy="dynamic",
    )

    @validates("category")
    def validate_category(self, _key: str, value: str) -> str:
        if value not in WASTE_CATEGORY_VALUES:
            raise ValueError(
                f"Invalid waste category '{value}'. Must be one of {WASTE_CATEGORY_VALUES}."
            )
        return value

    @validates("status")
    def validate_status(self, _key: str, value: str) -> str:
        if value not in COMPLAINT_STATUS_VALUES:
            raise ValueError(
                f"Invalid complaint status '{value}'. Must be one of {COMPLAINT_STATUS_VALUES}."
            )
        return value

    @validates("severity")
    def validate_severity(self, _key: str, value: str) -> str:
        if value not in COMPLAINT_SEVERITY_VALUES:
            raise ValueError(
                f"Invalid severity '{value}'. Must be one of {COMPLAINT_SEVERITY_VALUES}."
            )
        return value

    @validates("ai_confidence")
    def validate_confidence(self, _key: str, value: int) -> int:
        if value is None:
            return 0
        if not (0 <= int(value) <= 100):
            raise ValueError("ai_confidence must be between 0 and 100.")
        return int(value)

    @validates("estimated_weight_kg")
    def validate_weight(self, _key: str, value) -> Decimal:
        dec = Decimal(str(value if value is not None else "0.00"))
        if dec < 0:
            raise ValueError("estimated_weight_kg cannot be negative.")
        return dec

    def to_dict(self) -> dict:
        return {
            "id": self.ticket_code,
            "citizenId": str(self.citizen_id),
            "citizenName": self.citizen.name if self.citizen else "",
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "aiDetected": self.ai_detected,
            "aiConfidence": self.ai_confidence,
            "status": self.status,
            "severity": self.severity,
            "locationName": self.location_name,
            "ward": self.ward,
            "coordinates": {
                "lat": float(self.latitude),
                "lng": float(self.longitude),
            },
            "imageUrl": self.image_url,
            "afterImageUrl": self.after_image_url,
            "reportedAt": self.reported_at.isoformat() if self.reported_at else "",
            "updatedAt": self.updated_at.isoformat() if self.updated_at else "",
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "verifiedAt": self.verified_at.isoformat() if self.verified_at else None,
            "assignedWorkerId": (
                str(self.assigned_worker_id) if self.assigned_worker_id is not None else None
            ),
            "assignedWorkerName": (
                self.assigned_worker.name if self.assigned_worker else None
            ),
            "estimatedWeightKg": float(self.estimated_weight_kg),
            "completionNotes": self.completion_notes,
            "rejectionReason": self.rejection_reason,
            "resolutionNotes": self.resolution_notes,
        }
