"""تجزئة كلمات المرور، جلسات غير شفافة، وروابط موقّعة."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

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


def _user_enc_key() -> bytes:
    return hashlib.sha256(f"edupkg-user-key-enc:{settings.secret_key}".encode("utf-8")).digest()


def generate_user_signing_key(user_id: str) -> tuple[str, str]:
    """توليد زوج مفاتيح Ed25519 عشوائي وتشفير المفتاح الخاص بـ AES-256-GCM عند التخزين."""
    from edupkg import b64url_encode, generate_keypair

    kp = generate_keypair()
    aesgcm = AESGCM(_user_enc_key())
    nonce = secrets.token_bytes(12)
    ciphertext = aesgcm.encrypt(nonce, kp.private_key, user_id.encode("utf-8"))
    return kp.public_key_b64, b64url_encode(nonce + ciphertext)


def decrypt_user_signing_key(user_id: str, private_key_enc: str | None) -> bytes:
    """فك تشفير بذرة Ed25519 الخاصة بالمستخدم مع التوافق العكسي مع الحسابات القديمة."""
    from edupkg import b64url_decode

    if private_key_enc:
        raw = b64url_decode(private_key_enc)
        nonce = raw[:12]
        ciphertext = raw[12:]
        aesgcm = AESGCM(_user_enc_key())
        return aesgcm.decrypt(nonce, ciphertext, user_id.encode("utf-8"))

    # توافق عكسي مع حسابات سابقة أنشئت قبل التشفير المستقل:
    return hashlib.sha256(f"edupkg-sign:{user_id}:{settings.secret_key}".encode()).digest()


def user_signing_seed(user_id: str, private_key_enc: str | None = None) -> bytes:
    """دالة توافقية تستدعي decrypt_user_signing_key."""
    return decrypt_user_signing_key(user_id, private_key_enc)

