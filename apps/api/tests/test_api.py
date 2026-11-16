"""اختبارات المسار الكامل: تسجيل ← مادة ← نشر ← تصدير ← استيراد ← دراسة."""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="edu-test-"))
os.environ["EDU_DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["EDU_STORAGE_DIR"] = str(_TMP / "storage")
os.environ["EDU_SECRET_KEY"] = "test-secret"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register(client: TestClient, email: str, name: str, role: str = "teacher"):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "name": name, "role": role},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _course_with_content(client: TestClient) -> dict:
    created = client.post("/api/courses", json={"title": "الرياضيات", "description": "منهج"})
    assert created.status_code == 201, created.text
    course = created.json()

    asset = client.post(
        "/api/assets",
        files={"file": ("intro.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "image/png")},
    )
    assert asset.status_code == 200, asset.text
    sha = asset.json()["sha256"]

    draft = {
        "id": course["id"],
        "title": "الرياضيات",
        "units": [
            {
                "id": "unit_1",
                "title": "الوحدة الأولى",
                "order": 0,
                "lessons": [
                    {
                        "id": "les_1",
                        "title": "درس تجريبي",
                        "order": 0,
                        "blocks": [
                            {"id": "b1", "type": "heading", "level": 2, "text": "مرحباً"},
                            {"id": "b2", "type": "image", "assetSha256": sha},
                        ],
                    }
                ],
            }
        ],
    }
    updated = client.patch(f"/api/courses/{course['id']}", json={"draft": draft})
    assert updated.status_code == 200, updated.text
    return updated.json()


def test_health(client: TestClient):
    assert client.get("/api/health").json()["status"] == "ok"


def test_auth_flow(client: TestClient):
    _register(client, "teacher@example.com", "أ. محمد")
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "teacher@example.com"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_duplicate_email_rejected(client: TestClient):
    _register(client, "dup@example.com", "أ")
    response = client.post(
        "/api/auth/register",
        json={"email": "dup@example.com", "password": "password123", "name": "ب"},
    )
    assert response.status_code == 409


def test_full_flow_export_import_study(client: TestClient):
    _register(client, "teacher2@example.com", "أ. سارة")
    course = _course_with_content(client)

    published = client.post(f"/api/courses/{course['id']}/publish")
    assert published.status_code == 201, published.text
    assert published.json()["counts"]["lessons"] == 1

    # --- تصدير ---
    started = client.post(
        "/api/packages/export",
        json={"course_id": course["id"], "protection": "open"},
    )
    assert started.status_code == 202, started.text
    job_id = started.json()["id"]

    package_bytes = None
    for _ in range(100):
        status = client.get(f"/api/packages/{job_id}").json()
        if status["status"] in {"done", "failed"}:
            assert status["status"] == "done", status
            meta = status["meta"]
            assert meta["signed"] is True
            assert meta["counts"]["lessons"] == 1
            assert meta["missingMedia"] == []
            package_bytes = client.get(f"/api/packages/{job_id}/download").content
            break
        time.sleep(0.05)
    assert package_bytes, "لم تُنتج الحزمة"
    assert package_bytes.startswith(b"PK")

    # --- استيراد في حساب آخر ---
    student = TestClient(app)
    _register(student, "student@example.com", "طالب", role="student")

    upload = student.post(
        "/api/packages/import",
        files={"file": ("course.edupkg", package_bytes, "application/octet-stream")},
    )
    assert upload.status_code == 201, upload.text
    preview = upload.json()["meta"]["preview"]
    assert preview["title"] == "الرياضيات"
    assert preview["units"][0]["lessons"] == ["درس تجريبي"]

    import_job = upload.json()["id"]
    committed = student.post(f"/api/packages/{import_job}/commit", json={})
    assert committed.status_code == 200, committed.text
    imported_id = committed.json()["course_id"]

    # --- دراسة ---
    enroll = student.post("/api/library/enroll", json={"course_id": imported_id})
    assert enroll.status_code == 201, enroll.text

    library = student.get("/api/library").json()
    assert library[0]["total_lessons"] == 1

    detail = student.get(f"/api/library/{imported_id}").json()
    assert len(detail["snapshot"]["units"]) == 1

    progress = student.put(
        f"/api/library/{imported_id}/progress/les_1",
        json={"status": "completed", "position": 42},
    )
    assert progress.status_code == 204

    note = student.post(
        f"/api/library/{imported_id}/notes",
        json={"lesson_id": "les_1", "body": "ملاحظة مهمة", "anchor": {"block": "b1"}},
    )
    assert note.status_code == 201

    library = student.get("/api/library").json()
    assert library[0]["completed_lessons"] == 1


def test_encrypted_export_requires_code(client: TestClient):
    _register(client, "teacher3@example.com", "أ. علي")
    course = _course_with_content(client)

    missing = client.post(
        "/api/packages/export",
        json={"course_id": course["id"], "protection": "invite-code"},
    )
    assert missing.status_code == 422

    started = client.post(
        "/api/packages/export",
        json={
            "course_id": course["id"],
            "protection": "invite-code",
            "invite_code": "ABCD-1234",
        },
    )
    job_id = started.json()["id"]
    for _ in range(100):
        status = client.get(f"/api/packages/{job_id}").json()
        if status["status"] in {"done", "failed"}:
            assert status["status"] == "done", status
            break
        time.sleep(0.05)

    data = client.get(f"/api/packages/{job_id}/download").content
    assert data.startswith(b"EDUPKG1\n")

    student = TestClient(app)
    _register(student, "student2@example.com", "طالب٢", role="student")
    upload = student.post(
        "/api/packages/import",
        files={"file": ("locked.edupkg", data, "application/octet-stream")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["meta"]["needsCode"] is True
    assert upload.json()["meta"]["header"]["title"] == "الرياضيات"

    wrong = student.post(
        f"/api/packages/{upload.json()['id']}/commit", json={"invite_code": "WRONG-CODE"}
    )
    assert wrong.status_code == 422

    right = student.post(
        f"/api/packages/{upload.json()['id']}/commit", json={"invite_code": "ABCD-1234"}
    )
    assert right.status_code == 200, right.text


def test_requires_auth(client: TestClient):
    anonymous = TestClient(app)
    assert anonymous.get("/api/courses").status_code == 401


def test_export_course_html(client: TestClient):
    course = _course_with_content(client)
    res = client.get(f"/api/courses/{course['id']}/export-html")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "<!DOCTYPE html>" in res.text
    assert "الرياضيات" in res.text


def test_login_by_name(client: TestClient):
    _register(client, "named_user@example.com", "أحمد علي", role="teacher")
    res = client.post("/api/auth/login", json={"login": "أحمد علي", "password": "password123"})
    assert res.status_code == 200
    assert res.json()["name"] == "أحمد علي"


def test_update_profile(client: TestClient):
    _register(client, "profile_user@example.com", "سامي", role="teacher")
    update_res = client.patch(
        "/api/auth/profile",
        json={"name": "سامي خالد", "email": "sami_new@example.com"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "سامي خالد"
    assert update_res.json()["email"] == "sami_new@example.com"




def test_user_signing_key_lifecycle():
    from nacl.signing import SigningKey
    from edupkg import b64url_encode
    from app.core.security import decrypt_user_signing_key, generate_user_signing_key

    user_id = "test_user_123"
    pub_key, priv_enc = generate_user_signing_key(user_id)
    assert pub_key and priv_enc
    seed = decrypt_user_signing_key(user_id, priv_enc)
    sk = SigningKey(seed)
    assert b64url_encode(bytes(sk.verify_key)) == pub_key

    # التحقق من أن user_id الخاطئ يفشل فك التشفير
    with pytest.raises(Exception):
        decrypt_user_signing_key("different_user_id", priv_enc)

