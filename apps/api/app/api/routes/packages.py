"""تصدير واستيراد حزم `.edupkg`."""

from __future__ import annotations

import posixpath

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, owned_course
from app.core.config import settings
from app.db.base import get_db
from app.db.models import PackageJob, User
from app.schemas import ExportIn, ImportCommitIn, JobOut
from app.services import packages as service
from app.services.storage import public_url, storage

router = APIRouter(prefix="/packages", tags=["packages"])


def _out(job: PackageJob) -> JobOut:
    download = None
    if job.kind == "export" and job.status == "done" and job.storage_key:
        download = public_url(job.storage_key)
    return JobOut(
        id=job.id,
        kind=job.kind,
        status=job.status,
        meta=job.meta or {},
        error=job.error,
        download_url=download,
        created_at=job.created_at,
    )


@router.post("/export", response_model=JobOut, status_code=202)
def export_course(
    payload: ExportIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    course = owned_course(db, payload.course_id, user)
    if payload.protection == "invite-code" and not payload.invite_code:
        raise HTTPException(status_code=422, detail="حدد رمز دعوة للحزمة المحمية")

    job = PackageJob(
        owner_id=user.id,
        kind="export",
        status="pending",
        course_id=course.id,
        meta={
            "protection": payload.protection,
            "invite_code": payload.invite_code,
            "include_media": payload.include_media,
        },
    )
    db.add(job)
    db.commit()
    service.spawn(job.id)
    return _out(job)


@router.post("/import", response_model=JobOut, status_code=201)
async def upload_package(
    file: UploadFile = File(...),
    invite_code: str | None = Form(default=None),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    from edupkg import EduPkgError, is_encrypted, read_public_header

    if posixpath.splitext(file.filename or "")[1].lower() not in {".edupkg", ".zip"}:
        raise HTTPException(status_code=415, detail="يجب رفع ملف .edupkg")

    data = await file.read()
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="الحزمة أكبر من الحد المسموح")

    job = PackageJob(owner_id=user.id, kind="import", status="pending", meta={})
    db.add(job)
    db.flush()

    key = f"imports/{job.id}.edupkg"
    storage.put(key, data)
    job.storage_key = key

    try:
        if is_encrypted(data) and not invite_code:
            header = read_public_header(data) or {}
            job.meta = {
                "encrypted": True,
                "needsCode": True,
                "header": header.get("meta", {}),
            }
        else:
            job.meta = {"encrypted": is_encrypted(data), "preview": service.import_preview(data, invite_code)}
            if invite_code:
                job.meta["hasCode"] = True
    except EduPkgError as exc:
        db.delete(job)
        db.commit()
        storage.delete(key)
        raise HTTPException(status_code=422, detail=exc.to_dict()) from exc

    db.commit()
    return _out(job)


@router.get("/{job_id}", response_model=JobOut)
def job_status(
    job_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    job = db.get(PackageJob, job_id)
    if job is None or job.owner_id != user.id:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    return _out(job)


@router.get("/{job_id}/download")
def download(
    job_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    job = db.get(PackageJob, job_id)
    if job is None or job.owner_id != user.id:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    if job.status != "done" or not job.storage_key:
        raise HTTPException(status_code=409, detail="الحزمة غير جاهزة")
    filename = (job.meta or {}).get("filename", "course.edupkg")
    return FileResponse(storage.path(job.storage_key), filename=filename)


@router.post("/{job_id}/commit")
def commit(
    job_id: str,
    payload: ImportCommitIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    from edupkg import EduPkgError

    job = db.get(PackageJob, job_id)
    if job is None or job.owner_id != user.id or job.kind != "import":
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    try:
        course = service.commit_import(db, job, user, payload.invite_code, payload.title)
    except EduPkgError as exc:
        raise HTTPException(status_code=422, detail=exc.to_dict()) from exc
    return {"course_id": course.id, "job": _out(job).model_dump()}
