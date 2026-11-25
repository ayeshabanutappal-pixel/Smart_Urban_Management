"""
Dashboard summary API for WasteSmart.

GET /api/dashboard/summary
  - Citizens: metrics scoped to their own complaints only.
  - Admins: aggregate metrics across all complaints.
  - Returns metrics, categoryDistribution, recentActivity, recentComplaints.
  - Always returns valid zero values and empty arrays when no data exists.
"""
from flask import Blueprint, g, jsonify
from sqlalchemy import case, func

from app.extensions import db
from app.models.complaint import (
    WASTE_CATEGORY_VALUES,
    Complaint,
)
from app.models.complaint_status_log import ComplaintStatusLog
from app.utils.auth_decorators import roles_required

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


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


@dashboard_bp.get("/summary")
@roles_required("citizen", "admin")
def dashboard_summary():
    """
    Return dashboard summary metrics for the authenticated user.

    Citizens receive only metrics derived from their own complaints.
    Admins receive aggregate metrics across all complaints in the system.
    When no complaints exist the response always returns valid zero values
    and empty arrays — never crashes or returns null.
    """
    current_user = g.current_user

    # -----------------------------------------------------------------
    # Build base query scope: citizen sees own complaints, admin sees all
    # -----------------------------------------------------------------
    base_q = db.session.query(Complaint)
    if current_user.role == "citizen":
        base_q = base_q.filter(Complaint.citizen_id == current_user.id)

    # -----------------------------------------------------------------
    # Aggregate metrics via a single SQL pass (avoids N+1 queries)
    # -----------------------------------------------------------------
    agg = db.session.query(
        func.count(Complaint.id).label("total"),
        func.sum(case((Complaint.ai_detected.is_(True), 1), else_=0)).label(
            "ai_detected_count"
        ),
        func.sum(case((Complaint.status == "Resolved", 1), else_=0)).label(
            "resolved_count"
        ),
        func.sum(case((Complaint.status == "Pending", 1), else_=0)).label(
            "pending_count"
        ),
        func.sum(case((Complaint.status == "In Progress", 1), else_=0)).label(
            "in_progress_count"
        ),
        func.coalesce(func.sum(Complaint.estimated_weight_kg), 0).label(
            "total_weight_kg"
        ),
    )

    if current_user.role == "citizen":
        agg = agg.filter(Complaint.citizen_id == current_user.id)

    row = agg.one()

    total_complaints = int(row.total or 0)
    waste_detected_count = int(row.ai_detected_count or 0)
    resolved_issues = int(row.resolved_count or 0)
    pending_complaints = int(row.pending_count or 0)
    in_progress_count = int(row.in_progress_count or 0)
    total_weight_kg = float(row.total_weight_kg or 0)

    resolution_rate = (
        round((resolved_issues / total_complaints) * 100, 1)
        if total_complaints > 0
        else 0.0
    )

    # -----------------------------------------------------------------
    # Category distribution — one row per category with nonzero count
    # -----------------------------------------------------------------
    cat_q = db.session.query(
        Complaint.category,
        func.count(Complaint.id).label("cnt"),
    ).group_by(Complaint.category)

    if current_user.role == "citizen":
        cat_q = cat_q.filter(Complaint.citizen_id == current_user.id)

    cat_rows = cat_q.all()
    cat_map = {r.category: int(r.cnt) for r in cat_rows}

    category_distribution = [
        {"category": cat, "count": cat_map.get(cat, 0)}
        for cat in WASTE_CATEGORY_VALUES
    ]

    # -----------------------------------------------------------------
    # Recent activity — latest 5 status-log entries with complaint info
    # Apply citizen filter BEFORE .limit() to avoid SQLAlchemy
    # InvalidRequestError("filter() after limit()").
    # -----------------------------------------------------------------
    activity_q = (
        db.session.query(ComplaintStatusLog)
        .join(Complaint, ComplaintStatusLog.complaint_id == Complaint.id)
    )

    if current_user.role == "citizen":
        activity_q = activity_q.filter(Complaint.citizen_id == current_user.id)

    activity_q = activity_q.order_by(ComplaintStatusLog.created_at.desc()).limit(5)

    recent_activity = []
    for log in activity_q.all():
        recent_activity.append(
            {
                "id": str(log.id),
                "complaintId": log.complaint.ticket_code if log.complaint else None,
                "status": log.status,
                "note": log.note,
                "changedAt": log.created_at.isoformat() if log.created_at else "",
            }
        )

    # -----------------------------------------------------------------
    # Recent complaints — latest 6, most recently reported first
    # -----------------------------------------------------------------
    recent_q = (
        base_q.order_by(Complaint.reported_at.desc()).limit(6).all()
    )
    recent_complaints = [c.to_dict() for c in recent_q]

    return (
        jsonify(
            {
                "metrics": {
                    "totalComplaints": total_complaints,
                    "wasteDetectedCount": waste_detected_count,
                    "resolvedIssues": resolved_issues,
                    "pendingComplaints": pending_complaints,
                    "inProgressCount": in_progress_count,
                    "resolutionRate": resolution_rate,
                    "totalEstimatedKg": total_weight_kg,
                },
                "categoryDistribution": category_distribution,
                "recentActivity": recent_activity,
                "recentComplaints": recent_complaints,
            }
        ),
        200,
    )
