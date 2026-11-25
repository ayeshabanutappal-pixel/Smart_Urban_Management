"""
Tests for Flask geocoding proxy endpoints (/api/geocode/search, /api/geocode/reverse).

Mocks upstream Nominatim HTTP calls so automated tests run reliably offline
while verifying authentication, validation, formatting, rate-limit, and upstream errors.
"""
import io
import json
import sys
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError
import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.extensions import db


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


def _register_token(client) -> str:
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Geo Citizen",
            "email": "geo@example.com",
            "password": "password123",
        },
    )
    assert res.status_code == 201
    return res.get_json()["token"]


class _FakeHttpResponse:
    def __init__(self, payload: object):
        self._bytes = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._bytes

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def test_geocode_requires_authentication(client):
    assert client.get("/api/geocode/search?q=Main").status_code == 401
    assert client.get("/api/geocode/reverse?lat=12.97&lng=77.59").status_code == 401


def test_geocode_validation_errors(client):
    token = _register_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/geocode/search?q=a", headers=headers).status_code == 400
    assert client.get("/api/geocode/reverse?lat=bad&lng=77.5", headers=headers).status_code == 400
    assert client.get("/api/geocode/reverse?lat=120&lng=77.5", headers=headers).status_code == 400


def test_geocode_search_and_reverse_success(client):
    token = _register_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    mock_search_rows = [
        {
            "place_id": 12345,
            "lat": "12.975200",
            "lon": "77.604500",
            "display_name": "MG Road, Shanthala Nagar, Bengaluru, Karnataka, 560001, India",
            "address": {
                "road": "MG Road",
                "neighbourhood": "Shanthala Nagar",
                "city": "Bengaluru",
                "state": "Karnataka",
                "postcode": "560001",
            },
        }
    ]

    with patch("app.routes.geocode.urlopen", return_value=_FakeHttpResponse(mock_search_rows)):
        res = client.get("/api/geocode/search?q=MG+Road", headers=headers)
        assert res.status_code == 200
        results = res.get_json()["results"]
        assert len(results) == 1
        assert results[0]["shortLabel"] == "MG Road, Shanthala Nagar, Bengaluru"
        assert results[0]["lat"] == 12.9752
        assert results[0]["lng"] == 77.6045

    mock_reverse_payload = {
        "display_name": "Church Street, Ashok Nagar, Bengaluru, Karnataka, India",
        "address": {
            "road": "Church Street",
            "suburb": "Ashok Nagar",
            "city": "Bengaluru",
        },
    }

    with patch("app.routes.geocode.urlopen", return_value=_FakeHttpResponse(mock_reverse_payload)):
        rev = client.get("/api/geocode/reverse?lat=12.975&lng=77.603", headers=headers)
        assert rev.status_code == 200
        addr = rev.get_json()["address"]
        assert addr["shortLabel"] == "Church Street, Ashok Nagar, Bengaluru"
        assert "Church Street" in addr["displayName"]


def test_geocode_upstream_rate_limit_and_network_errors(client):
    token = _register_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    rate_err = HTTPError(
        url="https://nominatim.openstreetmap.org/search",
        code=429,
        msg="Too Many Requests",
        hdrs=None,
        fp=io.BytesIO(b""),
    )
    with patch("app.routes.geocode.urlopen", side_effect=rate_err):
        res = client.get("/api/geocode/search?q=Bengaluru", headers=headers)
        assert res.status_code == 429

    with patch("app.routes.geocode.urlopen", side_effect=URLError("offline")):
        rev = client.get("/api/geocode/reverse?lat=12.97&lng=77.59", headers=headers)
        assert rev.status_code == 502
