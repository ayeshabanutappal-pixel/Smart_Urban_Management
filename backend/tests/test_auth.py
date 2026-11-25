import sys
from pathlib import Path
import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.extensions import db
from app.models.user import User


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


def test_register_citizen_success(client):
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Aarav Sharma",
            "email": "Aarav@Example.com",
            "password": "securepassword123",
            "phone": "+91 98450 21490",
            "ward": "Ward 4 - Greenpark Avenue",
        },
    )
    assert res.status_code == 201
    data = res.get_json()
    assert "token" in data and isinstance(data["token"], str)
    assert data["user"]["email"] == "aarav@example.com"
    assert data["user"]["role"] == "citizen"
    assert "password_hash" not in data["user"]
    assert "password" not in data["user"]


def test_register_ignores_client_supplied_admin_role(client):
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Malicious Signup",
            "email": "attacker@example.com",
            "password": "securepassword123",
            "role": "admin",
        },
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["user"]["role"] == "citizen"


def test_register_duplicate_email_returns_409(client):
    payload = {
        "name": "Citizen One",
        "email": "dup@example.com",
        "password": "password123",
    }
    first = client.post("/api/auth/register", json=payload)
    assert first.status_code == 201

    second = client.post(
        "/api/auth/register",
        json={**payload, "email": "DUP@EXAMPLE.COM"},
    )
    assert second.status_code == 409
    assert second.get_json()["error"] == "Conflict"


def test_register_validation_errors(client):
    bad_email = client.post(
        "/api/auth/register",
        json={"name": "User", "email": "not-an-email", "password": "password123"},
    )
    assert bad_email.status_code == 400

    short_pwd = client.post(
        "/api/auth/register",
        json={"name": "User", "email": "ok@example.com", "password": "123"},
    )
    assert short_pwd.status_code == 400

    short_name = client.post(
        "/api/auth/register",
        json={"name": "A", "email": "ok@example.com", "password": "password123"},
    )
    assert short_name.status_code == 400


def test_login_success_and_invalid_password(client):
    client.post(
        "/api/auth/register",
        json={
            "name": "Meera Nair",
            "email": "meera@example.com",
            "password": "correcthorsepassword",
        },
    )

    ok_res = client.post(
        "/api/auth/login",
        json={"email": "meera@example.com", "password": "correcthorsepassword"},
    )
    assert ok_res.status_code == 200
    ok_data = ok_res.get_json()
    assert "token" in ok_data
    assert ok_data["user"]["email"] == "meera@example.com"
    assert ok_data["user"]["role"] == "citizen"
    assert "password_hash" not in ok_data["user"]

    bad_pwd = client.post(
        "/api/auth/login",
        json={"email": "meera@example.com", "password": "wrongpassword"},
    )
    assert bad_pwd.status_code == 401

    unknown_email = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "correcthorsepassword"},
    )
    assert unknown_email.status_code == 401


def test_auth_me_and_logout_revocation(client):
    reg = client.post(
        "/api/auth/register",
        json={
            "name": "Vikram Joshi",
            "email": "vikram@example.com",
            "password": "password123",
        },
    )
    token = reg.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    no_auth = client.get("/api/auth/me")
    assert no_auth.status_code == 401

    bad_auth = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
    assert bad_auth.status_code == 401

    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.get_json()["user"]["email"] == "vikram@example.com"

    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    after_logout = client.get("/api/auth/me", headers=headers)
    assert after_logout.status_code == 401
    assert after_logout.get_json()["error"] == "Token Revoked"


def test_role_based_authorization_and_cli_admin_provisioning(app, client):
    # Citizen tries to access admin-only route -> 403 Forbidden
    reg = client.post(
        "/api/auth/register",
        json={
            "name": "Citizen User",
            "email": "cit@example.com",
            "password": "password123",
        },
    )
    cit_token = reg.get_json()["token"]
    cit_res = client.get(
        "/api/auth/admin-check",
        headers={"Authorization": f"Bearer {cit_token}"},
    )
    assert cit_res.status_code == 403

    # Provision admin securely via Flask CLI command
    runner = app.test_cli_runner()
    cli_result = runner.invoke(
        args=[
            "create-admin",
            "--name",
            "Priya Menon",
            "--email",
            "admin@wastesmart.city",
            "--password",
            "AdminStrongPwd!99",
        ]
    )
    assert cli_result.exit_code == 0, cli_result.output

    with app.app_context():
        admin_record = User.query.filter_by(email="admin@wastesmart.city").first()
        assert admin_record is not None
        assert admin_record.role == "admin"

    # Admin logs in (even if client doesn't pass role) and accesses admin route -> 200 OK
    login_res = client.post(
        "/api/auth/login",
        json={
            "email": "admin@wastesmart.city",
            "password": "AdminStrongPwd!99",
        },
    )
    assert login_res.status_code == 200
    admin_token = login_res.get_json()["token"]
    assert login_res.get_json()["user"]["role"] == "admin"

    admin_res = client.get(
        "/api/auth/admin-check",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_res.status_code == 200
    assert admin_res.get_json()["authorized"] is True
    assert admin_res.get_json()["role"] == "admin"


def test_init_admin_command_is_idempotent(app):
    """flask init-admin should create the admin account on first run and
    skip gracefully on all subsequent runs (no duplicate rows, no crash)."""
    import os

    runner = app.test_cli_runner()

    env_patch = {
        "ADMIN_EMAIL": "admin@wastesmart.com",
        "ADMIN_PASSWORD": "WasteSmart@Admin2026",
        "ADMIN_NAME": "Municipal Administrator",
    }

    # ── First invocation: should create the account ───────────────────
    with app.app_context():
        old_environ = {k: os.environ.get(k) for k in env_patch}
        os.environ.update(env_patch)

    result1 = runner.invoke(args=["init-admin"])
    assert result1.exit_code == 0, f"First run failed:\n{result1.output}"
    assert "provisioned" in result1.output.lower()

    # ── Verify the row in the database ────────────────────────────────
    with app.app_context():
        admin = User.query.filter_by(email="admin@wastesmart.com").first()
        assert admin is not None, "Admin user not found after init-admin"
        assert admin.role == "admin"
        assert admin.name == "Municipal Administrator"

        # Password must be stored as a werkzeug hash (bcrypt or scrypt), never plaintext
        assert admin.password_hash is not None
        assert admin.password_hash != "WasteSmart@Admin2026", (
            "Plaintext password must not be stored in the database"
        )
        # werkzeug uses scrypt on Python 3.12+ and pbkdf2/bcrypt on older versions
        valid_prefixes = ("$2b$", "$2a$", "scrypt:", "pbkdf2:")
        assert any(admin.password_hash.startswith(p) for p in valid_prefixes), (
            f"Unexpected hash format: {admin.password_hash[:20]}"
        )
        # Verify the hash actually validates the original password
        assert admin.check_password("WasteSmart@Admin2026"), (
            "Stored hash does not validate the correct password"
        )

    # ── Second invocation: must be idempotent (skip, exit 0) ─────────
    result2 = runner.invoke(args=["init-admin"])
    assert result2.exit_code == 0, f"Second run failed:\n{result2.output}"
    assert "already exists" in result2.output.lower(), (
        "Second run should report account already exists"
    )

    # ── Verify still exactly ONE admin row ────────────────────────────
    with app.app_context():
        count = User.query.filter_by(email="admin@wastesmart.com").count()
        assert count == 1, f"Expected 1 admin row, found {count}"

    # Restore env
    with app.app_context():
        for k, v in old_environ.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
