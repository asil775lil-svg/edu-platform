"""تسجيل، دخول، خروج، وجلسات بكوكيز HttpOnly."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from nacl.signing import SigningKey
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user
from app.core.config import settings
from app.core.security import (
    hash_password,
    new_token,
    token_fingerprint,
    user_signing_seed,
    verify_password,
)
from app.db.base import get_db
from app.db.models import Session, User
from app.schemas import LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _start_session(db: DbSession, user: User, response: Response) -> None:
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
    user.public_key = _public_key_for(user.id)
    db.commit()
    _start_session(db, user, response)
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: DbSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="البريد أو كلمة المرور غير صحيحة")
    _start_session(db, user, response)
    return user


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
    return user


def _public_key_for(user_id: str) -> str:
    from edupkg import b64url_encode

    return b64url_encode(bytes(SigningKey(user_signing_seed(user_id)).verify_key))
