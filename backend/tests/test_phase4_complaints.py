"""
Phase 4 backend tests — Complaints CRUD, authorization, image uploads, and workers list.

Covers:
1. Unauthenticated requests (401) on complaints and workers endpoints.
2. Citizen complaint creation via JSON, base64 data URI, and multipart/form-data.
3. Server-side enforcement of citizen_id, initial 'Pending' status, and validation errors (400).
4. Citizen-only scoping on GET /api/complaints and 403 cross-citizen access block on detail route.
5. Admin visibility across all complaints + filtering (status, category, search).
6. Citizen forbidden (403) from modifying complaint status or assigning workers.
7. Admin status updates, worker assignment, status logs, citizen notifications, and persistence.
8. Admin-only GET /api/workers with real SQL task counts.
"""
import base64
import io
import sys
from pathlib import Path
import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.extensions import db
from app.models import ComplaintStatusLog, Notification, User, Worker

# Valid 1x1 PNG bytes for upload tests
TINY_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


@pytest.fixture()
def app(tmp_path):
    """Isolated SQLite in-memory application with temp upload dir per test."""
    application = create_app("testing")
    application.config["COMPLAINT_UPLOAD_FOLDER"] = str(tmp_path / "uploads")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _register_citizen(client, name: str, email: str, password: str = "password123") -> dict:
    res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password, "ward": "Ward 4 - Greenpark Avenue"},
    )
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _provision_admin(app, client, name: str, email: str, password: str = "AdminPwd!99") -> dict:
    runner = app.test_cli_runner()
    result = runner.invoke(
        args=["create-admin", "--name", name, "--email", email, "--password", password]
    )
    assert result.exit_code == 0, result.output
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _sample_complaint_payload(**overrides) -> dict:
    base = {
        "title": "Plastic bottles overflowing near bus bay",
        "description": "Large pile of plastic bottles and wrappers obstructing sidewalk.",
        "category": "Plastic",
        "severity": "High",
        "locationName": "Greenpark Main Road, Bus Bay 3",
        "ward": "Ward 4 - Greenpark Avenue",
        "coordinates": {"lat": 12.9742, "lng": 77.5968},
        "imageUrl": "/assets/images/waste-plastic.svg",
        "aiDetected": True,
        "aiConfidence": 94,
        "estimatedWeightKg": 18.5,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# 1. Unauthenticated requests
# ---------------------------------------------------------------------------


def test_unauthenticated_complaints_and_workers_return_401(client):
    assert client.get("/api/complaints").status_code == 401
    assert client.get("/api/complaints/WS-2026-1001").status_code == 401
    assert client.post("/api/complaints", json=_sample_complaint_payload()).status_code == 401
    assert client.patch("/api/complaints/WS-2026-1001", json={"status": "Resolved"}).status_code == 401
    assert client.get("/api/workers").status_code == 401


# ---------------------------------------------------------------------------
# 2. Creation, persistence, image uploads, and validation
# ---------------------------------------------------------------------------


def test_create_complaint_persists_and_ignores_spoofed_fields(app, client):
    citizen_auth = _register_citizen(client, "Aarav Sharma", "aarav@example.com")
    admin_auth = _provision_admin(app, client, "Priya Menon", "admin@example.com")

    # Attempt to spoof citizenId, status, and assignedWorkerId in request JSON
    res = client.post(
        "/api/complaints",
        headers=_auth_header(citizen_auth["token"]),
        json=_sample_complaint_payload(
            citizenId="99999",
            status="Resolved",
            assignedWorkerId="1",
            id="WS-FAKE-9999",
        ),
    )
    assert res.status_code == 201, res.get_json()
    created = res.get_json()["complaint"]

    assert created["id"].startswith("WS-")
    assert created["id"] != "WS-FAKE-9999"
    assert created["citizenId"] == citizen_auth["user"]["id"]
    assert created["citizenName"] == "Aarav Sharma"
    assert created["status"] == "Pending"
    assert created["assignedWorkerId"] is None
    assert created["aiDetected"] is True
    assert created["aiConfidence"] == 94
    assert created["estimatedWeightKg"] == 18.5

    # Verify persisted via GET /api/complaints and GET /api/dashboard/summary
    list_res = client.get("/api/complaints", headers=_auth_header(citizen_auth["token"]))
    assert list_res.status_code == 200
    assert list_res.get_json()["total"] == 1
    assert list_res.get_json()["complaints"][0]["id"] == created["id"]

    # Verify citizen & admin received real DB notifications and initial status log exists
    cit_notif_res = client.get("/api/notifications", headers=_auth_header(citizen_auth["token"]))
    assert cit_notif_res.get_json()["unreadCount"] == 1

    adm_notif_res = client.get("/api/notifications", headers=_auth_header(admin_auth["token"]))
    assert adm_notif_res.get_json()["unreadCount"] == 1

    detail_res = client.get(
        f"/api/complaints/{created['id']}", headers=_auth_header(citizen_auth["token"])
    )
    assert detail_res.status_code == 200
    logs = detail_res.get_json()["statusLogs"]
    assert len(logs) == 1
    assert logs[0]["status"] == "Pending"


def test_create_complaint_with_base64_and_multipart_uploads(client):
    citizen = _register_citizen(client, "Upload Citizen", "uploader@example.com")
    b64_png = base64.b64encode(TINY_PNG_BYTES).decode("ascii")

    # 1) JSON payload with base64 data URI
    res1 = client.post(
        "/api/complaints",
        headers=_auth_header(citizen["token"]),
        json=_sample_complaint_payload(imageUrl=f"data:image/png;base64,{b64_png}"),
    )
    assert res1.status_code == 201, res1.get_json()
    img_url_1 = res1.get_json()["complaint"]["imageUrl"]
    assert img_url_1.startswith("/api/complaints/uploads/")
    assert img_url_1.endswith(".png")

    img_fetch_1 = client.get(img_url_1)
    assert img_fetch_1.status_code == 200
    assert img_fetch_1.data == TINY_PNG_BYTES

    # 2) multipart/form-data file upload
    res2 = client.post(
        "/api/complaints",
        headers=_auth_header(citizen["token"]),
        data={
            "title": "Multipart waste photo report",
            "description": "Uploaded directly from browser camera input.",
            "category": "Organic",
            "severity": "Medium",
            "locationName": "Market Crossroad",
            "ward": "Ward 2 - Central Market",
            "latitude": "12.9688",
            "longitude": "77.6041",
            "aiDetected": "false",
            "aiConfidence": "0",
            "estimatedWeightKg": "12.0",
            "image": (io.BytesIO(TINY_PNG_BYTES), "garbage.png"),
        },
        content_type="multipart/form-data",
    )
    assert res2.status_code == 201, res2.get_json()
    img_url_2 = res2.get_json()["complaint"]["imageUrl"]
    assert img_url_2.startswith("/api/complaints/uploads/")
    assert client.get(img_url_2).status_code == 200

    # Path traversal attempt must fail cleanly
    assert client.get("/api/complaints/uploads/../../etc/passwd").status_code == 404


def test_create_complaint_validation_errors_return_400(client):
    citizen = _register_citizen(client, "Validator User", "val@example.com")
    headers = _auth_header(citizen["token"])

    assert client.post("/api/complaints", headers=headers, json=_sample_complaint_payload(title="Hi")).status_code == 400
    assert client.post("/api/complaints", headers=headers, json=_sample_complaint_payload(category="Toxic")).status_code == 400
    assert client.post("/api/complaints", headers=headers, json=_sample_complaint_payload(coordinates={"lat": 120, "lng": 77})).status_code == 400
    assert client.post("/api/complaints", headers=headers, json=_sample_complaint_payload(imageUrl="javascript:alert(1)")).status_code == 400
    assert client.post("/api/complaints", headers=headers, json=_sample_complaint_payload(estimatedWeightKg=-5)).status_code == 400


# ---------------------------------------------------------------------------
# 3. Citizen vs Admin authorization & isolation
# ---------------------------------------------------------------------------


def test_citizen_isolation_and_admin_global_visibility(app, client):
    cit_a = _register_citizen(client, "Citizen Alpha", "alpha@example.com")
    cit_b = _register_citizen(client, "Citizen Beta", "beta@example.com")
    admin = _provision_admin(app, client, "Priya Admin", "admin@example.com")

    res_a = client.post(
        "/api/complaints",
        headers=_auth_header(cit_a["token"]),
        json=_sample_complaint_payload(title="Alpha plastic report", category="Plastic"),
    )
    res_b = client.post(
        "/api/complaints",
        headers=_auth_header(cit_b["token"]),
        json=_sample_complaint_payload(title="Beta organic report", category="Organic"),
    )
    ticket_a = res_a.get_json()["complaint"]["id"]
    ticket_b = res_b.get_json()["complaint"]["id"]

    # Citizen Alpha only sees own complaint
    list_a = client.get("/api/complaints", headers=_auth_header(cit_a["token"])).get_json()
    assert [c["id"] for c in list_a["complaints"]] == [ticket_a]

    # Citizen Beta only sees own complaint
    list_b = client.get("/api/complaints", headers=_auth_header(cit_b["token"])).get_json()
    assert [c["id"] for c in list_b["complaints"]] == [ticket_b]

    # Cross-citizen detail access must return 403 Forbidden
    forbidden = client.get(f"/api/complaints/{ticket_b}", headers=_auth_header(cit_a["token"]))
    assert forbidden.status_code == 403

    # Admin sees both complaints and can filter by category/search
    admin_all = client.get("/api/complaints", headers=_auth_header(admin["token"])).get_json()
    assert admin_all["total"] == 2
    assert {c["id"] for c in admin_all["complaints"]} == {ticket_a, ticket_b}

    filtered = client.get(
        "/api/complaints?category=Organic&search=Beta",
        headers=_auth_header(admin["token"]),
    ).get_json()
    assert filtered["total"] == 1
    assert filtered["complaints"][0]["id"] == ticket_b


# ---------------------------------------------------------------------------
# 4. Status updates, worker assignment, and RBAC
# ---------------------------------------------------------------------------


def test_citizen_cannot_update_complaint_and_admin_updates_persist(app, client):
    cit = _register_citizen(client, "Citizen Reporter", "reporter@example.com")
    admin = _provision_admin(app, client, "Priya Admin", "admin@example.com")

    with app.app_context():
        worker = Worker(
            name="Ramesh Kumar",
            role_title="Sanitation Supervisor",
            ward="Ward 4 - Greenpark Avenue",
            phone="+91 97401 33210",
            availability="Available",
            vehicle_code="EV-SAN-04",
        )
        db.session.add(worker)
        db.session.commit()
        worker_id = str(worker.id)

    create_res = client.post(
        "/api/complaints",
        headers=_auth_header(cit["token"]),
        json=_sample_complaint_payload(title="Needs pickup at 4th Cross"),
    )
    ticket = create_res.get_json()["complaint"]["id"]

    # Citizen cannot update status — even on their own complaint!
    cit_patch_1 = client.patch(
        f"/api/complaints/{ticket}",
        headers=_auth_header(cit["token"]),
        json={"status": "Resolved"},
    )
    assert cit_patch_1.status_code == 403

    cit_patch_2 = client.patch(
        f"/api/complaints/{ticket}/status",
        headers=_auth_header(cit["token"]),
        json={"status": "In Progress"},
    )
    assert cit_patch_2.status_code == 403

    # Citizen cannot access admin workers list
    assert client.get("/api/workers", headers=_auth_header(cit["token"])).status_code == 403

    # Admin fetches workers list
    workers_res = client.get("/api/workers", headers=_auth_header(admin["token"]))
    assert workers_res.status_code == 200
    assert len(workers_res.get_json()["workers"]) == 1
    assert workers_res.get_json()["workers"][0]["id"] == worker_id

    # Admin assigns worker & marks Assigned
    assign_res = client.patch(
        f"/api/complaints/{ticket}",
        headers=_auth_header(admin["token"]),
        json={"assignedWorkerId": worker_id, "status": "Assigned"},
    )
    assert assign_res.status_code == 200, assign_res.get_json()
    assigned_data = assign_res.get_json()["complaint"]
    assert assigned_data["status"] == "Assigned"
    assert assigned_data["assignedWorkerId"] == worker_id
    assert assigned_data["assignedWorkerName"] == "Ramesh Kumar"

    # Admin updates status to Resolved via /status endpoint
    resolve_res = client.patch(
        f"/api/complaints/{ticket}/status",
        headers=_auth_header(admin["token"]),
        json={"status": "Resolved", "resolutionNotes": "Site cleared and sanitized."},
    )
    assert resolve_res.status_code == 200
    resolved_data = resolve_res.get_json()["complaint"]
    assert resolved_data["status"] == "Resolved"
    assert resolved_data["resolutionNotes"] == "Site cleared and sanitized."

    # Verify citizen sees updated complaint & timeline logs + notifications + dashboard metrics
    detail_after = client.get(
        f"/api/complaints/{ticket}", headers=_auth_header(cit["token"])
    ).get_json()
    assert detail_after["complaint"]["status"] == "Resolved"
    assert [log["status"] for log in detail_after["statusLogs"]] == [
        "Pending",
        "Assigned",
        "Resolved",
    ]

    summary_after = client.get(
        "/api/dashboard/summary", headers=_auth_header(cit["token"])
    ).get_json()
    assert summary_after["metrics"]["totalComplaints"] == 1
    assert summary_after["metrics"]["resolvedIssues"] == 1
    assert summary_after["metrics"]["resolutionRate"] == 100.0

    notifs_after = client.get(
        "/api/notifications", headers=_auth_header(cit["token"])
    ).get_json()
    # Submitted + Assigned + Resolved = 3 notifications
    assert notifs_after["unreadCount"] == 3

    # Unknown complaint / invalid worker error checks
    assert (
        client.patch(
            "/api/complaints/WS-9999-9999",
            headers=_auth_header(admin["token"]),
            json={"status": "Resolved"},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/complaints/{ticket}",
            headers=_auth_header(admin["token"]),
            json={"assignedWorkerId": "9999"},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/complaints/{ticket}",
            headers=_auth_header(admin["token"]),
            json={"status": "InvalidStatus"},
        ).status_code
        == 400
    )
