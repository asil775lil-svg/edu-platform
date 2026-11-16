"""رفع الوسائط بالبصمة، وتقديم الملفات بروابط موقّعة."""

from __future__ import annotations

import posixpath
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user
from app.core.config import settings
from app.db.base import get_db
from app.db.models import Asset, User
from app.schemas import AssetOut
from app.services.storage import asset_key, public_url, storage

router = APIRouter(tags=["assets"])

ALLOWED_UPLOADS = {
    ".mp4", ".webm", ".mp3", ".wav", ".m4a", ".pdf",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".epub",
}

#: فحص السحر (magic bytes) لبعض الأنواع — لا نثق بالامتداد وحده.
MAGIC = {
    ".pdf": [b"%PDF"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".gif": [b"GIF8"],
    ".webp": [b"RIFF"],
    ".mp4": [b"\x00\x00\x00", b"ftyp"],
    ".webm": [b"\x1aE\xdf\xa3"],
    ".mp3": [b"ID3", b"\xff\xfb", b"\xff\xf3"],
    ".wav": [b"RIFF"],
}

CHUNK = 1 << 20


def _check_magic(ext: str, head: bytes) -> None:
    expected = MAGIC.get(ext)
    if not expected:
        return
    if not any(marker in head or head.startswith(marker) for marker in expected):
        raise HTTPException(status_code=415, detail="محتوى الملف لا يطابق امتداده")


@router.get("/assets/{sha256}", response_model=AssetOut)
def get_asset(sha256: str, db: DbSession = Depends(get_db), _: User = Depends(current_user)):
    asset = db.scalar(select(Asset).where(Asset.sha256 == sha256))
    if asset is None:
        raise HTTPException(status_code=404, detail="الوسيط غير موجود")
    return AssetOut(
        id=asset.id,
        sha256=asset.sha256,
        ext=asset.ext,
        mime=asset.mime,
        size=asset.size,
        url=public_url(asset.storage_key),
    )


@router.post("/assets", response_model=AssetOut)
async def upload_asset(
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    import hashlib
    import uuid

    ext = posixpath.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_UPLOADS:
        raise HTTPException(status_code=415, detail="امتداد غير مدعوم")

    tmp_dir = Path(settings.storage_dir) / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4().hex}{ext}"

    hasher = hashlib.sha256()
    size = 0
    head = b""
    try:
        with tmp_path.open("wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="الملف أكبر من الحد المسموح")
                if len(head) < 32:
                    head += chunk[: 32 - len(head)]
                hasher.update(chunk)
                out.write(chunk)
        _check_magic(ext, head)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    sha = hasher.hexdigest()
    existing = db.scalar(select(Asset).where(Asset.sha256 == sha))
    if existing is not None:
        tmp_path.unlink(missing_ok=True)
        return AssetOut(
            id=existing.id,
            sha256=existing.sha256,
            ext=existing.ext,
            mime=existing.mime,
            size=existing.size,
            url=public_url(existing.storage_key),
            deduplicated=True,
        )

    key = asset_key(sha, ext)
    if isinstance(storage, object) and hasattr(storage, "put_path"):
        storage.put_path(key, tmp_path)  # type: ignore[attr-defined]
        tmp_path.unlink(missing_ok=True)
    else:  # pragma: no cover
        storage.put(key, tmp_path.read_bytes())
        tmp_path.unlink(missing_ok=True)

    asset = Asset(
        sha256=sha,
        ext=ext,
        mime=file.content_type or "application/octet-stream",
        size=size,
        storage_key=key,
        created_by=user.id,
    )
    db.add(asset)
    db.commit()
    return AssetOut(
        id=asset.id,
        sha256=asset.sha256,
        ext=asset.ext,
        mime=asset.mime,
        size=asset.size,
        url=public_url(asset.storage_key),
    )


@router.get("/files/{key:path}")
def serve_file(key: str, exp: int = Query(...), sig: str = Query(...)):
    from app.core.security import verify_path

    if not verify_path(key, exp, sig):
        raise HTTPException(status_code=403, detail="رابط غير صالح أو منتهٍ")
    try:
        path = storage.path(key)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=404, detail="الملف غير موجود") from None
    return FileResponse(path)
