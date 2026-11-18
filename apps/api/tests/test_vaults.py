"""اختبارات نظام الخزن وحفظ الملفات المستوردة لجميع الصيغ."""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

_TMP = Path(tempfile.mkdtemp(prefix="edu-test-vault-"))
os.environ.setdefault("EDU_DATABASE_URL", f"sqlite:///{(_TMP / 'test.db').as_posix()}")
os.environ.setdefault("EDU_STORAGE_DIR", str(_TMP / "storage"))
os.environ.setdefault("EDU_SECRET_KEY", "test-secret")

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_vaults_lifecycle_and_multiformat(client: TestClient):
    # 1. تسجيل مستخدم جديد
    user_res = client.post(
        "/api/auth/register",
        json={"email": "vault_teacher@example.com", "password": "password123", "name": "معلم الخزينة", "role": "teacher"},
    )
    assert user_res.status_code == 201

    # 2. إنشاء خزينة جديدة
    v_res = client.post(
        "/api/vaults",
        json={"name": "خزينة المواد الخارجية", "description": "مستودع للملفات والمشاريع", "icon": "📦"},
    )
    assert v_res.status_code == 201
    vault = v_res.json()
    assert vault["name"] == "خزينة المواد الخارجية"
    assert vault["file_count"] == 0
    assert vault["total_size"] == 0
    vault_id = vault["id"]

    # 3. رفع ملفات بصيغ متنوعة لا يسمح بها نظام assets العادي (ZIP, PY, DOCX, EXE, BIN)
    # ملف مضغوط ZIP
    zip_bytes = b"PK\x03\x04fake_zip_content_here"
    up_zip = client.post(
        f"/api/vaults/{vault_id}/upload?description=مشروع مضغوط",
        files={"file": ("project.zip", zip_bytes, "application/zip")},
    )
    assert up_zip.status_code == 200, up_zip.text
    zip_data = up_zip.json()
    assert zip_data["filename"] == "project.zip"
    assert zip_data["ext"] == ".zip"
    assert zip_data["size"] == len(zip_bytes)
    assert zip_data["source_type"] == "upload"

    # كود بايثون PY
    py_bytes = b"print('Hello from external imported script!')\n"
    up_py = client.post(
        f"/api/vaults/{vault_id}/upload",
        files={"file": ("script.py", py_bytes, "text/x-python")},
    )
    assert up_py.status_code == 200
    py_data = up_py.json()
    assert py_data["ext"] == ".py"

    # ملف تنفيذي EXE
    exe_bytes = b"MZ\x90\x00fake_executable_binary"
    up_exe = client.post(
        f"/api/vaults/{vault_id}/upload",
        files={"file": ("setup.exe", exe_bytes, "application/octet-stream")},
    )
    assert up_exe.status_code == 200
    exe_data = up_exe.json()
    assert exe_data["ext"] == ".exe"

    # ملف بدون امتداد
    no_ext_bytes = b"raw binary or config data"
    up_no_ext = client.post(
        f"/api/vaults/{vault_id}/upload",
        files={"file": ("README_RAW", no_ext_bytes, "application/octet-stream")},
    )
    assert up_no_ext.status_code == 200
    assert up_no_ext.json()["filename"] == "README_RAW"

    # 4. فحص قائمة الملفات وتفاصيل الخزينة
    detail_res = client.get(f"/api/vaults/{vault_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["file_count"] == 4
    assert detail["total_size"] == len(zip_bytes) + len(py_bytes) + len(exe_bytes) + len(no_ext_bytes)
    assert len(detail["files"]) == 4

    # 5. فحص التصفية حسب الفئة
    filter_archive = client.get(f"/api/vaults/{vault_id}?category=archive")
    assert filter_archive.status_code == 200
    assert len(filter_archive.json()["files"]) == 1
    assert filter_archive.json()["files"][0]["ext"] == ".zip"

    filter_code = client.get(f"/api/vaults/{vault_id}?category=code")
    assert filter_code.status_code == 200
    assert len(filter_code.json()["files"]) == 1
    assert filter_code.json()["files"][0]["ext"] == ".py"

    # 6. تحميل الملف والتحقق من الترويسات
    dl_res = client.get(f"/api/vaults/{vault_id}/files/{zip_data['id']}/download")
    assert dl_res.status_code == 200
    assert dl_res.content == zip_bytes
    assert "attachment" in dl_res.headers.get("content-disposition", "")
    assert "project.zip" in dl_res.headers.get("content-disposition", "")

    # 7. معاينة وفحص محتوى الملف داخل الخزينة بصيغته الأصلية (Inspect / Read)
    view_res = client.get(f"/api/vaults/{vault_id}/files/{py_data['id']}/view")
    assert view_res.status_code == 200
    assert view_res.content == py_bytes
    assert "inline" in view_res.headers.get("content-disposition", "")

    # فحص الكود
    inspect_py = client.get(f"/api/vaults/{vault_id}/files/{py_data['id']}/inspect")
    assert inspect_py.status_code == 200
    py_inspect_data = inspect_py.json()
    assert py_inspect_data["preview_data"]["kind"] == "code"
    assert py_inspect_data["preview_data"]["language"] == "python"
    assert "Hello from external imported script" in py_inspect_data["preview_data"]["content"]

    # فحص محتوى الأرشيف ZIP
    inspect_zip = client.get(f"/api/vaults/{vault_id}/files/{zip_data['id']}/inspect")
    assert inspect_zip.status_code == 200
    assert inspect_zip.json()["preview_data"]["kind"] == "archive"

    # 8. تعديل اسم ووصف الملف
    patch_res = client.patch(
        f"/api/vaults/{vault_id}/files/{py_data['id']}",
        json={"filename": "main_script.py", "description": "السكربت الرئيسي"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["filename"] == "main_script.py"
    assert patch_res.json()["description"] == "السكربت الرئيسي"

    # 9. استيراد ملف من رابط خارجي (External URL Import) مع فحص الحماية من SSRF
    # فحص منع الروابط المحلية الخاصة (SSRF Protection)
    ssrf_res = client.post(
        f"/api/vaults/{vault_id}/import-url",
        json={"url": "http://127.0.0.1:8000/internal", "description": "محاولة اختراق داخلي"},
    )
    assert ssrf_res.status_code == 400
    assert "SSRF" in ssrf_res.text or "داخلية" in ssrf_res.text

    ssrf_res2 = client.post(
        f"/api/vaults/{vault_id}/import-url",
        json={"url": "http://localhost/secret", "description": "محاولة اختراق داخلي"},
    )
    assert ssrf_res2.status_code == 400

    # استيراد سليم
    fake_content = b"PDF_DOCUMENT_CONTENT_SAMPLE"

    class FakeResponse:
        status_code = 200
        headers = {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="external_guide.pdf"',
        }

        async def aiter_bytes(self, chunk_size=1024):
            yield fake_content

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        def stream(self, method, url):
            return FakeResponse()

    with patch("httpx.AsyncClient", return_value=FakeClient()):
        ext_res = client.post(
            f"/api/vaults/{vault_id}/import-url",
            json={"url": "https://example.com/downloads/manual.pdf", "description": "دليل من جهة خارجية", "folder": "مراجع", "tags": ["مهم", "pdf"]},
        )
        assert ext_res.status_code == 200, ext_res.text
        ext_file = ext_res.json()
        assert ext_file["source_type"] == "external_url"
        assert ext_file["source_url"] == "https://example.com/downloads/manual.pdf"
        assert ext_file["filename"] == "external_guide.pdf"
        assert ext_file["ext"] == ".pdf"
        assert ext_file["size"] == len(fake_content)
        assert ext_file["folder"] == "مراجع"
        assert "مهم" in ext_file["tags"]

    # 9.5 اختبار تصدير الخزينة كـ ZIP كامل
    export_zip_res = client.get(f"/api/vaults/{vault_id}/export-zip")
    assert export_zip_res.status_code == 200
    assert export_zip_res.headers.get("content-type") == "application/zip"
    assert len(export_zip_res.content) > 0

    # 10. نقل ملف إلى خزينة ثانية
    v2_res = client.post("/api/vaults", json={"name": "الخزينة الثانية", "icon": "📁"})
    assert v2_res.status_code == 201
    v2_id = v2_res.json()["id"]

    move_res = client.patch(
        f"/api/vaults/{vault_id}/files/{zip_data['id']}",
        json={"vault_id": v2_id},
    )
    assert move_res.status_code == 200
    assert move_res.json()["vault_id"] == v2_id

    # اختبار العمليات الجماعية: التحميل الجماعي كـ ZIP
    bulk_dl_res = client.post(
        f"/api/vaults/{vault_id}/files/bulk-download-zip",
        json={"file_ids": [py_data["id"], exe_data["id"]]},
    )
    assert bulk_dl_res.status_code == 200
    assert bulk_dl_res.headers.get("content-type") == "application/zip"

    # اختبار العمليات الجماعية: النقل الجماعي
    bulk_move_res = client.post(
        f"/api/vaults/{vault_id}/files/bulk-move",
        json={"file_ids": [py_data["id"], exe_data["id"]], "target_vault_id": v2_id},
    )
    assert bulk_move_res.status_code == 200
    assert bulk_move_res.json()["moved_count"] == 2

    # اختبار العمليات الجماعية: الحذف الجماعي
    bulk_del_res = client.post(
        f"/api/vaults/{v2_id}/files/bulk-delete",
        json={"file_ids": [py_data["id"], exe_data["id"]]},
    )
    assert bulk_del_res.status_code == 204

    # 11. حذف ملف
    del_res = client.delete(f"/api/vaults/{v2_id}/files/{zip_data['id']}")
    assert del_res.status_code == 204

    # 12. حذف خزينة كاملة
    del_v_res = client.delete(f"/api/vaults/{vault_id}")
    assert del_v_res.status_code == 204

    # التحقق من أن الخزينة لم تعد موجودة
    check_v = client.get(f"/api/vaults/{vault_id}")
    assert check_v.status_code == 404
