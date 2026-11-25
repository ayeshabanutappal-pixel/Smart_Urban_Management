from datetime import datetime, timezone
from sqlalchemy.orm import validates

from app.extensions import db
from app.models.complaint import COMPLAINT_STATUS_VALUES


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ComplaintStatusLog(db.Model):
    """Audit trail of complaint status changes and worker assignments."""

    __tablename__ = "complaint_status_logs"
    __table_args__ = (
        db.Index("ix_status_logs_complaint_created", "complaint_id", "created_at"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    complaint_id = db.Column(
        db.Integer,
        db.ForeignKey("complaints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    changed_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = db.Column(
        db.Enum(*COMPLAINT_STATUS_VALUES, name="complaint_log_status_enum"),
        nullable=False,
        index=True,
    )
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=db.func.now(),
        index=True,
    )

    complaint = db.relationship("Complaint", back_populates="status_logs")
    changed_by = db.relationship("User", back_populates="status_logs")

    @validates("status")
    def validate_status(self, _key: str, value: str) -> str:
        if value not in COMPLAINT_STATUS_VALUES:
            raise ValueError(
                f"Invalid status log value '{value}'. Must be one of {COMPLAINT_STATUS_VALUES}."
            )
        return value

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "complaintId": str(self.complaint_id),
            "changedByUserId": str(self.changed_by_user_id),
            "status": self.status,
            "note": self.note,
            "createdAt": self.created_at.isoformat() if self.created_at else "",
        }
