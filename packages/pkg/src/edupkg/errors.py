"""أخطاء مكتبة الحزم — كل خطأ يحمل رمزاً ثابتاً تستهلكه الواجهة."""

from __future__ import annotations


class EduPkgError(Exception):
    """الأصل لكل أخطاء الحزمة."""

    code = "edupkg_error"

    def __init__(self, message: str, *, detail: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or {}

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "detail": self.detail}


class FormatError(EduPkgError):
    code = "format_error"


class UnsupportedVersion(FormatError):
    code = "unsupported_version"


class SecurityError(EduPkgError):
    code = "security_error"


class LimitExceeded(SecurityError):
    code = "limit_exceeded"


class SignatureError(EduPkgError):
    code = "signature_invalid"


class EncryptionError(EduPkgError):
    code = "encryption_error"


class InviteCodeRequired(EncryptionError):
    code = "invite_code_required"


class InvalidInviteCode(EncryptionError):
    code = "invalid_invite_code"


class IntegrityError(EduPkgError):
    code = "integrity_error"
