from datetime import datetime, timezone
from sqlalchemy.orm import validates

from app.extensions import db

NOTIFICATION_TYPE_VALUES = ("complaint", "assignment", "resolved", "ai")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Notification(db.Model):
    """Per-recipient notification records strictly scoped to user_id."""

    __tablename__ = "notifications"
    __table_args__ = (
        db.Index(
            "ix_notifications_user_read_created",
            "user_id",
            "is_read",
            "created_at",
        ),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    complaint_id = db.Column(
        db.Integer,
        db.ForeignKey("complaints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(
        db.Enum(*NOTIFICATION_TYPE_VALUES, name="notification_type_enum"),
        nullable=False,
        index=True,
    )
    is_read = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
        server_default=db.false(),
        index=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=db.func.now(),
        index=True,
    )

    user = db.relationship("User", back_populates="notifications")
    complaint = db.relationship("Complaint", back_populates="notifications")

    @validates("type")
    def validate_type(self, _key: str, value: str) -> str:
        if value not in NOTIFICATION_TYPE_VALUES:
            raise ValueError(
                f"Invalid notification type '{value}'. Must be one of {NOTIFICATION_TYPE_VALUES}."
            )
        return value

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "title": self.title,
            "message": self.message,
            "timestamp": self.created_at.isoformat() if self.created_at else "",
            "read": self.is_read,
            "type": self.type,
            "complaintId": self.complaint.ticket_code if self.complaint else None,
            "audience": self.user.role if self.user else "citizen",
        }
