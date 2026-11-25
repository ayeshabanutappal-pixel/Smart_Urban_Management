"""
Notifications API for WasteSmart.

GET  /api/notifications              — List current user's notifications with unread count.
PATCH /api/notifications/<id>/read   — Mark one notification as read (own only).
POST  /api/notifications/mark-all-read — Mark all current user's notifications as read.

Security guarantee: every query filters by g.current_user.id.
No notification belonging to another user is ever exposed or modified.
"""
from flask import Blueprint, g, jsonify

from app.extensions import db
from app.models.notification import Notification
from app.utils.auth_decorators import roles_required

notifications_bp = Blueprint(
    "notifications", __name__, url_prefix="/api/notifications"
)


def _error_response(message: str, status_code: int, error_label: str):
    """Consistent JSON error format matching the existing project convention."""
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


@notifications_bp.get("")
@roles_required("citizen", "admin", "worker")
def list_notifications():
    """
    Return all notifications belonging to the authenticated user, ordered newest-first.
    Also returns the total unread count so clients can display a badge without a
    separate request.
    """
    user_id = g.current_user.id

    notifications = (
        Notification.query.filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc())
        .all()
    )

    unread_count = sum(1 for n in notifications if not n.is_read)

    return (
        jsonify(
            {
                "notifications": [n.to_dict() for n in notifications],
                "unreadCount": unread_count,
            }
        ),
        200,
    )


@notifications_bp.patch("/<int:notification_id>/read")
@roles_required("citizen", "admin", "worker")
def mark_notification_read(notification_id: int):
    """
    Mark a single notification as read.

    Returns 404 if the notification does not exist.
    Returns 403 if the notification belongs to a different user.
    Idempotent: marking an already-read notification returns 200.
    """
    user_id = g.current_user.id

    notification = db.session.get(Notification, notification_id)

    if notification is None:
        return _error_response(
            "Notification not found.",
            404,
            "Not Found",
        )

    if notification.user_id != user_id:
        return _error_response(
            "You do not have permission to access this notification.",
            403,
            "Forbidden",
        )

    if not notification.is_read:
        notification.is_read = True
        db.session.commit()

    return jsonify({"notification": notification.to_dict()}), 200


@notifications_bp.post("/mark-all-read")
@roles_required("citizen", "admin", "worker")
def mark_all_notifications_read():
    """
    Mark all unread notifications belonging to the authenticated user as read.

    Only the current user's notifications are updated.
    Other users' notifications are never touched.
    Returns the count of records actually updated.
    """
    user_id = g.current_user.id

    updated_count = (
        Notification.query.filter_by(user_id=user_id, is_read=False)
        .update({"is_read": True}, synchronize_session="fetch")
    )
    db.session.commit()

    return (
        jsonify(
            {
                "message": "All notifications marked as read.",
                "updatedCount": updated_count,
            }
        ),
        200,
    )
