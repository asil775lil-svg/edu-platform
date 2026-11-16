"""المواد: إنشاء، تحرير، نشر إصدار ثابت، وعرض الإصدارات."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, owned_course
from app.db.base import get_db
from app.db.models import (
    Asset,
    Course,
    CourseVersion,
    Discussion,
    Enrollment,
    LessonIndex,
    Note,
    Progress,
    User,
)
from app.schemas import (
    CourseAnalyticsOut,
    CourseCreate,
    CourseDetail,
    CourseOut,
    CourseUpdate,
    LessonAnalytics,
    SmartImportIn,
    StudentAnalytics,
    VersionOut,
)
from app.services.courses import (
    course_counts,
    empty_draft,
    parse_markdown_to_draft,
    publish_snapshot,
)


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


@router.post("/{course_id}/fork", response_model=CourseDetail, status_code=201)
def fork_course(
    course_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    """تفريغ / نسخ منهج منشور إلى حساب المعلم الحالي لإمكانية تخصيصه وتعديله (Forking)."""
    source = db.get(Course, course_id)
    if not source:
        raise HTTPException(status_code=404, detail="المادة الأصلية غير موجودة")

    # نأخذ لقطة من النسخة المنشورة إن وجدت وإلا المسودة
    snapshot = dict(source.draft or {})
    if source.published_version_id:
        v = db.get(CourseVersion, source.published_version_id)
        if v and v.snapshot:
            snapshot = dict(v.snapshot)

    forked_title = f"{source.title} (نسخة معدلة)"
    forked = Course(
        owner_id=user.id,
        title=forked_title,
        description=source.description,
        draft={},
    )
    db.add(forked)
    db.flush()

    snapshot["id"] = forked.id
    snapshot["title"] = forked_title
    snapshot["versionSeq"] = 0
    forked.draft = snapshot
    db.commit()
    return CourseDetail(**_out(forked).model_dump(), draft=forked.draft)



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


@router.post("/import-smart", response_model=CourseDetail, status_code=201)
def import_smart_markdown(
    payload: SmartImportIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """استيراد ذكي لنص Markdown وتحويله مباشرة لهيكل مادة متكامل."""
    course = Course(
        owner_id=user.id,
        title=payload.title.strip(),
        description="مادة مستوردة عبر الاستيراد الذكي",
        draft={},
    )
    db.add(course)
    db.flush()

    course.draft = parse_markdown_to_draft(course.id, course.title, payload.markdown_content)
    db.commit()
    return CourseDetail(**_out(course).model_dump(), draft=course.draft)


@router.post("/import-zip", response_model=CourseDetail, status_code=201)
def import_smart_zip(
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """استيراد أرشيف ZIP لمجلدات وملفات وتحويلها تلقائياً إلى وحدات ودروس."""
    import io
    import uuid
    import zipfile

    content = file.file.read()
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=400, detail="الملف المرفوع ليس ملف ZIP صالح")

    title = file.filename.rsplit(".", 1)[0] if file.filename else "منهج مستورد من مجلد"

    course = Course(
        owner_id=user.id,
        title=title,
        description="منهج تم إنشاؤه عبر استيراد هيكل المجلدات والملفات",
        draft={},
    )
    db.add(course)
    db.flush()

    units_dict: dict[str, dict] = {}

    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        for entry in archive.infolist():
            if entry.is_dir() or entry.filename.startswith("__MACOSX") or "/." in entry.filename:
                continue

            parts = [p for p in entry.filename.replace("\\", "/").split("/") if p]
            if not parts:
                continue

            unit_name = parts[0] if len(parts) > 1 else "الوحدة العامة"
            lesson_file = parts[-1]
            lesson_title = lesson_file.rsplit(".", 1)[0]

            if unit_name not in units_dict:
                units_dict[unit_name] = {
                    "id": f"unit_{uuid.uuid4().hex[:8]}",
                    "title": unit_name,
                    "order": len(units_dict),
                    "lessons": [],
                }

            # قراءة محتوى الدرس
            raw_text = ""
            try:
                raw_text = archive.read(entry).decode("utf-8")
            except UnicodeDecodeError:
                try:
                    raw_text = archive.read(entry).decode("cp1256")
                except UnicodeDecodeError:
                    raw_text = "تعذر فك ترميز محتوى هذا الملف النصي."

            lesson_draft = parse_markdown_to_draft(course.id, lesson_title, raw_text)
            # دمج كتل الدرس من النص
            extracted_blocks = []
            for u in lesson_draft.get("units") or []:
                for les in u.get("lessons") or []:
                    extracted_blocks.extend(les.get("blocks") or [])

            if not extracted_blocks:
                extracted_blocks = [
                    {
                        "id": f"blk_{uuid.uuid4().hex[:8]}",
                        "type": "text",
                        "doc": {
                            "type": "doc",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": raw_text}],
                                }
                            ],
                        },
                    }
                ]

            unit_obj = units_dict[unit_name]
            unit_obj["lessons"].append({
                "id": f"les_{uuid.uuid4().hex[:8]}",
                "title": lesson_title,
                "order": len(unit_obj["lessons"]),
                "blocks": extracted_blocks,
            })

    course.draft = {
        "schemaVersion": 1,
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "versionSeq": 0,
        "units": list(units_dict.values()),
    }
    db.commit()
    return CourseDetail(**_out(course).model_dump(), draft=course.draft)


@router.get("/{course_id}/analytics", response_model=CourseAnalyticsOut)
def get_course_analytics(
    course_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """لوحة تحليلات وإحصائيات الطلاب والمحتوى للمعلم."""
    course = owned_course(db, course_id, user)

    # حساب عدد المشتركين
    enrollments = db.scalars(
        select(Enrollment).where(Enrollment.course_id == course.id)
    ).all()
    total_enrollments = len(enrollments)

    # حساب مجموع الدروس من النسخة المنشورة أو المسودة
    snapshot = course.draft
    if course.published_version_id:
        v = db.get(CourseVersion, course.published_version_id)
        if v and v.snapshot:
            snapshot = v.snapshot

    lessons_meta = []
    for u in snapshot.get("units") or []:
        for l in u.get("lessons") or []:
            lessons_meta.append({"id": l["id"], "title": l["title"], "unit_title": u["title"]})
    total_lessons = len(lessons_meta)

    # جلب جميع سجلات التقدم والملاحظات والمناقشات
    all_progress = db.scalars(
        select(Progress).where(Progress.course_id == course.id)
    ).all()
    total_notes = db.scalar(
        select(func.count(Note.id)).where(Note.course_id == course.id)
    ) or 0
    total_discussions = db.scalar(
        select(func.count(Discussion.id)).where(Discussion.course_id == course.id)
    ) or 0

    # تجميع التقدم لكل مستخدم
    user_completed_map: dict[str, int] = {}
    user_last_activity_map: dict[str, any] = {}
    lesson_completed_map: dict[str, int] = {}

    for p in all_progress:
        if p.status == "completed":
            user_completed_map[p.user_id] = user_completed_map.get(p.user_id, 0) + 1
            lesson_completed_map[p.lesson_id] = lesson_completed_map.get(p.lesson_id, 0) + 1
        if p.updated_at:
            prev = user_last_activity_map.get(p.user_id)
            if not prev or p.updated_at > prev:
                user_last_activity_map[p.user_id] = p.updated_at

    students_list: list[StudentAnalytics] = []
    completed_students_count = 0

    for en in enrollments:
        student_user = db.get(User, en.user_id)
        if not student_user:
            continue
        completed = user_completed_map.get(student_user.id, 0)
        rate = round((completed / total_lessons * 100)) if total_lessons > 0 else 0
        if rate >= 100:
            completed_students_count += 1
        students_list.append(
            StudentAnalytics(
                user_id=student_user.id,
                name=student_user.name,
                email=student_user.email,
                completed_lessons=completed,
                total_lessons=total_lessons,
                completion_rate=rate,
                enrolled_at=en.created_at,
                last_activity=user_last_activity_map.get(student_user.id),
            )
        )

    # حساب متوسط الإكمال
    avg_rate = (
        round(sum(s.completion_rate for s in students_list) / len(students_list))
        if students_list
        else 0
    )

    # تفاصيل الدروس
    lessons_breakdown: list[LessonAnalytics] = []
    for lm in lessons_meta:
        count = lesson_completed_map.get(lm["id"], 0)
        comp_rate = (
            round((count / total_enrollments) * 100) if total_enrollments > 0 else 0
        )
        lessons_breakdown.append(
            LessonAnalytics(
                lesson_id=lm["id"],
                title=lm["title"],
                unit_title=lm["unit_title"],
                completed_by_count=count,
                completion_rate=comp_rate,
            )
        )

    return CourseAnalyticsOut(
        course_id=course.id,
        title=course.title,
        total_enrollments=total_enrollments,
        completed_students=completed_students_count,
        average_completion_rate=avg_rate,
        total_notes=total_notes,
        total_discussions=total_discussions,
        students=students_list,
        lessons=lessons_breakdown,
    )


