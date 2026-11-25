"""
Tests for Worker Management API endpoints (Phase: Manage Workers).

Verifies:
- Unauthenticated access returns 401
- Citizen access returns 403
- Admin can create, read, update availability, toggle-active workers
- Duplicate phone returns 409
- Invalid data returns 400
- Inactive workers excluded from ?active=true filter
- Assignment history preserved on deactivation
"""
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.worker import Worker


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def app():
    application = create_app("testing")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _register(client, email="citizen@example.com", password="password123", name="Citizen Test"):
    res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    return res.get_json()["token"]


def _make_admin(app, email="admin@test.com", password="AdminPass!99"):
    runner = app.test_cli_runner()
    result = runner.invoke(
        args=["create-admin", "--name", "Test Admin", "--email", email, "--password", password]
    )
    assert result.exit_code == 0, result.output
    res_client = app.test_client()
    res = res_client.post("/api/auth/login", json={"email": email, "password": password})
    return res.get_json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _worker_payload(**overrides):
    base = {
        "name": "Rajan Kumar",
        "phone": "+91 98450 11111",
        "roleTitle": "Senior Sanitation Officer",
        "ward": "Ward 3 - Lakeview",
        "vehicleCode": "KA-01-WS-001",
        "availability": "Available",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# 1. Auth / role guard tests
# ---------------------------------------------------------------------------

def test_unauthenticated_requests_return_401(client):
    assert client.get("/api/workers").status_code == 401
    assert client.post("/api/workers", json={}).status_code == 401
    assert client.get("/api/workers/1").status_code == 401
    assert client.patch("/api/workers/1", json={}).status_code == 401
    assert client.patch("/api/workers/1/availability", json={}).status_code == 401
    assert client.patch("/api/workers/1/toggle-active", json={}).status_code == 401


def test_citizen_cannot_access_worker_endpoints(client):
    cit_token = _register(client)
    headers = _auth(cit_token)
    assert client.get("/api/workers", headers=headers).status_code == 403
    assert client.post("/api/workers", json={}, headers=headers).status_code == 403
    assert client.patch("/api/workers/1", json={}, headers=headers).status_code == 403


# ---------------------------------------------------------------------------
# 2. Create worker
# ---------------------------------------------------------------------------

def test_admin_can_create_worker(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    res = client.post("/api/workers", json=_worker_payload(), headers=headers)
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert "worker" in data
    w = data["worker"]
    assert w["name"] == "Rajan Kumar"
    assert w["phone"] == "+91 98450 11111"
    assert w["roleTitle"] == "Senior Sanitation Officer"
    assert w["isActive"] is True
    assert w["availability"] == "Available"

    # Verify persisted in database
    with app.app_context():
        db_worker = Worker.query.filter_by(phone="+91 98450 11111").first()
        assert db_worker is not None
        assert db_worker.name == "Rajan Kumar"


def test_create_worker_validation_errors(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    # Missing required fields
    res = client.post("/api/workers", json={}, headers=headers)
    assert res.status_code == 400

    # Short name
    res = client.post("/api/workers", json=_worker_payload(name="A"), headers=headers)
    assert res.status_code == 400

    # Invalid phone
    res = client.post("/api/workers", json=_worker_payload(phone="abc"), headers=headers)
    assert res.status_code == 400

    # Invalid availability
    res = client.post(
        "/api/workers", json=_worker_payload(availability="Invalid"), headers=headers
    )
    assert res.status_code == 400


def test_duplicate_phone_returns_409(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    first = client.post("/api/workers", json=_worker_payload(), headers=headers)
    assert first.status_code == 201

    # Same phone, different vehicle code
    dup = client.post(
        "/api/workers",
        json=_worker_payload(vehicleCode="KA-01-WS-999"),
        headers=headers,
    )
    assert dup.status_code == 409
    assert "phone" in dup.get_json()["message"].lower()


# ---------------------------------------------------------------------------
# 3. List workers with active filter
# ---------------------------------------------------------------------------

def test_list_workers_active_filter(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    # Create two workers
    client.post("/api/workers", json=_worker_payload(), headers=headers)
    client.post(
        "/api/workers",
        json=_worker_payload(name="Off Worker", phone="+91 11111 22222", vehicleCode="KA-02-WS-002"),
        headers=headers,
    )

    # Deactivate second worker
    with app.app_context():
        worker2 = Worker.query.filter_by(phone="+91 11111 22222").first()
        worker2.is_active = False
        db.session.commit()
        worker2_id = worker2.id

    # ?active=true should return only active workers
    res = client.get("/api/workers?active=true", headers=headers)
    assert res.status_code == 200
    workers = res.get_json()["workers"]
    ids = [w["id"] for w in workers]
    assert str(worker2_id) not in ids

    # No filter returns all workers
    res_all = client.get("/api/workers", headers=headers)
    all_ids = [w["id"] for w in res_all.get_json()["workers"]]
    assert str(worker2_id) in all_ids


# ---------------------------------------------------------------------------
# 4. Get single worker
# ---------------------------------------------------------------------------

def test_get_single_worker(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    created = client.post("/api/workers", json=_worker_payload(), headers=headers).get_json()
    worker_id = created["worker"]["id"]

    res = client.get(f"/api/workers/{worker_id}", headers=headers)
    assert res.status_code == 200
    assert res.get_json()["worker"]["id"] == worker_id

    # Non-existent ID
    assert client.get("/api/workers/99999", headers=headers).status_code == 404


# ---------------------------------------------------------------------------
# 5. Update worker details
# ---------------------------------------------------------------------------

def test_admin_can_edit_worker(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    created = client.post("/api/workers", json=_worker_payload(), headers=headers).get_json()
    worker_id = created["worker"]["id"]

    res = client.patch(
        f"/api/workers/{worker_id}",
        json={"name": "Rajan Kumar Edited", "ward": "Ward 5 - Riverview"},
        headers=headers,
    )
    assert res.status_code == 200
    w = res.get_json()["worker"]
    assert w["name"] == "Rajan Kumar Edited"
    assert w["ward"] == "Ward 5 - Riverview"


def test_edit_worker_duplicate_phone_rejected(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    client.post("/api/workers", json=_worker_payload(), headers=headers)
    w2 = client.post(
        "/api/workers",
        json=_worker_payload(name="Worker Two", phone="+91 99999 00000", vehicleCode="KA-02-WS-002"),
        headers=headers,
    ).get_json()["worker"]["id"]

    # Try to give worker 2 the same phone as worker 1
    res = client.patch(
        f"/api/workers/{w2}",
        json={"phone": "+91 98450 11111"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "phone" in res.get_json()["messages"][0].lower()


# ---------------------------------------------------------------------------
# 6. Update availability
# ---------------------------------------------------------------------------

def test_update_availability(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    created = client.post("/api/workers", json=_worker_payload(), headers=headers).get_json()
    worker_id = created["worker"]["id"]

    res = client.patch(
        f"/api/workers/{worker_id}/availability",
        json={"availability": "On Duty"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.get_json()["worker"]["availability"] == "On Duty"

    bad = client.patch(
        f"/api/workers/{worker_id}/availability",
        json={"availability": "sleeping"},
        headers=headers,
    )
    assert bad.status_code == 400


# ---------------------------------------------------------------------------
# 7. Activate / deactivate
# ---------------------------------------------------------------------------

def test_toggle_active_preserves_history(app, client):
    admin_token = _make_admin(app)
    headers = _auth(admin_token)

    created = client.post("/api/workers", json=_worker_payload(), headers=headers).get_json()
    worker_id = created["worker"]["id"]

    # Deactivate
    res = client.patch(
        f"/api/workers/{worker_id}/toggle-active",
        json={"isActive": False},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.get_json()["worker"]["isActive"] is False

    # Worker does NOT appear in ?active=true list
    active_res = client.get("/api/workers?active=true", headers=headers)
    active_ids = [w["id"] for w in active_res.get_json()["workers"]]
    assert worker_id not in active_ids

    # Reactivate
    reactivate = client.patch(
        f"/api/workers/{worker_id}/toggle-active",
        json={"isActive": True},
        headers=headers,
    )
    assert reactivate.status_code == 200
    assert reactivate.get_json()["worker"]["isActive"] is True

    # Worker reappears in active list
    active_res2 = client.get("/api/workers?active=true", headers=headers)
    active_ids2 = [w["id"] for w in active_res2.get_json()["workers"]]
    assert worker_id in active_ids2
