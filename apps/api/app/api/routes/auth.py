"""تسجيل، دخول، خروج، وجلسات بكوكيز HttpOnly."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user, is_admin_user, require_admin
from app.core.config import settings
from app.core.firebase import verify_firebase_token
from app.core.security import (
    generate_user_signing_key,
    hash_password,
    new_token,
    token_fingerprint,
    verify_password,
)
from app.db.base import get_db
from app.db.models import Session, User
from app.schemas import (
    AdminUserOut,
    FirebaseLoginIn,
    LoginIn,
    ProfileUpdateIn,
    RegisterIn,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _format_user_out(user: User, token: str | None = None) -> UserOut:
    admin = is_admin_user(user)
    out = UserOut.model_validate(user)
    out.token = token
    out.is_admin = admin
    if admin:
        out.role = "admin"
    return out


def _start_session(db: DbSession, user: User, response: Response) -> str:
    token = new_token()
    db.add(
        Session(
            id=token_fingerprint(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=settings.session_ttl_days),
        )
    )
    db.commit()
    response.set_cookie(
        settings.cookie_name,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_ttl_days * 86400,
        path="/",
    )
    return token


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: RegisterIn, response: Response, db: DbSession = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="البريد مستخدم بالفعل")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name.strip(),
        role=payload.role,
    )
    db.add(user)
    db.flush()  # يولّد المعرّف
    pub_key, priv_enc = generate_user_signing_key(user.id)
    user.public_key = pub_key
    user.private_key_enc = priv_enc
    db.commit()
    token = _start_session(db, user, response)
    return _format_user_out(user, token)


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: DbSession = Depends(get_db)):
    ident = (payload.login or payload.email or "").strip().lower()
    if not ident:
        raise HTTPException(status_code=400, detail="يجب إدخال البريد الإلكتروني أو اسم المستخدم")

    user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.email) == ident,
                func.lower(User.name) == ident,
            )
        )
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    token = _start_session(db, user, response)
    return _format_user_out(user, token)



@router.post("/firebase", response_model=UserOut)
def firebase_login(
    payload: FirebaseLoginIn,
    response: Response,
    db: DbSession = Depends(get_db),
):
    try:
        claims = verify_firebase_token(payload.id_token, settings.firebase_project_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="حساب Firebase لا يحتوي على بريد إلكتروني صالح")

    email = email.lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        name = (payload.name or claims.get("name") or email.split("@")[0]).strip()
        user = User(
            email=email,
            password_hash=hash_password(new_token()),
            name=name or "مستخدم",
            role=payload.role or "teacher",
        )
        db.add(user)
        db.flush()
        pub_key, priv_enc = generate_user_signing_key(user.id)
        user.public_key = pub_key
        user.private_key_enc = priv_enc
        db.commit()

    token = _start_session(db, user, response)
    return _format_user_out(user, token)




@router.patch("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdateIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    if payload.name is not None and payload.name.strip():
        user.name = payload.name.strip()

    if payload.email is not None and payload.email.lower() != user.email:
        new_email = payload.email.lower()
        conflict = db.scalar(select(User).where(User.email == new_email, User.id != user.id))
        if conflict:
            raise HTTPException(status_code=409, detail="البريد الإلكتروني الجديد مستخدم بالفعل")
        user.email = new_email

    if payload.new_password is not None:
        if not payload.current_password or not verify_password(
            payload.current_password, user.password_hash
        ):
            raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة")
        user.password_hash = hash_password(payload.new_password)

    db.commit()
    return _format_user_out(user)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    db.query(Session).filter(Session.user_id == user.id).delete()
    db.commit()
    response.delete_cookie(settings.cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return _format_user_out(user)


@router.get("/admin/users", response_model=list[AdminUserOut])
def list_admin_users(
    db: DbSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """عرض قائمة بجميع المستخدمين الذين استخدموا المنصة (خاص بمدير المنصة والمهندس فقط)."""
    from app.db.models import Course, Vault

    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    results: list[AdminUserOut] = []
    for u in users:
        courses_count = db.scalar(select(func.count(Course.id)).where(Course.owner_id == u.id)) or 0
        vaults_count = db.scalar(select(func.count(Vault.id)).where(Vault.user_id == u.id)) or 0
        is_eng = is_admin_user(u)
        results.append(
            AdminUserOut(
                id=u.id,
                email=u.email,
                name=u.name,
                role="admin" if is_eng else u.role,
                created_at=u.created_at,
                courses_count=courses_count,
                vaults_count=vaults_count,
                is_engineer=is_eng,
            )
        )
    return results
