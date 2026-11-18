"""إدارة الخزن وحفظ الملفات المستوردة من جهات خارجية بجميع الصيغ."""

from __future__ import annotations

import hashlib
import mimetypes
import os
import posixpath
import re
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import ipaddress
import socket
import zipfile

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user
from app.core.config import settings
from app.db.base import get_db
from app.db.models import User, Vault, VaultFile, new_id
from app.schemas import (
    VaultBatchImportUrlsIn,
    VaultBulkDeleteIn,
    VaultBulkDownloadIn,
    VaultBulkMoveIn,
    VaultCreate,
    VaultDetailOut,
    VaultFileInspectOut,
    VaultFileOut,
    VaultFileUpdate,
    VaultImportUrlIn,
    VaultOut,
    VaultUpdate,
)
from app.services.storage import storage
from app.services.vault_inspector import inspect_file

router = APIRouter(prefix="/vaults", tags=["vaults"])

CHUNK_SIZE = 1024 * 1024  # 1MB chunks


def _clean_filename(raw_name: str) -> str:
    """تنظيف اسم الملف لحمايته من المسارات غير الآمنة مع الحفاظ على الحروف العربية والامتداد."""
    clean = posixpath.basename(raw_name.strip().replace("\\", "/"))
    clean = re.sub(r'[\x00-\x1f<>:"/\\|?*]', "_", clean)
    return clean or f"file_{new_id()[:8]}"


