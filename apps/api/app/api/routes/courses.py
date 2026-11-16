"""المواد: إنشاء، تحرير، نشر إصدار ثابت، وعرض الإصدارات."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, owned_course
from app.db.base import get_db
from app.db.models import Asset, Course, CourseVersion, LessonIndex, User
from app.schemas import CourseCreate, CourseDetail, CourseOut, CourseUpdate, VersionOut
from app.services.courses import course_counts, empty_draft, publish_snapshot

router = APIRouter(prefix="/courses", tags=["courses"])


def _out(course: Course) -> CourseOut:
    units, lessons = course_counts(course.draft)
    return CourseOut(
        id=course.id,
        title=course.title,
        description=course.description,
        owner_id=course.owner_id,
        published_version_id=course.published_version_id,
        unit_count=units,
        lesson_count=lessons,
        updated_at=course.updated_at,
    )


@router.get("", response_model=list[CourseOut])
def list_courses(db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    courses = db.scalars(
        select(Course).where(Course.owner_id == user.id).order_by(Course.updated_at.desc())
    ).all()
    return [_out(course) for course in courses]


@router.post("", response_model=CourseDetail, status_code=201)
def create_course(
    payload: CourseCreate, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    course = Course(
        owner_id=user.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        draft={},
    )
    db.add(course)
    db.flush()
    course.draft = empty_draft(course.id, course.title, course.description)
    db.commit()
    return CourseDetail(**_out(course).model_dump(), draft=course.draft)


@router.get("/{course_id}", response_model=CourseDetail)
def get_course(
    course_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    course = owned_course(db, course_id, user)
    return CourseDetail(**_out(course).model_dump(), draft=course.draft)


@router.patch("/{course_id}", response_model=CourseDetail)
def update_course(
    course_id: str,
    payload: CourseUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    course = owned_course(db, course_id, user)
    if payload.expected_updated_at is not None and course.updated_at:
        server_ts = course.updated_at.timestamp()
        client_ts = payload.expected_updated_at.timestamp()
        if server_ts - client_ts > 1.0:
            raise HTTPException(
                status_code=409,
                detail="تم تعديل المسودة في جلسة أخرى. حدّث الصفحة لتجنب فقدان التعديلات.",
            )
    if payload.title is not None:
        course.title = payload.title.strip()
        course.draft = {**course.draft, "title": course.title}
    if payload.description is not None:
        course.description = payload.description
        course.draft = {**course.draft, "description": course.description}
    if payload.draft is not None:
        draft = dict(payload.draft)
        if draft.get("id") not in (None, course.id):
            raise HTTPException(status_code=400, detail="معرّف المادة داخل المسودة لا يطابق")
        draft["id"] = course.id
        draft["title"] = course.title
        course.draft = draft
    db.commit()
    return CourseDetail(**_out(course).model_dump(), draft=course.draft)


@router.delete("/{course_id}", status_code=204)
def delete_course(
    course_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    course = owned_course(db, course_id, user)
    db.delete(course)
    db.commit()


@router.post("/{course_id}/publish", response_model=VersionOut, status_code=201)
def publish(
    course_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    course = owned_course(db, course_id, user)
    snapshot = publish_snapshot(course)

    seq = (
        db.scalar(
            select(func.coalesce(func.max(CourseVersion.seq), 0)).where(
                CourseVersion.course_id == course.id
            )
        )
        or 0
    ) + 1
    snapshot["versionSeq"] = seq

    version = CourseVersion(course_id=course.id, seq=seq, snapshot=snapshot, checksums={})
    db.add(version)
    db.flush()

    db.query(LessonIndex).filter(LessonIndex.version_id == version.id).delete()
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
    course.draft = {**course.draft, "units": snapshot["units"], "versionSeq": seq}
    db.commit()
    return VersionOut(
        id=version.id,
        seq=version.seq,
        created_at=version.created_at,
        counts=snapshot.get("counts", {}),
    )


@router.get("/{course_id}/versions", response_model=list[VersionOut])
def list_versions(
    course_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    course = owned_course(db, course_id, user)
    versions = db.scalars(
        select(CourseVersion)
        .where(CourseVersion.course_id == course.id)
        .order_by(CourseVersion.seq.desc())
    ).all()
    return [
        VersionOut(
            id=version.id,
            seq=version.seq,
            created_at=version.created_at,
            counts=(version.snapshot or {}).get("counts", {}),
        )
        for version in versions
    ]


@router.get("/{course_id}/export-html")
def export_course_html(
    course_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
) -> Response:
    import urllib.parse
    from edupkg import export_standalone_html
    from app.services.storage import storage

    course = owned_course(db, course_id, user)
    if course.published_version_id:
        version = db.get(CourseVersion, course.published_version_id)
        snapshot = dict(version.snapshot) if version else publish_snapshot(course)
    else:
        snapshot = publish_snapshot(course)

    media_map: dict[str, bytes] = {}
    for unit in snapshot.get("units") or []:
        for lesson in unit.get("lessons") or []:
            for block in lesson.get("blocks") or []:
                sha = block.get("assetSha256")
                if isinstance(sha, str) and sha not in media_map:
                    asset = db.scalar(select(Asset).where(Asset.sha256 == sha))
                    if asset is not None:
                        try:
                            # نضمن فقط الوسائط ذات الحجم المعقول (<10MB) داخل الـ HTML
                            if asset.size <= 10 * 1024 * 1024:
                                media_map[sha] = storage.path(asset.storage_key).read_bytes()
                        except (FileNotFoundError, ValueError):
                            pass

    html_content = export_standalone_html(snapshot, media_map)
    safe_title = "".join(c for c in course.title if c not in '\\/:*?"<>|').strip() or "course"
    encoded_filename = urllib.parse.quote(f"{safe_title}.html")

    return Response(
        content=html_content,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        },
    )

