"""التحقق من رموز Firebase ID Tokens عبر شهادات Google العامة المعتمدة."""

from __future__ import annotations

import time
from typing import Any
import httpx
import jwt
from cryptography.x509 import load_pem_x509_certificate

from app.core.config import settings

GOOGLE_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
)

_cached_certs: dict[str, Any] = {}
_certs_expiry: float = 0.0


def _get_google_certs() -> dict[str, Any]:
    global _cached_certs, _certs_expiry
    now = time.time()
    if _cached_certs and now < _certs_expiry:
        return _cached_certs

    try:
        resp = httpx.get(GOOGLE_CERTS_URL, timeout=10.0)
        resp.raise_for_status()
        certs = resp.json()
        cache_control = resp.headers.get("cache-control", "")
        max_age = 3600
        for part in cache_control.split(","):
            part = part.strip()
            if part.startswith("max-age="):
                try:
                    max_age = int(part.split("=")[1])
                except ValueError:
                    pass
        _cached_certs = certs
        _certs_expiry = now + max_age
        return _cached_certs
    except Exception as exc:
        if _cached_certs:
            return _cached_certs
        raise RuntimeError(f"تعذّر جلب شهادات Firebase: {exc}") from exc


def verify_firebase_token(id_token: str, project_id: str | None = None) -> dict[str, Any]:
    """يتحقق من صحة ID Token الصادر من Firebase ويرجع البيانات المشفرة (claims)."""
    pid = project_id or getattr(settings, "firebase_project_id", "smart-education-ed253")

    # استخراج kid من ترويسة الـ JWT
    try:
        unverified_headers = jwt.get_unverified_header(id_token)
    except Exception as exc:
        raise ValueError("رمز Firebase غير صالح (تنسيق غير سليم)") from exc

    kid = unverified_headers.get("kid")
    if not kid:
        raise ValueError("رمز Firebase لا يحتوي على kid")

    certs = _get_google_certs()
    cert_str = certs.get(kid)
    if not cert_str:
        raise ValueError("مفتاح التوقيع غير موجود في شهادات Google")

    cert = load_pem_x509_certificate(cert_str.encode("utf-8"))
    public_key = cert.public_key()

    try:
        payload = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=pid,
            issuer=f"https://securetoken.google.com/{pid}",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("انتهت صلاحية جلسة Firebase")
    except jwt.InvalidTokenError as exc:
        raise ValueError(f"رمز Firebase غير صحيح: {exc}")
