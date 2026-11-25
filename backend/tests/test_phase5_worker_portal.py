"""
Phase 5 backend tests — Worker login, role isolation, task execution,
admin verification (before/after approve/reject), language preference, and AI status hooks.
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

TINY_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


@pytest.fixture()
def app(tmp_path):
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


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_citizen(client, email="citizen1@example.com", name="Citizen One"):
    res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "password123", "ward": "Ward 1"},
    )
    assert res.status_code == 201
    return res.get_json()


def _create_admin(app, client, email="admin@test.city"):
    runner = app.test_cli_runner()
    res_cli = runner.invoke(
        args=["create-admin", "--name", "Admin User", "--email", email, "--password", "AdminStrong!99"]
    )
    assert res_cli.exit_code == 0, res_cli.output
    login_res = client.post("/api/auth/login", json={"email": email, "password": "AdminStrong!99"})
    assert login_res.status_code == 200
    return login_res.get_json()


def _create_worker_with_login(
    client,
    admin_token: str,
    name: str,
    phone: str,
    email: str,
    password: str,
    vehicle: str,
):
    res = client.post(
        "/api/workers",
        headers=_auth(admin_token),
        json={
            "name": name,
            "phone": phone,
            "roleTitle": "Field Sanitation Crew",
            "ward": "Ward 1",
            "vehicleCode": vehicle,
            "availability": "Available",
            "email": email,
            "password": password,
        },
    )
    assert res.status_code == 201, res.get_json()
    return res.get_json()["worker"]


def _file_complaint(client, citizen_token: str, title: str = "Garbage pile at gate"):
    res = client.post(
        "/api/complaints",
        headers=_auth(citizen_token),
        json={
            "title": title,
            "description": "Plastic waste bags blocking footpath.",
            "category": "Plastic",
            "severity": "High",
            "locationName": "Main Road Gate",
            "ward": "Ward 1",
            "coordinates": {"lat": 12.9716, "lng": 77.5946},
            "imageUrl": "/assets/images/waste-plastic.svg",
            "aiDetected": True,
            "aiConfidence": 92,
            "estimatedWeightKg": 15,
        },
    )
    assert res.status_code == 201
    return res.get_json()["complaint"]


def test_worker_login_by_email_and_phone_and_deactivation_blocks_login(app, client):
    admin = _create_admin(app, client)
    worker = _create_worker_with_login(
        client,
        admin["token"],
        name="Bharath Kumar",
        phone="+91 93818 15215",
        email="bharath.worker@wastesmart.city",
        password="WorkerPass!23",
        vehicle="WS-TRK-101",
    )

    # Login by email
    res_email = client.post(
        "/api/auth/login",
        json={"email": "bharath.worker@wastesmart.city", "password": "WorkerPass!23"},
    )
    assert res_email.status_code == 200
    data = res_email.get_json()
    assert data["user"]["role"] == "worker"
    assert data["user"]["workerId"] == worker["id"]
    assert data["user"]["preferredLanguage"] == "en"

    # Login by phone number
    res_phone = client.post(
        "/api/auth/login",
        json={"identifier": "9381815215", "password": "WorkerPass!23"},
    )
    assert res_phone.status_code == 200
    assert res_phone.get_json()["user"]["role"] == "worker"

    # Save language preference (Tamil 'ta')
    pref_res = client.patch(
        "/api/auth/preferences",
        headers=_auth(data["token"]),
        json={"preferredLanguage": "ta"},
    )
    assert pref_res.status_code == 200
    assert pref_res.get_json()["user"]["preferredLanguage"] == "ta"

    # Verify /api/auth/me returns persisted language
    me_res = client.get("/api/auth/me", headers=_auth(data["token"]))
    assert me_res.status_code == 200
    assert me_res.get_json()["user"]["preferredLanguage"] == "ta"

    # Deactivate worker -> token invalid and re-login blocked
    tog = client.patch(
        f"/api/workers/{worker['id']}/toggle-active",
        headers=_auth(admin["token"]),
        json={"isActive": False},
    )
    assert tog.status_code == 200
    assert client.get("/api/worker/tasks", headers=_auth(data["token"])).status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "bharath.worker@wastesmart.city", "password": "WorkerPass!23"},
        ).status_code
        == 401
    )


def test_worker_role_isolation_and_strict_task_scoping(app, client):
    admin = _create_admin(app, client)
    citizen = _register_citizen(client)
    w1 = _create_worker_with_login(
        client, admin["token"], "Worker One", "9000011111", "w1@wastesmart.city", "Pass123!", "TRK-1"
    )
    w2 = _create_worker_with_login(
        client, admin["token"], "Worker Two", "9000022222", "w2@wastesmart.city", "Pass123!", "TRK-2"
    )

    c1 = _file_complaint(client, citizen["token"], "Task for Worker One")
    c2 = _file_complaint(client, citizen["token"], "Task for Worker Two")

    client.patch(
        f"/api/complaints/{c1['id']}",
        headers=_auth(admin["token"]),
        json={"assignedWorkerId": w1["id"], "status": "Assigned"},
    )
    client.patch(
        f"/api/complaints/{c2['id']}",
        headers=_auth(admin["token"]),
        json={"assignedWorkerId": w2["id"], "status": "Assigned"},
    )

    w1_token = client.post(
        "/api/auth/login", json={"email": "w1@wastesmart.city", "password": "Pass123!"}
    ).get_json()["token"]

    # Unauthenticated & wrong roles blocked from /api/worker/tasks
    assert client.get("/api/worker/tasks").status_code == 401
    assert client.get("/api/worker/tasks", headers=_auth(citizen["token"])).status_code == 403
    assert client.get("/api/worker/tasks", headers=_auth(admin["token"])).status_code == 403

    # Worker cannot access admin endpoints or directly resolve complaints
    assert client.get("/api/workers", headers=_auth(w1_token)).status_code == 403
    assert (
        client.patch(
            f"/api/complaints/{c1['id']}",
            headers=_auth(w1_token),
            json={"status": "Resolved"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/complaints/{c1['id']}/verify",
            headers=_auth(w1_token),
            json={"decision": "approve"},
        ).status_code
        == 403
    )

    # Worker 1 only sees c1 on both /api/worker/tasks and /api/complaints
    w1_tasks = client.get("/api/worker/tasks", headers=_auth(w1_token)).get_json()["tasks"]
    assert [t["id"] for t in w1_tasks] == [c1["id"]]

    w1_complaints = client.get("/api/complaints", headers=_auth(w1_token)).get_json()["complaints"]
    assert [t["id"] for t in w1_complaints] == [c1["id"]]

    # Worker 1 cannot view or start Worker 2's task (403)
    assert client.get(f"/api/complaints/{c2['id']}", headers=_auth(w1_token)).status_code == 403
    assert client.patch(f"/api/worker/tasks/{c2['id']}/start", headers=_auth(w1_token)).status_code == 403


def test_full_worker_task_execution_and_admin_reject_then_approve_workflow(app, client):
    admin = _create_admin(app, client)
    citizen = _register_citizen(client)
    worker = _create_worker_with_login(
        client, admin["token"], "Ravi Crew", "9111122222", "ravi@wastesmart.city", "Pass123!", "TRK-9"
    )
    complaint = _file_complaint(client, citizen["token"], "Market corner dump")

    # Admin assigns worker
    client.patch(
        f"/api/complaints/{complaint['id']}",
        headers=_auth(admin["token"]),
        json={"assignedWorkerId": worker["id"], "status": "Assigned"},
    )
    w_token = client.post(
        "/api/auth/login", json={"email": "ravi@wastesmart.city", "password": "Pass123!"}
    ).get_json()["token"]

    # Cannot complete before starting task
    premature = client.post(
        f"/api/worker/tasks/{complaint['id']}/complete",
        headers=_auth(w_token),
        json={"afterImageUrl": f"data:image/png;base64,{base64.b64encode(TINY_PNG_BYTES).decode()}"},
    )
    assert premature.status_code == 400

    # 1. Start task -> In Progress
    start_res = client.patch(
        f"/api/worker/tasks/{complaint['id']}/start",
        headers=_auth(w_token),
    )
    assert start_res.status_code == 200
    assert start_res.get_json()["task"]["status"] == "In Progress"

    # 2. Cannot submit completion without after-cleaning photo
    no_photo = client.post(
        f"/api/worker/tasks/{complaint['id']}/complete",
        headers=_auth(w_token),
        json={"completionNotes": "Cleaned area"},
    )
    assert no_photo.status_code == 400

    # 3. Upload after-photo + notes -> Pending Verification (never Resolved directly!)
    comp_res = client.post(
        f"/api/worker/tasks/{complaint['id']}/complete",
        headers=_auth(w_token),
        data={
            "completionNotes": "Swept footpath and loaded bags onto truck.",
            "afterImage": (io.BytesIO(TINY_PNG_BYTES), "after.png"),
        },
        content_type="multipart/form-data",
    )
    assert comp_res.status_code == 200, comp_res.get_json()
    comp_task = comp_res.get_json()["task"]
    assert comp_task["status"] == "Pending Verification"
    assert comp_task["afterImageUrl"].startswith("/api/complaints/uploads/")
    assert comp_task["completionNotes"] == "Swept footpath and loaded bags onto truck."

    # 4. Admin reject requires rejectionReason
    bad_reject = client.post(
        f"/api/complaints/{complaint['id']}/verify",
        headers=_auth(admin["token"]),
        json={"decision": "reject", "rejectionReason": "  "},
    )
    assert bad_reject.status_code == 400

    # 5. Admin rejects with reason -> returned to worker as Assigned with rejectionReason
    rej_res = client.post(
        f"/api/complaints/{complaint['id']}/verify",
        headers=_auth(admin["token"]),
        json={"decision": "reject", "rejectionReason": "Plastic scraps still visible near drain."},
    )
    assert rej_res.status_code == 200
    rej_data = rej_res.get_json()["complaint"]
    assert rej_data["status"] == "Assigned"
    assert rej_data["assignedWorkerId"] == worker["id"]
    assert rej_data["rejectionReason"] == "Plastic scraps still visible near drain."

    # 6. Worker starts again, uploads updated photo, resubmits -> Pending Verification
    assert client.patch(f"/api/worker/tasks/{complaint['id']}/start", headers=_auth(w_token)).status_code == 200
    b64_png = base64.b64encode(TINY_PNG_BYTES).decode("ascii")
    resub = client.post(
        f"/api/worker/tasks/{complaint['id']}/complete",
        headers=_auth(w_token),
        json={
            "afterImageUrl": f"data:image/png;base64,{b64_png}",
            "completionNotes": "Drain area also cleared and swept.",
        },
    )
    assert resub.status_code == 200
    assert resub.get_json()["task"]["status"] == "Pending Verification"
    assert resub.get_json()["task"]["rejectionReason"] is None

    # 7. Admin approves -> Resolved & worker becomes Available again
    app_res = client.post(
        f"/api/complaints/{complaint['id']}/verify",
        headers=_auth(admin["token"]),
        json={"decision": "approve", "note": "Verified clean against after-photo."},
    )
    assert app_res.status_code == 200
    final_c = app_res.get_json()["complaint"]
    assert final_c["status"] == "Resolved"
    assert final_c["verifiedAt"] is not None
    assert final_c["aiDetected"] is True
    assert final_c["aiConfidence"] == 92

    w_check = client.get(f"/api/workers/{worker['id']}", headers=_auth(admin["token"])).get_json()["worker"]
    assert w_check["availability"] == "Available"
    assert w_check["completedCount"] == 1


def test_ai_status_and_verify_cleanup_never_auto_resolves(app, client, monkeypatch):
    admin = _create_admin(app, client)
    citizen = _register_citizen(client)
    worker = _create_worker_with_login(
        client, admin["token"], "AI Test Worker", "9222233333", "aiw@wastesmart.city", "Pass123!", "TRK-AI"
    )
    complaint = _file_complaint(client, citizen["token"], "AI tagged pile")

    # Status reports real server capability (boolean) and never auto-resolves
    st = client.get("/api/detect/status").get_json()
    assert isinstance(st["available"], bool)
    assert st["autoResolveSupported"] is False

    # POST /api/detect requires JWT authentication -> 401 when unauthenticated
    assert client.post("/api/detect", json={"imageUrl": "/x.jpg"}).status_code == 401

    # Assign, start, complete complaint
    client.patch(
        f"/api/complaints/{complaint['id']}",
        headers=_auth(admin["token"]),
        json={"assignedWorkerId": worker["id"], "status": "Assigned"},
    )
    w_token = client.post(
        "/api/auth/login", json={"email": "aiw@wastesmart.city", "password": "Pass123!"}
    ).get_json()["token"]
    client.patch(f"/api/worker/tasks/{complaint['id']}/start", headers=_auth(w_token))
    b64_png = base64.b64encode(TINY_PNG_BYTES).decode("ascii")
    client.post(
        f"/api/worker/tasks/{complaint['id']}/complete",
        headers=_auth(w_token),
        json={"afterImageUrl": f"data:image/png;base64,{b64_png}"},
    )

    # Advisory cleanup check returns advisoryOnly=True, autoResolved=False and leaves complaint Pending Verification
    chk = client.post(
        "/api/detect/verify-cleanup",
        headers=_auth(admin["token"]),
        json={"complaintId": complaint["id"]},
    )
    assert chk.status_code == 200
    chk_data = chk.get_json()
    assert chk_data["advisoryOnly"] is True
    assert chk_data["autoResolved"] is False

    # Even with simulated sidecar hook active, verify-cleanup NEVER changes status to Resolved
    monkeypatch.setattr(
        "app.routes.detect._call_sidecar_detect",
        lambda _raw, _ext: (
            200,
            {"success": True, "detected": False, "detections": [], "totalDetections": 0},
        ),
    )
    chk2 = client.post(
        "/api/detect/verify-cleanup",
        headers=_auth(admin["token"]),
        json={"complaintId": complaint["id"]},
    ).get_json()
    assert chk2["yoloAvailable"] is True
    assert chk2["autoResolved"] is False
    detail = client.get(f"/api/complaints/{complaint['id']}", headers=_auth(admin["token"])).get_json()
    assert detail["complaint"]["status"] == "Pending Verification"