def _validate_safe_url(url: str) -> None:
    """التحقق من أمان الرابط لمنع ثغرات SSRF وهجمات الوصول للشبكات الداخلية."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="الرابط يجب أن يبدأ بـ http:// أو https://")

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="رابط غير صالح")

    lower_host = hostname.lower()
    if lower_host in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or lower_host.endswith((".local", ".internal")):
        raise HTTPException(
            status_code=400,
            detail="غير مسموح باستيراد روابط الشبكات الداخلية أو المحلية (SSRF Protection)",
        )

    try:
        ip_obj = ipaddress.ip_address(hostname)
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved or ip_obj.is_multicast:
            raise HTTPException(
                status_code=400,
                detail=f"غير مسموح باستيراد روابط تشير لشبكات داخلية أو عناوين خاصة ({hostname})",
            )
    except ValueError:
        pass

    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for item in addr_info:
            ip_str = item[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved or ip_obj.is_multicast:
                raise HTTPException(
                    status_code=400,
                    detail=f"غير مسموح باستيراد روابط تشير لشبكات داخلية أو عناوين خاصة ({ip_str})",
                )
    except (socket.gaierror, OSError):
        if lower_host in ("localhost",) or lower_host.endswith((".local", ".internal", ".corp", ".lan")):
            raise HTTPException(status_code=400, detail="اسم خادم غير مسموح به (SSRF Protection)")


def _extract_filename_from_url(url: str, headers: dict[str, str] | None = None) -> str:
    """استخراج اسم الملف من ترويسة Content-Disposition أو من مسار الرابط."""
    if headers:
        cd = headers.get("content-disposition", "")
        if "filename*=" in cd:
            match = re.search(r"filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)", cd, re.IGNORECASE)
            if match:
                return urllib.parse.unquote(match.group(1).strip().strip('"\''))
        if "filename=" in cd:
            match = re.search(r'filename\s*=\s*"([^"]+)"', cd) or re.search(r'filename\s*=\s*([^;]+)', cd)
            if match:
                return match.group(1).strip().strip('"\'')

    # من مسار الرابط
    parsed = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(posixpath.basename(parsed.path))
    if path and "." in path:
        return path
    if path:
        return path
    return f"imported_{new_id()[:8]}"


def _guess_mime(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


def _format_file_out(vault_file: VaultFile) -> VaultFileOut:
    download_url = f"{settings.api_prefix}/vaults/{vault_file.vault_id}/files/{vault_file.id}/download"
    view_url = f"{settings.api_prefix}/vaults/{vault_file.vault_id}/files/{vault_file.id}/view"
    return VaultFileOut(
        id=vault_file.id,
        vault_id=vault_file.vault_id,
        user_id=vault_file.user_id,
        filename=vault_file.filename,
        original_name=vault_file.original_name,
        ext=vault_file.ext,
        mime=vault_file.mime,
        size=vault_file.size,
        sha256=vault_file.sha256,
        source_type=vault_file.source_type,
        source_url=vault_file.source_url,
        description=vault_file.description,
        folder=getattr(vault_file, "folder", None),
        tags=getattr(vault_file, "tags", []) or [],
        metadata_info=vault_file.metadata_info or {},
        created_at=vault_file.created_at,
        updated_at=vault_file.updated_at,
        download_url=download_url,
        view_url=view_url,
    )


# --------------------------------------------------------------------------- #
# عمليات الخزائن (Vaults)
# --------------------------------------------------------------------------- #

@router.get("", response_model=list[VaultOut])
def list_vaults(
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """عرض جميع الخزن الخاصة بالمستخدم مع عدد الملفات والحجم الكلي."""
    vaults = db.scalars(
        select(Vault).where(Vault.user_id == user.id).order_by(desc(Vault.created_at))
    ).all()

    results: list[VaultOut] = []
    for v in vaults:
        # إحصائيات الخزينة
        stats = db.execute(
            select(
                func.count(VaultFile.id),
                func.coalesce(func.sum(VaultFile.size), 0),
            ).where(VaultFile.vault_id == v.id)
        ).first()

        count = stats[0] if stats else 0
        total_size = stats[1] if stats else 0

        results.append(
            VaultOut(
                id=v.id,
                name=v.name,
                description=v.description,
                icon=v.icon,
                user_id=v.user_id,
                file_count=count,
                total_size=total_size,
                created_at=v.created_at,
                updated_at=v.updated_at,
            )
        )
    return results


@router.post("", response_model=VaultOut, status_code=201)
def create_vault(
    data: VaultCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """إنشاء خزينة جديدة لحفظ الملفات المستوردة."""
    vault = Vault(
        user_id=user.id,
        name=data.name.strip(),
        description=data.description.strip(),
        icon=data.icon.strip() or "🗄️",
    )
    db.add(vault)
    db.commit()
    db.refresh(vault)

    return VaultOut(
        id=vault.id,
        name=vault.name,
        description=vault.description,
        icon=vault.icon,
        user_id=vault.user_id,
        file_count=0,
        total_size=0,
        created_at=vault.created_at,
        updated_at=vault.updated_at,
    )


@router.get("/{vault_id}", response_model=VaultDetailOut)
def get_vault_detail(
    vault_id: str,
    q: str | None = None,
    category: str | None = None,
    folder: str | None = None,
    tag: str | None = None,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """عرض تفاصيل الخزينة ومحتوياتها من الملفات مع دعم البحث وتصفية المجلدات والوسوم."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    # جمع كافة الملفات لحساب المجلدات والوسوم الإجمالية
    all_vault_files = db.scalars(select(VaultFile).where(VaultFile.vault_id == vault.id)).all()
    available_folders = sorted(list(set(f.folder for f in all_vault_files if getattr(f, "folder", None))))
    available_tags = sorted(list(set(t for f in all_vault_files for t in (getattr(f, "tags", []) or []))))

    query = select(VaultFile).where(VaultFile.vault_id == vault.id).order_by(desc(VaultFile.created_at))

    if q:
        query = query.where(VaultFile.filename.ilike(f"%{q}%") | VaultFile.description.ilike(f"%{q}%"))

    files = db.scalars(query).all()

    # تصفية حسب المجلد
    if folder:
        files = [f for f in files if getattr(f, "folder", None) == folder]

    # تصفية حسب الوسم
    if tag:
        files = [f for f in files if getattr(f, "tags", None) and tag in f.tags]

    # تصفية حسب نوع/فئة الملف إن طُلبت
    if category and category != "all":
        category_exts = {
            "document": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".csv", ".epub", ".odt", ".ods", ".md"},
            "archive": {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".tgz"},
            "media": {".mp4", ".webm", ".mkv", ".avi", ".mov", ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"},
            "image": {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".ico", ".psd", ".ai", ".blend"},
            "code": {".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".xml", ".yaml", ".yml", ".sql", ".sh", ".ps1", ".c", ".cpp", ".java", ".rs", ".go"},
            "binary": {".exe", ".msi", ".apk", ".bin", ".dmg", ".edupkg", ".dll"},
        }
        target_exts = category_exts.get(category, set())
        if target_exts:
            files = [f for f in files if f.ext.lower() in target_exts]

    total_size = sum(f.size for f in files)

    return VaultDetailOut(
        id=vault.id,
        name=vault.name,
        description=vault.description,
        icon=vault.icon,
        user_id=vault.user_id,
        file_count=len(files),
        total_size=total_size,
        created_at=vault.created_at,
        updated_at=vault.updated_at,
        folders=available_folders,
        all_tags=available_tags,
        files=[_format_file_out(f) for f in files],
    )


@router.patch("/{vault_id}", response_model=VaultOut)
def update_vault(
    vault_id: str,
    data: VaultUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """تعديل بيانات الخزينة (الاسم، الوصف، الأيقونة)."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    if data.name is not None:
        vault.name = data.name.strip()
    if data.description is not None:
        vault.description = data.description.strip()
    if data.icon is not None:
        vault.icon = data.icon.strip()

    db.commit()
    db.refresh(vault)

    stats = db.execute(
        select(
            func.count(VaultFile.id),
            func.coalesce(func.sum(VaultFile.size), 0),
        ).where(VaultFile.vault_id == vault.id)
    ).first()

    return VaultOut(
        id=vault.id,
        name=vault.name,
        description=vault.description,
        icon=vault.icon,
        user_id=vault.user_id,
        file_count=stats[0] if stats else 0,
        total_size=stats[1] if stats else 0,
        created_at=vault.created_at,
        updated_at=vault.updated_at,
    )


@router.delete("/{vault_id}", status_code=204)
def delete_vault(
    vault_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """حذف الخزينة وجميع الملفات المحفوظة داخلها من التخزين وقاعدة البيانات."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    files = db.scalars(select(VaultFile).where(VaultFile.vault_id == vault.id)).all()
    for f in files:
        storage.delete(f.storage_key)
        db.delete(f)

    db.delete(vault)
    db.commit()
    return None


# --------------------------------------------------------------------------- #
# استيراد الملفات (Import: External URL & Direct Upload) لجميع الصيغ
# --------------------------------------------------------------------------- #

@router.post("/{vault_id}/import-url", response_model=VaultFileOut)
async def import_file_from_url(
    vault_id: str,
    data: VaultImportUrlIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """استيراد ملف من رابط خارجي وحفظه في الخزينة بأي صيغة كانت دون قيود."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    url = data.url.strip()
    _validate_safe_url(url)

    tmp_dir = Path(settings.storage_dir) / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_file = tmp_dir / f"import_{new_id()}.tmp"

    hasher = hashlib.sha256()
    size = 0
    resp_headers: dict[str, Any] = {}

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            async with client.stream("GET", url) as response:
                if response.status_code >= 400:
                    raise HTTPException(
                        status_code=400,
                        detail=f"تعذر استيراد الملف: استجاب المصدر الخارجي برمز {response.status_code}",
                    )

                for k, v in response.headers.items():
                    if k.lower() in ("content-type", "content-length", "content-disposition", "server", "last-modified", "etag"):
                        resp_headers[k.lower()] = v

                with tmp_file.open("wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=CHUNK_SIZE):
                        size += len(chunk)
                        if size > settings.max_upload_bytes:
                            raise HTTPException(
                                status_code=413,
                                detail="حجم الملف المستورد يتجاوز الحد المسموح به في المنصة",
                            )
                        hasher.update(chunk)
                        f.write(chunk)
    except httpx.RequestError as exc:
        tmp_file.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"فشل الاتصال بالجهة الخارجية: {str(exc)}",
        ) from exc
    except Exception:
        tmp_file.unlink(missing_ok=True)
        raise

    # استخراج اسم الملف وامتداده
    detected_name = _extract_filename_from_url(url, resp_headers)
    final_filename = _clean_filename(data.filename or detected_name)
    ext = posixpath.splitext(final_filename)[1].lower()

    # في حال لم يكن هناك امتداد في الاسم المستخرج، نحاول التخمين من الترويسة
    if not ext and "content-type" in resp_headers:
        guessed_ext = mimetypes.guess_extension(resp_headers["content-type"].split(";")[0].strip())
        if guessed_ext:
            ext = guessed_ext
            final_filename = f"{final_filename}{ext}"

    mime = resp_headers.get("content-type", "").split(";")[0].strip() or _guess_mime(final_filename)
    sha256 = hasher.hexdigest()

    file_id = new_id()
    safe_ext = ext if ext else ".bin"
    storage_key = f"vaults/{vault.id}/{file_id}{safe_ext}"

    storage.put_path(storage_key, tmp_file)

    vault_file = VaultFile(
        id=file_id,
        vault_id=vault.id,
        user_id=user.id,
        filename=final_filename,
        original_name=detected_name,
        ext=ext,
        mime=mime,
        size=size,
        sha256=sha256,
        storage_key=storage_key,
        source_type="external_url",
        source_url=url,
        description=data.description.strip() if data.description else None,
        folder=data.folder.strip() if data.folder else None,
        tags=data.tags or [],
        metadata_info=resp_headers,
    )
    db.add(vault_file)
    db.commit()
    db.refresh(vault_file)

    return _format_file_out(vault_file)


@router.post("/{vault_id}/import-urls", response_model=list[VaultFileOut])
async def batch_import_urls(
    vault_id: str,
    data: VaultBatchImportUrlsIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """استيراد روابط متعددة دفعة واحدة في الخزينة."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    imported_files: list[VaultFile] = []
    tmp_dir = Path(settings.storage_dir) / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for raw_url in data.urls:
        url = raw_url.strip()
        if not url:
            continue
        try:
            _validate_safe_url(url)
            tmp_file = tmp_dir / f"import_{new_id()}.tmp"
            hasher = hashlib.sha256()
            size = 0
            resp_headers: dict[str, Any] = {}

            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                async with client.stream("GET", url) as response:
                    if response.status_code >= 400:
                        continue
                    for k, v in response.headers.items():
                        if k.lower() in ("content-type", "content-length", "content-disposition", "server", "last-modified", "etag"):
                            resp_headers[k.lower()] = v
                    with tmp_file.open("wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=CHUNK_SIZE):
                            size += len(chunk)
                            if size > settings.max_upload_bytes:
                                break
                            hasher.update(chunk)
                            f.write(chunk)

            detected_name = _extract_filename_from_url(url, resp_headers)
            final_filename = _clean_filename(detected_name)
            ext = posixpath.splitext(final_filename)[1].lower()

            if not ext and "content-type" in resp_headers:
                guessed_ext = mimetypes.guess_extension(resp_headers["content-type"].split(";")[0].strip())
                if guessed_ext:
                    ext = guessed_ext
                    final_filename = f"{final_filename}{ext}"

            mime = resp_headers.get("content-type", "").split(";")[0].strip() or _guess_mime(final_filename)
            sha256 = hasher.hexdigest()
            file_id = new_id()
            safe_ext = ext if ext else ".bin"
            storage_key = f"vaults/{vault.id}/{file_id}{safe_ext}"
            storage.put_path(storage_key, tmp_file)

            vf = VaultFile(
                id=file_id,
                vault_id=vault.id,
                user_id=user.id,
                filename=final_filename,
                original_name=detected_name,
                ext=ext,
                mime=mime,
                size=size,
                sha256=sha256,
                storage_key=storage_key,
                source_type="external_url",
                source_url=url,
                folder=data.folder.strip() if data.folder else None,
                tags=data.tags or [],
                metadata_info=resp_headers,
            )
            db.add(vf)
            imported_files.append(vf)
        except Exception:
            continue

    if imported_files:
        db.commit()
        for vf in imported_files:
            db.refresh(vf)

    return [_format_file_out(f) for f in imported_files]


@router.post("/{vault_id}/upload", response_model=VaultFileOut)
async def upload_file_to_vault(
    vault_id: str,
    file: UploadFile = File(...),
    description: str | None = Query(None),
    folder: str | None = Query(None),
    tags: str | None = Query(None),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """رفع واستيراد أي ملف في الخزينة لجميع الصيغ دون استثناء مع المجلد والوسوم."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    orig_name = file.filename or f"uploaded_{new_id()[:8]}"
    clean_name = _clean_filename(orig_name)
    ext = posixpath.splitext(clean_name)[1].lower()

    tmp_dir = Path(settings.storage_dir) / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_file = tmp_dir / f"up_{new_id()}.tmp"

    hasher = hashlib.sha256()
    size = 0
    try:
        with tmp_file.open("wb") as out:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="الملف أكبر من الحد المسموح")
                hasher.update(chunk)
                out.write(chunk)
    except Exception:
        tmp_file.unlink(missing_ok=True)
        raise

    mime = file.content_type or _guess_mime(clean_name)
    sha256 = hasher.hexdigest()

    file_id = new_id()
    safe_ext = ext if ext else ".bin"
    storage_key = f"vaults/{vault.id}/{file_id}{safe_ext}"

    storage.put_path(storage_key, tmp_file)

    parsed_tags = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    vault_file = VaultFile(
        id=file_id,
        vault_id=vault.id,
        user_id=user.id,
        filename=clean_name,
        original_name=orig_name,
        ext=ext,
        mime=mime,
        size=size,
        sha256=sha256,
        storage_key=storage_key,
        source_type="upload",
        source_url=None,
        description=description.strip() if description else None,
        folder=folder.strip() if folder else None,
        tags=parsed_tags,
        metadata_info={"original_content_type": file.content_type},
    )
    db.add(vault_file)
    db.commit()
    db.refresh(vault_file)

    return _format_file_out(vault_file)


# --------------------------------------------------------------------------- #
# إدارة ملفات الخزينة (View, Download, Edit, Delete, Move)
# --------------------------------------------------------------------------- #

@router.get("/{vault_id}/files/{file_id}", response_model=VaultFileOut)
def get_vault_file(
    vault_id: str,
    file_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """جلب معلومات الملف داخل الخزينة."""
    vault_file = db.scalar(
        select(VaultFile).where(
            VaultFile.id == file_id,
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
        )
    )
    if not vault_file:
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return _format_file_out(vault_file)


@router.patch("/{vault_id}/files/{file_id}", response_model=VaultFileOut)
def update_vault_file(
    vault_id: str,
    file_id: str,
    data: VaultFileUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """تعديل اسم أو وصف الملف أو نقله إلى خزينة أخرى."""
    vault_file = db.scalar(
        select(VaultFile).where(
            VaultFile.id == file_id,
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
        )
    )
    if not vault_file:
        raise HTTPException(status_code=404, detail="الملف غير موجود")

    if data.filename is not None:
        vault_file.filename = _clean_filename(data.filename)
    if data.description is not None:
        vault_file.description = data.description.strip()
    if data.folder is not None:
        vault_file.folder = data.folder.strip() if data.folder.strip() else None
    if data.tags is not None:
        vault_file.tags = [t.strip() for t in data.tags if t.strip()]
    if data.vault_id is not None and data.vault_id != vault_id:
        target_vault = db.scalar(
            select(Vault).where(Vault.id == data.vault_id, Vault.user_id == user.id)
        )
        if not target_vault:
            raise HTTPException(status_code=404, detail="الخزينة الهدف غير موجودة")
        vault_file.vault_id = target_vault.id

    db.commit()
    db.refresh(vault_file)
    return _format_file_out(vault_file)


@router.delete("/{vault_id}/files/{file_id}", status_code=204)
def delete_vault_file(
    vault_id: str,
    file_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """حذف ملف من الخزينة ونظام التخزين."""
    vault_file = db.scalar(
        select(VaultFile).where(
            VaultFile.id == file_id,
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
        )
    )
    if not vault_file:
        raise HTTPException(status_code=404, detail="الملف غير موجود")

    storage.delete(vault_file.storage_key)
    db.delete(vault_file)
    db.commit()
    return None


@router.get("/{vault_id}/export-zip")
def export_vault_as_zip(
    vault_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """تصدير كامل محتويات الخزينة كأرشيف ZIP منظم بنقرة واحدة."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    files = db.scalars(select(VaultFile).where(VaultFile.vault_id == vault.id)).all()
    if not files:
        raise HTTPException(status_code=400, detail="الخزينة فارغة ولا تحتوي على ملفات للتصدير")

    tmp_dir = Path(settings.storage_dir) / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    zip_path = tmp_dir / f"vault_{vault.id}_{new_id()[:8]}.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        seen_names: set[str] = set()
        for f in files:
            try:
                f_path = storage.path(f.storage_key)
                prefix = f"{f.folder}/" if getattr(f, "folder", None) else ""
                dest_name = f"{prefix}{f.filename}"
                counter = 1
                while dest_name in seen_names:
                    name_part, ext_part = posixpath.splitext(f.filename)
                    dest_name = f"{prefix}{name_part}_{counter}{ext_part}"
                    counter += 1
                seen_names.add(dest_name)
                zf.write(f_path, arcname=dest_name)
            except FileNotFoundError:
                continue

    safe_ascii = re.sub(r"[^a-zA-Z0-9_\.\-]", "_", vault.name) or "vault"
    encoded_name = urllib.parse.quote(f"{vault.name}.zip")

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_ascii}.zip"; filename*=UTF-8\'\'{encoded_name}',
        },
    )


@router.post("/{vault_id}/files/bulk-download-zip")
def bulk_download_files_as_zip(
    vault_id: str,
    data: VaultBulkDownloadIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """تحميل الملفات المحددة كأرشيف ZIP واحد."""
    vault = db.scalar(select(Vault).where(Vault.id == vault_id, Vault.user_id == user.id))
    if not vault:
        raise HTTPException(status_code=404, detail="الخزينة غير موجودة")

    files = db.scalars(
        select(VaultFile).where(
            VaultFile.vault_id == vault.id,
            VaultFile.user_id == user.id,
            VaultFile.id.in_(data.file_ids),
        )
    ).all()
    if not files:
        raise HTTPException(status_code=400, detail="لم يتم العثور على ملفات محددة")

    tmp_dir = Path(settings.storage_dir) / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    zip_path = tmp_dir / f"bulk_{vault.id}_{new_id()[:8]}.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        seen_names: set[str] = set()
        for f in files:
            try:
                f_path = storage.path(f.storage_key)
                prefix = f"{f.folder}/" if getattr(f, "folder", None) else ""
                dest_name = f"{prefix}{f.filename}"
                counter = 1
                while dest_name in seen_names:
                    name_part, ext_part = posixpath.splitext(f.filename)
                    dest_name = f"{prefix}{name_part}_{counter}{ext_part}"
                    counter += 1
                seen_names.add(dest_name)
                zf.write(f_path, arcname=dest_name)
            except FileNotFoundError:
                continue

    encoded_name = urllib.parse.quote("selected_files.zip")
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="selected_files.zip"; filename*=UTF-8\'\'{encoded_name}',
        },
    )


@router.post("/{vault_id}/files/bulk-delete", status_code=204)
def bulk_delete_files(
    vault_id: str,
    data: VaultBulkDeleteIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """حذف جماعي لعدة ملفات محددة."""
    files = db.scalars(
        select(VaultFile).where(
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
            VaultFile.id.in_(data.file_ids),
        )
    ).all()
    for f in files:
        storage.delete(f.storage_key)
        db.delete(f)
    db.commit()
    return None


@router.post("/{vault_id}/files/bulk-move", status_code=200)
def bulk_move_files(
    vault_id: str,
    data: VaultBulkMoveIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """نقل جماعي لعدة ملفات إلى خزينة أخرى."""
    target_vault = db.scalar(
        select(Vault).where(Vault.id == data.target_vault_id, Vault.user_id == user.id)
    )
    if not target_vault:
        raise HTTPException(status_code=404, detail="الخزينة الهدف غير موجودة")

    files = db.scalars(
        select(VaultFile).where(
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
            VaultFile.id.in_(data.file_ids),
        )
    ).all()
    for f in files:
        f.vault_id = target_vault.id
    db.commit()
    return {"moved_count": len(files)}


@router.get("/{vault_id}/files/{file_id}/download")
def download_vault_file(
    vault_id: str,
    file_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """تحميل الملف المحفوظ بالخزينة مع الحفاظ على اسمه الأصلي وامتداده."""
    vault_file = db.scalar(
        select(VaultFile).where(
            VaultFile.id == file_id,
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
        )
    )
    if not vault_file:
        raise HTTPException(status_code=404, detail="الملف غير موجود")

    try:
        path = storage.path(vault_file.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="ملف التخزين غير موجود على الخادم")

    safe_ascii = re.sub(r"[^a-zA-Z0-9_\.\-]", "_", vault_file.filename) or f"file{vault_file.ext}"
    encoded = urllib.parse.quote(vault_file.filename)

    headers = {
        "Content-Disposition": f'attachment; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded}',
    }

    return FileResponse(
        path=path,
        media_type=vault_file.mime or "application/octet-stream",
        headers=headers,
    )


@router.get("/{vault_id}/files/{file_id}/view")
def view_vault_file(
    vault_id: str,
    file_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """معاينة الملف مباشرة في المتصفح للصيغ المدعومة مع ترويسات أمان عازلة."""
    vault_file = db.scalar(
        select(VaultFile).where(
            VaultFile.id == file_id,
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
        )
    )
    if not vault_file:
        raise HTTPException(status_code=404, detail="الملف غير موجود")

    try:
        path = storage.path(vault_file.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="ملف التخزين غير موجود على الخادم")

    safe_ascii = re.sub(r"[^a-zA-Z0-9_\.\-]", "_", vault_file.filename) or f"file{vault_file.ext}"
    encoded = urllib.parse.quote(vault_file.filename)

    headers = {
        "Content-Disposition": f'inline; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded}',
        "X-Content-Type-Options": "nosniff",
    }
    # عزل ملفات الويب لمنع ثغرات XSS
    if vault_file.ext in (".html", ".htm", ".svg", ".xml"):
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

    return FileResponse(
        path=path,
        media_type=vault_file.mime or "application/octet-stream",
        headers=headers,
    )


@router.get("/{vault_id}/files/{file_id}/inspect", response_model=VaultFileInspectOut)
def inspect_vault_file(
    vault_id: str,
    file_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """فحص واستخراج محتوى الملف بصيغته الأصلية (DOCX, PPTX, XLSX, CSV, ZIP, Code, DB, ...) للقراءة من داخل الخزينة."""
    vault_file = db.scalar(
        select(VaultFile).where(
            VaultFile.id == file_id,
            VaultFile.vault_id == vault_id,
            VaultFile.user_id == user.id,
        )
    )
    if not vault_file:
        raise HTTPException(status_code=404, detail="الملف غير موجود")

    try:
        path = storage.path(vault_file.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="ملف التخزين غير موجود على الخادم")

    preview_data = inspect_file(
        path=path,
        filename=vault_file.filename,
        ext=vault_file.ext,
        mime=vault_file.mime,
    )

    download_url = f"{settings.api_prefix}/vaults/{vault_file.vault_id}/files/{vault_file.id}/download"
    view_url = f"{settings.api_prefix}/vaults/{vault_file.vault_id}/files/{vault_file.id}/view"

    return VaultFileInspectOut(
        id=vault_file.id,
        filename=vault_file.filename,
        ext=vault_file.ext,
        mime=vault_file.mime,
        size=vault_file.size,
        sha256=vault_file.sha256,
        download_url=download_url,
        view_url=view_url,
        source_type=vault_file.source_type,
        source_url=vault_file.source_url,
        description=vault_file.description,
        folder=getattr(vault_file, "folder", None),
        tags=getattr(vault_file, "tags", []) or [],
        created_at=vault_file.created_at,
        preview_data=preview_data,
    )

