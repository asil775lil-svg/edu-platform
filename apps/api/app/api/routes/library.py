"""الحقيبة الدراسية: الاشتراك، التقدّم، والملاحظات."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user
from app.db.base import get_db
from app.db.models import Course, CourseVersion, Enrollment, LessonIndex, Note, Progress, User
from app.schemas import EnrollIn, NoteIn, NoteOut, ProgressIn

router = APIRouter(prefix="/library", tags=["library"])


def _enrollment(db: DbSession, user: User, course_id: str) -> Enrollment:
    record = db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.course_id == course_id
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="أنت غير مشترك في هذه المادة")
    return record


@router.get("")
def my_library(db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    rows = db.execute(
        select(Enrollment, Course)
        .join(Course, Course.id == Enrollment.course_id)
        .where(Enrollment.user_id == user.id)
        .order_by(Enrollment.created_at.desc())
    ).all()

    items = []
    for enrollment, course in rows:
        version_id = enrollment.pinned_version_id or course.published_version_id
        total = 0
        if version_id:
            total = (
                db.scalar(
                    select(func.count(LessonIndex.id)).where(
                        LessonIndex.version_id == version_id
                    )
                )
                or 0
            )
        completed = (
            db.scalar(
                select(func.count(Progress.id)).where(
                    Progress.user_id == user.id,
                    Progress.course_id == course.id,
                    Progress.status == "completed",
                )
            )
            or 0
        )
        items.append(
            {
                "course_id": course.id,
                "title": course.title,
                "description": course.description,
                "version_id": version_id,
                "total_lessons": total,
                "completed_lessons": completed,
                "has_update": bool(
                    course.published_version_id
                    and version_id
                    and version_id != course.published_version_id
                ),
            }
        )
    return items


@router.post("/enroll", status_code=201)
def enroll(
    payload: EnrollIn, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    course = db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    if not course.published_version_id:
        raise HTTPException(status_code=400, detail="المادة غير منشورة بعد")

    existing = db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.course_id == course.id
        )
    )
    if existing:
        return {"enrollment_id": existing.id, "already": True}

    enrollment = Enrollment(
        user_id=user.id, course_id=course.id, pinned_version_id=course.published_version_id
    )
    db.add(enrollment)
    db.commit()
    return {"enrollment_id": enrollment.id, "already": False}


@router.get("/{course_id}")
def read_course(
    course_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    enrollment = _enrollment(db, user, course_id)
    course = db.get(Course, course_id)
    version = db.get(CourseVersion, enrollment.pinned_version_id or course.published_version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="لا يوجد إصدار منشور")

    progress = db.scalars(
        select(Progress).where(
            Progress.user_id == user.id, Progress.course_id == course_id
        )
    ).all()
    notes = db.scalars(
        select(Note)
        .where(Note.user_id == user.id, Note.course_id == course_id)
        .order_by(Note.updated_at.desc())
    ).all()

    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "version": {"id": version.id, "seq": version.seq},
        "snapshot": version.snapshot,
        "progress": [
            {"lesson_id": item.lesson_id, "status": item.status, "position": item.position}
            for item in progress
        ],
        "notes": [NoteOut.model_validate(note).model_dump() for note in notes],
    }


@router.put("/{course_id}/progress/{lesson_id}", status_code=204)
def set_progress(
    course_id: str,
    lesson_id: str,
    payload: ProgressIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    _enrollment(db, user, course_id)
    record = db.scalar(
        select(Progress).where(
            Progress.user_id == user.id,
            Progress.course_id == course_id,
            Progress.lesson_id == lesson_id,
        )
    )
    if record is None:
        record = Progress(
            user_id=user.id,
            course_id=course_id,
            lesson_id=lesson_id,
            status=payload.status,
            position=payload.position,
        )
        db.add(record)
    else:
        record.status = payload.status
        record.position = payload.position
    db.commit()


@router.get("/{course_id}/notes", response_model=list[NoteOut])
def list_notes(
    course_id: str, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    _enrollment(db, user, course_id)
    notes = db.scalars(
        select(Note)
        .where(Note.user_id == user.id, Note.course_id == course_id)
        .order_by(Note.updated_at.desc())
    ).all()
    return list(notes)


@router.post("/{course_id}/notes", response_model=NoteOut, status_code=201)
def add_note(
    course_id: str,
    payload: NoteIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    _enrollment(db, user, course_id)
    note = Note(
        user_id=user.id,
        course_id=course_id,
        lesson_id=payload.lesson_id,
        anchor=payload.anchor,
        body=payload.body.strip(),
    )
    db.add(note)
    db.commit()
    return note


@router.delete("/{course_id}/notes/{note_id}", status_code=204)
def delete_note(
    course_id: str,
    note_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id or note.course_id != course_id:
        raise HTTPException(status_code=404, detail="الملاحظة غير موجودة")
    db.delete(note)
    db.commit()
