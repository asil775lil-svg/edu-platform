"""تجزئة كلمات المرور، جلسات غير شفافة، وروابط موقّعة."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:  # noqa: BLE001 — هاش تالف/إصدار Argon2 قديم ⇒ فشل تحقق
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _sign(payload: str) -> str:
    return hmac.new(
        settings.secret_key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def sign_path(key: str, ttl: int | None = None) -> str:
    expires = int(time.time()) + (ttl or settings.signed_url_ttl_seconds)
    return f"exp={expires}&sig={_sign(f'{key}:{expires}')}"


def verify_path(key: str, expires: int, signature: str) -> bool:
    if int(time.time()) > expires:
        return False
    return hmac.compare_digest(_sign(f"{key}:{expires}"), signature)


def user_signing_seed(user_id: str) -> bytes:
    """بذرة Ed25519 مشتقة من هوية المستخدم + مفتاح الخادم (لا تخزين لمفاتيح خاصة)."""
    return hashlib.sha256(f"edupkg-sign:{user_id}:{settings.secret_key}".encode()).digest()
