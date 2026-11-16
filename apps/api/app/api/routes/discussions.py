"""مسارات المناقشات والأسئلة التفاعلية داخل الدروس."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user
from app.db.base import get_db
from app.db.models import Course, Discussion, User
from app.schemas import DiscussionIn, DiscussionOut

router = APIRouter(tags=["discussions"])


@router.get(
    "/courses/{course_id}/lessons/{lesson_id}/discussions",
    response_model=list[DiscussionOut],
)
def list_discussions(
    course_id: str,
    lesson_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    # جلب جميع المناقشات لهذا الدرس
    rows = db.scalars(
        select(Discussion)
        .where(Discussion.course_id == course_id, Discussion.lesson_id == lesson_id)
        .order_by(Discussion.created_at.asc())
    ).all()

    # ترتيب هرمي (الأسئلة الرئيسية وبداخلها الردود)
    roots: list[DiscussionOut] = []
    replies_by_parent: dict[str, list[DiscussionOut]] = {}

    for row in rows:
        d_out = DiscussionOut(
            id=row.id,
            course_id=row.course_id,
            lesson_id=row.lesson_id,
            user_id=row.user_id,
            user_name=row.user_name,
            user_role=row.user_role,
            content=row.content,
            parent_id=row.parent_id,
            created_at=row.created_at,
            replies=[],
        )
        if row.parent_id is None:
            roots.append(d_out)
        else:
            replies_by_parent.setdefault(row.parent_id, []).append(d_out)

    for root in roots:
        root.replies = replies_by_parent.get(root.id, [])

    return roots


@router.post(
    "/courses/{course_id}/lessons/{lesson_id}/discussions",
    response_model=DiscussionOut,
    status_code=201,
)
def create_discussion(
    course_id: str,
    lesson_id: str,
    payload: DiscussionIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")

    if payload.parent_id:
        parent = db.get(Discussion, payload.parent_id)
        if not parent or parent.course_id != course_id or parent.lesson_id != lesson_id:
            raise HTTPException(status_code=400, detail="التعليق الأصلي غير صالح")

    role = "teacher" if user.id == course.owner_id or user.role == "teacher" else "student"

    discussion = Discussion(
        course_id=course_id,
        lesson_id=lesson_id,
        user_id=user.id,
        user_name=user.name,
        user_role=role,
        content=payload.content.strip(),
        parent_id=payload.parent_id,
    )
    db.add(discussion)
    db.commit()
    db.refresh(discussion)

    return DiscussionOut(
        id=discussion.id,
        course_id=discussion.course_id,
        lesson_id=discussion.lesson_id,
        user_id=discussion.user_id,
        user_name=discussion.user_name,
        user_role=discussion.user_role,
        content=discussion.content,
        parent_id=discussion.parent_id,
        created_at=discussion.created_at,
        replies=[],
    )


@router.delete("/courses/{course_id}/discussions/{discussion_id}", status_code=204)
def delete_discussion(
    course_id: str,
    discussion_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    course = db.get(Course, course_id)
    discussion = db.get(Discussion, discussion_id)
    if not discussion or discussion.course_id != course_id:
        raise HTTPException(status_code=404, detail="المناقشة غير موجودة")

    # يُسمح بالحذف لصاحب التعليق أو معلم المادة
    if discussion.user_id != user.id and (not course or course.owner_id != user.id):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف هذه المناقشة")

    db.delete(discussion)
    db.commit()
