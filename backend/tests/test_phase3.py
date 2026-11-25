"""
Phase 3 backend tests — Dashboard summary and Notifications APIs.

Covers all 8 required test scenarios:
1. Unauthenticated requests are rejected (401).
2. Citizen dashboard only contains that citizen's complaints.
3. Admin dashboard aggregates all complaints.
4. Empty dashboard returns valid zero values and empty arrays.
5. Notification list is scoped to the authenticated user.
6. A user cannot mark another user's notification as read (403).
7. Mark-all-read affects only the current user's notifications.
8. Correct unread count is returned.

Uses the same app/client fixture pattern as test_auth.py and test_models.py.
Existing tests are not modified.
"""
import sys
from decimal import Decimal
from pathlib import Path
import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.extensions import db
from app.models import (
    Complaint,
    Notification,
    User,
    Worker,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def app():
    """Isolated SQLite in-memory application for each test function."""
    application = create_app("testing")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _register_and_login(client, name: str, email: str, password: str = "password123") -> str:
    """Register a citizen and return its JWT access token."""
    res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert res.status_code == 201, res.get_json()
    return res.get_json()["token"]


def _provision_admin(app, client, name: str, email: str, password: str = "AdminPwd!99") -> str:
    """Provision an admin via CLI and return its JWT access token."""
    runner = app.test_cli_runner()
    result = runner.invoke(
        args=["create-admin", "--name", name, "--email", email, "--password", password]
    )
    assert result.exit_code == 0, result.output
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.get_json()
    return res.get_json()["token"]


def _make_complaint(citizen_id: int, ticket: str, status: str = "Pending", ai_detected: bool = False, weight: str = "10.00") -> Complaint:
    """Create and flush a Complaint without committing (caller must commit)."""
    c = Complaint(
        ticket_code=ticket,
        citizen_id=citizen_id,
        title=f"Test complaint {ticket}",
        description="Test description.",
        category="Plastic",
        ai_detected=ai_detected,
        ai_confidence=90 if ai_detected else 0,
        status=status,
        severity="Medium",
        location_name="Test Location",
        ward="Ward 1",
        latitude=Decimal("12.970000"),
        longitude=Decimal("77.590000"),
        image_url="/uploads/test.jpg",
        estimated_weight_kg=Decimal(weight),
    )
    db.session.add(c)
    db.session.flush()
    return c


def _make_notification(user_id: int, title: str, is_read: bool = False) -> Notification:
    """Create and flush a Notification without committing."""
    n = Notification(
        user_id=user_id,
        title=title,
        message=f"Message for {title}",
        type="complaint",
        is_read=is_read,
    )
    db.session.add(n)
    db.session.flush()
    return n


# ---------------------------------------------------------------------------
# 1. Unauthenticated requests are rejected with 401
# ---------------------------------------------------------------------------


def test_unauthenticated_dashboard_returns_401(client):
    """GET /api/dashboard/summary without token must return 401."""
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 401


def test_unauthenticated_notifications_returns_401(client):
    """GET /api/notifications without token must return 401."""
    res = client.get("/api/notifications")
    assert res.status_code == 401


def test_unauthenticated_mark_read_returns_401(client):
    """PATCH /api/notifications/1/read without token must return 401."""
    res = client.patch("/api/notifications/1/read")
    assert res.status_code == 401


def test_unauthenticated_mark_all_read_returns_401(client):
    """POST /api/notifications/mark-all-read without token must return 401."""
    res = client.post("/api/notifications/mark-all-read")
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# 2. Citizen dashboard only contains that citizen's complaints
# ---------------------------------------------------------------------------


def test_citizen_dashboard_scoped_to_own_complaints(app, client):
    """
    Two citizens each file one complaint.
    Each citizen's dashboard metrics must reflect only their own complaint.
    """
    with app.app_context():
        token_a = _register_and_login(client, "Citizen A", "a@example.com")
        token_b = _register_and_login(client, "Citizen B", "b@example.com")

        citizen_a = User.query.filter_by(email="a@example.com").first()
        citizen_b = User.query.filter_by(email="b@example.com").first()

        _make_complaint(citizen_a.id, "WS-A-001", status="Resolved", ai_detected=True, weight="15.00")
        _make_complaint(citizen_b.id, "WS-B-001", status="Pending", weight="8.00")
        db.session.commit()

    # Citizen A — sees only WS-A-001
    res_a = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_a.status_code == 200
    data_a = res_a.get_json()
    m = data_a["metrics"]
    assert m["totalComplaints"] == 1
    assert m["resolvedIssues"] == 1
    assert m["pendingComplaints"] == 0
    assert m["wasteDetectedCount"] == 1
    assert m["totalEstimatedKg"] == pytest.approx(15.0)
    assert m["resolutionRate"] == pytest.approx(100.0)

    ids_a = [c["id"] for c in data_a["recentComplaints"]]
    assert "WS-A-001" in ids_a
    assert "WS-B-001" not in ids_a

    # Citizen B — sees only WS-B-001
    res_b = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b.status_code == 200
    data_b = res_b.get_json()
    m = data_b["metrics"]
    assert m["totalComplaints"] == 1
    assert m["pendingComplaints"] == 1
    assert m["resolvedIssues"] == 0
    assert m["wasteDetectedCount"] == 0
    assert m["totalEstimatedKg"] == pytest.approx(8.0)
    assert m["resolutionRate"] == pytest.approx(0.0)

    ids_b = [c["id"] for c in data_b["recentComplaints"]]
    assert "WS-B-001" in ids_b
    assert "WS-A-001" not in ids_b


# ---------------------------------------------------------------------------
# 3. Admin dashboard aggregates all complaints
# ---------------------------------------------------------------------------


def test_admin_dashboard_aggregates_all_complaints(app, client):
    """
    Two citizens file separate complaints.
    Admin dashboard must aggregate both complaints together.
    """
    with app.app_context():
        _register_and_login(client, "Citizen A", "ca@example.com")
        _register_and_login(client, "Citizen B", "cb@example.com")

        ca = User.query.filter_by(email="ca@example.com").first()
        cb = User.query.filter_by(email="cb@example.com").first()

        _make_complaint(ca.id, "WS-CA-001", status="Resolved", ai_detected=True, weight="20.00")
        _make_complaint(cb.id, "WS-CB-001", status="In Progress", weight="5.50")
        db.session.commit()

    admin_token = _provision_admin(app, client, "Admin User", "admin@wastesmart.city")

    res = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    data = res.get_json()
    m = data["metrics"]

    assert m["totalComplaints"] == 2
    assert m["resolvedIssues"] == 1
    assert m["inProgressCount"] == 1
    assert m["pendingComplaints"] == 0
    assert m["wasteDetectedCount"] == 1
    assert m["totalEstimatedKg"] == pytest.approx(25.5)
    assert m["resolutionRate"] == pytest.approx(50.0)

    ids_all = [c["id"] for c in data["recentComplaints"]]
    assert "WS-CA-001" in ids_all
    assert "WS-CB-001" in ids_all


# ---------------------------------------------------------------------------
# 4. Empty dashboard returns valid zero values and empty arrays
# ---------------------------------------------------------------------------


def test_empty_dashboard_returns_valid_zeros(client):
    """
    A newly registered citizen with no complaints must receive all-zero metrics
    and empty arrays — the endpoint must not crash or return nulls.
    """
    token = _register_and_login(client, "New Citizen", "new@example.com")
    res = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.get_json()

    m = data["metrics"]
    assert m["totalComplaints"] == 0
    assert m["wasteDetectedCount"] == 0
    assert m["resolvedIssues"] == 0
    assert m["pendingComplaints"] == 0
    assert m["inProgressCount"] == 0
    assert m["resolutionRate"] == 0.0
    assert m["totalEstimatedKg"] == 0.0

    assert isinstance(data["categoryDistribution"], list)
    assert len(data["categoryDistribution"]) == 4  # one entry per category, all zero
    for entry in data["categoryDistribution"]:
        assert entry["count"] == 0

    assert data["recentActivity"] == []
    assert data["recentComplaints"] == []


# ---------------------------------------------------------------------------
# 5. Notification list is scoped to the authenticated user
# ---------------------------------------------------------------------------


def test_notification_list_scoped_to_user(app, client):
    """
    Two users each have different notifications.
    Each user's GET /api/notifications must return only their own records.
    """
    with app.app_context():
        token_x = _register_and_login(client, "User X", "x@example.com")
        token_y = _register_and_login(client, "User Y", "y@example.com")

        ux = User.query.filter_by(email="x@example.com").first()
        uy = User.query.filter_by(email="y@example.com").first()

        _make_notification(ux.id, "X-Notif-1")
        _make_notification(ux.id, "X-Notif-2")
        _make_notification(uy.id, "Y-Notif-1")
        db.session.commit()

    res_x = client.get("/api/notifications", headers={"Authorization": f"Bearer {token_x}"})
    assert res_x.status_code == 200
    data_x = res_x.get_json()
    titles_x = [n["title"] for n in data_x["notifications"]]
    assert "X-Notif-1" in titles_x
    assert "X-Notif-2" in titles_x
    assert "Y-Notif-1" not in titles_x

    res_y = client.get("/api/notifications", headers={"Authorization": f"Bearer {token_y}"})
    assert res_y.status_code == 200
    data_y = res_y.get_json()
    titles_y = [n["title"] for n in data_y["notifications"]]
    assert "Y-Notif-1" in titles_y
    assert "X-Notif-1" not in titles_y
    assert "X-Notif-2" not in titles_y


# ---------------------------------------------------------------------------
# 6. A user cannot mark another user's notification as read (403)
# ---------------------------------------------------------------------------


def test_cannot_mark_another_users_notification_read(app, client):
    """
    User X tries to mark User Y's notification as read.
    Must receive 403 Forbidden, never 200.
    """
    with app.app_context():
        token_x = _register_and_login(client, "User X", "xsec@example.com")
        _register_and_login(client, "User Y", "ysec@example.com")

        uy = User.query.filter_by(email="ysec@example.com").first()
        notif = _make_notification(uy.id, "Y-Private")
        db.session.commit()
        notif_id = notif.id

    # User X tries to read User Y's notification
    res = client.patch(
        f"/api/notifications/{notif_id}/read",
        headers={"Authorization": f"Bearer {token_x}"},
    )
    assert res.status_code == 403
    assert res.get_json()["error"] == "Forbidden"

    # Verify the notification remains unread
    with app.app_context():
        unchanged = db.session.get(Notification, notif_id)
        assert unchanged.is_read is False


def test_mark_nonexistent_notification_returns_404(client):
    """PATCH /api/notifications/99999/read must return 404 when ID does not exist."""
    token = _register_and_login(client, "User Z", "z@example.com")
    res = client.patch(
        "/api/notifications/99999/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 404
    assert res.get_json()["error"] == "Not Found"


# ---------------------------------------------------------------------------
# 7. Mark-all-read affects only the current user's notifications
# ---------------------------------------------------------------------------


def test_mark_all_read_affects_only_current_user(app, client):
    """
    User A has 2 unread notifications.
    User B has 1 unread notification.
    POST /api/notifications/mark-all-read as User A must only mark A's as read.
    User B's notification must remain unread.
    """
    with app.app_context():
        token_a = _register_and_login(client, "User A", "a_mar@example.com")
        _register_and_login(client, "User B", "b_mar@example.com")

        ua = User.query.filter_by(email="a_mar@example.com").first()
        ub = User.query.filter_by(email="b_mar@example.com").first()

        _make_notification(ua.id, "A-Notif-1", is_read=False)
        _make_notification(ua.id, "A-Notif-2", is_read=False)
        notif_b = _make_notification(ub.id, "B-Notif-1", is_read=False)
        db.session.commit()
        notif_b_id = notif_b.id

    res = client.post(
        "/api/notifications/mark-all-read",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["updatedCount"] == 2

    with app.app_context():
        # User B's notification must still be unread
        b_notif = db.session.get(Notification, notif_b_id)
        assert b_notif.is_read is False

        # User A's notifications must all be read
        a_unread = Notification.query.filter_by(
            user_id=User.query.filter_by(email="a_mar@example.com").first().id,
            is_read=False,
        ).count()
        assert a_unread == 0


# ---------------------------------------------------------------------------
# 8. Correct unread count is returned
# ---------------------------------------------------------------------------


def test_unread_count_is_accurate(app, client):
    """
    User has 3 notifications: 2 unread, 1 already read.
    GET /api/notifications must return unreadCount == 2.
    After mark-all-read, unreadCount must be 0.
    """
    with app.app_context():
        token = _register_and_login(client, "Count User", "count@example.com")
        u = User.query.filter_by(email="count@example.com").first()

        _make_notification(u.id, "Unread-1", is_read=False)
        _make_notification(u.id, "Unread-2", is_read=False)
        _make_notification(u.id, "Already-Read", is_read=True)
        db.session.commit()

    res = client.get("/api/notifications", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["unreadCount"] == 2
    assert len(data["notifications"]) == 3

    # Mark all read
    mark_res = client.post(
        "/api/notifications/mark-all-read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert mark_res.status_code == 200
    assert mark_res.get_json()["updatedCount"] == 2

    # Re-fetch — unreadCount must now be 0
    res2 = client.get("/api/notifications", headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 200
    assert res2.get_json()["unreadCount"] == 0
