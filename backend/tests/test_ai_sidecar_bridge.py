"""
AI Integration Phase 2 tests — Flask Backend Bridge + Live AI Sidecar Service.

Tests:
1. Unauthenticated POST /api/detect returns 401.
2. Unsupported SVG and invalid TXT uploads return 400.
3. Oversized (>10 MB) upload returns 413.
4. AI service unavailable returns 503 (never fake detections).
5. AI service timeout returns 504 safely.
6. Live end-to-end integration against the real localhost AI Sidecar (Python/.venv):
   - 1_bottle.jpg -> detected=True, raw COCO labels, raw pixel bboxes, raw confidence,
     imageDimensions, annotatedImageUrl served safely via Flask, no invented waste category.
   - 4_clean_scene.jpg -> detected=False, detections=[], totalDetections=0.
   - 5_invalid_file.txt -> rejected cleanly with 400.
"""
from __future__ import annotations

import io
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.extensions import db

AI_PYTHON_EXE = Path(
    r"C:\Users\HP\Downloads\Smart_Urban_Management-main\Smart_Urban_Management-main\Python\.venv\Scripts\python.exe"
)
AI_SAMPLES_DIR = Path(
    r"C:\Users\HP\Downloads\Smart_Urban_Management-main\Smart_Urban_Management-main\Python\ai\samples"
)
SIDECAR_SCRIPT = BACKEND_ROOT / "ai_service" / "server.py"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture()
def app(tmp_path):
    application = create_app("testing")
    application.config["COMPLAINT_UPLOAD_FOLDER"] = str(tmp_path / "uploads")
    application.config["DETECT_OUTPUT_FOLDER"] = str(tmp_path / "ai_outputs")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _citizen_headers(client) -> dict[str, str]:
    res = client.post(
        "/api/auth/register",
        json={"name": "AI Tester", "email": "aitester@example.com", "password": "password123"},
    )
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.get_json()['token']}"}


def test_detect_requires_auth_and_rejects_invalid_and_oversized_uploads(app, client):
    # 1. Unauthenticated -> 401
    assert client.post("/api/detect", json={}).status_code == 401

    headers = _citizen_headers(client)

    # 2. Invalid TXT file -> 400
    txt_res = client.post(
        "/api/detect",
        headers=headers,
        data={"image": (io.BytesIO(b"not an image"), "notes.txt")},
        content_type="multipart/form-data",
    )
    assert txt_res.status_code == 400

    # 3. Unsupported SVG file -> 400
    svg_res = client.post(
        "/api/detect",
        headers=headers,
        data={"image": (io.BytesIO(b"<svg></svg>"), "waste.svg")},
        content_type="multipart/form-data",
    )
    assert svg_res.status_code == 400

    svg_json_res = client.post(
        "/api/detect",
        headers=headers,
        json={"imageUrl": "/assets/images/waste-plastic.svg"},
    )
    assert svg_json_res.status_code == 400

    # 4. Oversized upload (> 10 MB) -> 413
    oversized = b"\x89PNG\r\n\x1a\n" + (b"\x00" * (10 * 1024 * 1024 + 100))
    big_res = client.post(
        "/api/detect",
        headers=headers,
        data={"image": (io.BytesIO(oversized), "huge.png")},
        content_type="multipart/form-data",
    )
    assert big_res.status_code == 413


