"""تبعيات الطلبات: قاعدة البيانات، المستخدم الحالي، والصلاحيات."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.security import token_fingerprint
from app.db.base import get_db
from app.db.models import Session, User


def _unauthorized(message: str = "يجب تسجيل الدخول") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)


def current_user(
    db: DbSession = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> User:
    if not session_cookie:
        raise _unauthorized()
    record = db.get(Session, token_fingerprint(session_cookie))
    if record is None:
        raise _unauthorized("جلسة غير صالحة")
    if record.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        db.delete(record)
        db.commit()
        raise _unauthorized("انتهت الجلسة")
    user = db.get(User, record.user_id)
    if user is None:
        raise _unauthorized("حساب غير موجود")
    return user


def owned_course(db: DbSession, course_id: str, user: User):
    from app.db.models import Course

    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    if course.owner_id != user.id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية على هذه المادة")
    return course
