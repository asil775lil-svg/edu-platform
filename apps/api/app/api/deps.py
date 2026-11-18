"""تبعيات الطلبات: قاعدة البيانات، المستخدم الحالي، والصلاحيات."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.security import token_fingerprint
from app.db.base import get_db
from app.db.models import Session, User


def _unauthorized(message: str = "يجب تسجيل الدخول") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)


def is_admin_user(user: User | None) -> bool:
    """التحقق مما إذا كان المستخدم هو المهندس / مدير المنصة."""
    if not user:
        return False
    email = (user.email or "").strip().lower()
    name = (user.name or "").strip().lower()
    return (
        email == "ze775co@gmail.com"
        or name in ["زيكو", "zeco", "ze775co", "المهندس", "مدير المنصة", "أصيل 775"]
        or getattr(user, "role", "") == "admin"
    )


def current_user(
    db: DbSession = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=settings.cookie_name),
    authorization: str | None = Header(default=None),
) -> User:
    token = session_cookie
    if not token and authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]

    if not token:
        raise _unauthorized()
    record = db.get(Session, token_fingerprint(token))
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


def require_admin(user: User = Depends(current_user)) -> User:
    """التحقق من صلاحيات المدير / المهندس للوصول للعمليات الخاصة."""
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="هذه الصلاحية خاصة بمدير المنصة والمهندس فقط")
    return user


def owned_course(db: DbSession, course_id: str, user: User):
    from app.db.models import Course

    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    if course.owner_id != user.id and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية على هذه المادة")
    return course