def test_detect_handles_unavailable_and_timeout_without_fake_fallback(app, client, monkeypatch):
    headers = _citizen_headers(client)
    # Point to an unused localhost port so connection fails immediately
    app.config["AI_SERVICE_URL"] = f"http://127.0.0.1:{_free_port()}"

    st = client.get("/api/detect/status").get_json()
    assert st["available"] is False
    assert st["mode"] == "unavailable"

    tiny_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00"
        b"\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    offline_res = client.post(
        "/api/detect",
        headers=headers,
        data={"image": (io.BytesIO(tiny_png), "sample.png")},
        content_type="multipart/form-data",
    )
    assert offline_res.status_code == 503
    assert offline_res.get_json()["success"] is False

    # Simulate sidecar timeout -> 504
    def _raise_timeout(*_args, **_kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr("app.routes.detect.urllib_request.urlopen", _raise_timeout)
    timeout_res = client.post(
        "/api/detect",
        headers=headers,
        data={"image": (io.BytesIO(tiny_png), "sample.png")},
        content_type="multipart/form-data",
    )
    assert timeout_res.status_code == 504


@pytest.mark.skipif(
    not AI_PYTHON_EXE.is_file() or not AI_SAMPLES_DIR.is_dir(),
    reason="External AI .venv or sample images not present on host",
)
def test_live_ai_sidecar_integration_bottle_clean_and_invalid(app, client, tmp_path):
    """Spawn the real AI sidecar in Python/.venv on a free localhost port and test end-to-end via Flask."""
    port = _free_port()
    env = os.environ.copy()
    env["AI_SIDECAR_PORT"] = str(port)
    env["AI_SIDECAR_TMP_DIR"] = str(tmp_path / "sidecar_tmp")
    env["AI_SIDECAR_OUTPUT_DIR"] = str(tmp_path / "sidecar_out")

    proc = subprocess.Popen(
        [str(AI_PYTHON_EXE), str(SIDECAR_SCRIPT)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        # Wait for sidecar /health to become ready (YOLO load takes a couple seconds)
        ready = False
        for _ in range(45):
            if proc.poll() is not None:
                out = proc.stdout.read() if proc.stdout else ""
                pytest.fail(f"AI sidecar exited prematurely:\n{out}")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.0) as r:
                    if r.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.5)
        assert ready, "AI sidecar failed to become ready in time"

        app.config["AI_SERVICE_URL"] = f"http://127.0.0.1:{port}"
        headers = _citizen_headers(client)

        # 1. Status reports available
        st = client.get("/api/detect/status").get_json()
        assert st["available"] is True
        assert st["modelLoaded"] is True

        # 2. Bottle sample -> detected=True, raw COCO labels, raw pixel bbox, raw confidence
        bottle_bytes = (AI_SAMPLES_DIR / "1_bottle.jpg").read_bytes()
        bottle_res = client.post(
            "/api/detect",
            headers=headers,
            data={"image": (io.BytesIO(bottle_bytes), "1_bottle.jpg")},
            content_type="multipart/form-data",
        )
        assert bottle_res.status_code == 200, bottle_res.get_json()
        bdata = bottle_res.get_json()
        assert bdata["success"] is True
        assert bdata["detected"] is True
        assert bdata["totalDetections"] > 0
        assert "category" not in bdata  # Never invent WasteSmart categories from COCO labels
        assert isinstance(bdata["imageDimensions"], list) and len(bdata["imageDimensions"]) == 2

        first_det = bdata["detections"][0]
        assert isinstance(first_det["class_name"], str)
        assert 0.0 < first_det["confidence"] <= 1.0
        assert isinstance(first_det["bbox"], list) and len(first_det["bbox"]) == 4

        # Annotated output must be fetchable through Flask without touching port 5001
        ann_url = bdata["annotatedImageUrl"]
        assert ann_url and ann_url.startswith("/api/detect/outputs/")
        ann_resp = client.get(ann_url)
        assert ann_resp.status_code == 200
        assert len(ann_resp.data) > 0

        # 3. Clean scene sample -> detected=False, detections=[], totalDetections=0
        clean_bytes = (AI_SAMPLES_DIR / "4_clean_scene.jpg").read_bytes()
        clean_res = client.post(
            "/api/detect",
            headers=headers,
            data={"image": (io.BytesIO(clean_bytes), "4_clean_scene.jpg")},
            content_type="multipart/form-data",
        )
        assert clean_res.status_code == 200
        cdata = clean_res.get_json()
        assert cdata["success"] is True
        assert cdata["detected"] is False
        assert cdata["totalDetections"] == 0
        assert cdata["detections"] == []

        # 4. Corrupt image disguised with .jpg extension -> rejected cleanly with 400
        fake_jpg_bytes = (AI_SAMPLES_DIR / "5_invalid_file.txt").read_bytes()
        bad_img_res = client.post(
            "/api/detect",
            headers=headers,
            data={"image": (io.BytesIO(fake_jpg_bytes), "disguised.jpg")},
            content_type="multipart/form-data",
        )
        assert bad_img_res.status_code == 400
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
