"""خدمة تصدير واستيراد الحزم — تُنفَّذ خارج دورة الطلب."""

from __future__ import annotations

import threading
from pathlib import Path

from edupkg import EduPkgError, MediaFile, build_package, inspect_package, sha256_hex
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.security import user_signing_seed
from app.db.base import SessionLocal
from app.db.models import Asset, Course, CourseVersion, LessonIndex, PackageJob, User
from app.services.courses import publish_snapshot
from app.services.storage import asset_key, storage


def spawn(job_id: str) -> None:
    """بديل مبسّط لـ Arq/Redis في التطوير. الواجهة نفسها عند الترقية."""
    threading.Thread(target=_run, args=(job_id,), daemon=True).start()


def _run(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(PackageJob, job_id)
        if job is None:
            return
        job.status = "running"
        db.commit()

        if job.kind == "export":
            _export(db, job)
        else:
            job.status = "done"
            db.commit()
    except Exception as exc:  # noqa: BLE001 — أي فشل يُسجَّل على الوظيفة
        db.rollback()
        job = db.get(PackageJob, job_id)
        if job is not None:
            job.status = "failed"
            job.error = str(exc)
            db.commit()
    finally:
        db.close()


def _export(db: DbSession, job: PackageJob) -> None:
    course = db.get(Course, job.course_id or "")
    if course is None:
        raise ValueError("المادة غير موجودة")
    user = db.get(User, job.owner_id)
    if user is None:
        raise ValueError("المستخدم غير موجود")

    if course.published_version_id:
        version = db.get(CourseVersion, course.published_version_id)
        snapshot = dict(version.snapshot) if version else publish_snapshot(course)
    else:
        snapshot = publish_snapshot(course)

    media: list[MediaFile] = []
    missing: list[str] = []
    seen: set[str] = set()
    for unit in snapshot.get("units") or []:
        for lesson in unit.get("lessons") or []:
            for block in lesson.get("blocks") or []:
                sha = block.get("assetSha256")
                if not isinstance(sha, str) or sha in seen:
                    continue
                seen.add(sha)
                asset = db.scalar(select(Asset).where(Asset.sha256 == sha))
                if asset is None:
                    missing.append(sha)
                    continue
                try:
                    payload = storage.path(asset.storage_key).read_bytes()
                except (FileNotFoundError, ValueError):
                    missing.append(sha)
                    continue
                media.append(MediaFile(name=f"{sha}{asset.ext}", data=payload))

    meta = job.meta or {}
    seed = user_signing_seed(user.id)
    built = build_package(
        course=snapshot,
        author={"id": user.id, "name": user.name, "publicKey": user.public_key or ""},
        protection=meta.get("protection", "open"),
        invite_code=meta.get("invite_code"),
        media=media,
        private_key=seed,
        license=meta.get("license", ""),
    )

    key = f"packages/{job.id}.edupkg"
    storage.put(key, built.data)

    safe_title = "".join(c for c in course.title if c not in '\\/:*?"<>|').strip() or "course"
    job.storage_key = key
    job.meta = {
        **meta,
        "filename": f"{safe_title}.edupkg",
        "title": course.title,
        "size": len(built.data),
        "sha256": sha256_hex(built.data),
        "protection": built.manifest["protection"],
        "counts": built.manifest["counts"],
        "signed": built.signature is not None,
        "publicKey": built.manifest["author"]["publicKey"],
        "missingMedia": missing,
    }
    job.status = "done"
    db.commit()


def import_preview(data: bytes, invite_code: str | None) -> dict:
    info = inspect_package(data, invite_code=invite_code)
    return {
        "title": info.title,
        "author": info.manifest.get("author", {}).get("name", ""),
        "protection": info.protection,
        "signed": info.signed,
        "warnings": info.warnings,
        "counts": info.manifest.get("counts", {}),
        "size": info.package_size,
        "media": [{"name": m.name, "size": m.size} for m in info.media],
        "units": [
            {
                "title": unit.get("title", ""),
                "lessons": [lesson.get("title", "") for lesson in unit.get("lessons") or []],
            }
            for unit in info.course.get("units") or []
        ],
    }


def commit_import(
    db: DbSession, job: PackageJob, user: User, invite_code: str | None, title: str | None
) -> Course:
    if not job.storage_key:
        raise ValueError("لا يوجد ملف للاستيراد")
    data = storage.path(job.storage_key).read_bytes()
    info = inspect_package(data, invite_code=invite_code, load_media=True)

    course = Course(
        owner_id=user.id,
        title=(title or info.title or "مادة مستوردة").strip(),
        description=(info.course.get("description") or "").strip(),
        draft={},
    )
    db.add(course)
    db.flush()

    snapshot = dict(info.course)
    snapshot["id"] = course.id
    snapshot["title"] = course.title
    course.draft = snapshot

    imported_media = 0
    for entry in info.media:
        if entry.data is None:
            continue
        existing = db.scalar(select(Asset).where(Asset.sha256 == entry.sha256))
        if existing is not None:
            continue
        key = asset_key(entry.sha256, entry.ext)
        storage.put(key, entry.data)
        db.add(
            Asset(
                sha256=entry.sha256,
                ext=entry.ext,
                mime=_guess_mime(entry.ext),
                size=len(entry.data),
                storage_key=key,
                created_by=user.id,
            )
        )
        imported_media += 1

    db.flush()
    version = _publish_imported(db, course)

    job.status = "done"
    job.course_id = course.id
    job.meta = {
        **(job.meta or {}),
        "importedCourseId": course.id,
        "versionId": version.id,
        "importedMedia": imported_media,
    }
    db.commit()
    return course


def _publish_imported(db: DbSession, course: Course) -> CourseVersion:
    snapshot = publish_snapshot(course)
    snapshot["versionSeq"] = 1
    version = CourseVersion(course_id=course.id, seq=1, snapshot=snapshot, checksums={})
    db.add(version)
    db.flush()
    for unit in snapshot["units"]:
        for lesson in unit["lessons"]:
            db.add(
                LessonIndex(
                    version_id=version.id,
                    lesson_id=lesson["id"],
                    unit_id=unit["id"],
                    title=lesson["title"],
                    order=lesson["order"],
                )
            )
    course.published_version_id = version.id
    course.draft = {**course.draft, "units": snapshot["units"], "versionSeq": 1}
    db.flush()
    return version


MIME_BY_EXT = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".epub": "application/epub+zip",
}


def _guess_mime(ext: str) -> str:
    return MIME_BY_EXT.get(ext, "application/octet-stream")


def import_file_path(job_id: str) -> Path:
    return Path(settings.storage_dir) / f"imports/{job_id}.edupkg"


__all__ = ["EduPkgError", "commit_import", "import_file_path", "import_preview", "spawn"]
