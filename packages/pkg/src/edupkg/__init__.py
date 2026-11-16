"""مكتبة `.edupkg` — بناء، توقيع، تشفير، تحقق.

مثال:
    from edupkg import build_package, inspect_package, generate_keypair, MediaFile

    keys = generate_keypair()
    built = build_package(
        course={"title": "الرياضيات", "units": []},
        author={"id": "u1", "name": "أ. محمد"},
        private_key=keys.private_key,
    )
    info = inspect_package(built.data, require_signature=True)
"""

from .builder import (
    FORMAT_VERSION,
    MIMETYPE,
    BuiltPackage,
    MediaFile,
    build_package,
    count_course,
    normalize_course,
)
from .canonical import b64url_decode, b64url_encode, canonical_json, sha256_hex
from .crypto import KeyPair, generate_keypair, read_outer_header, signing_payload
from .errors import (
    EduPkgError,
    EncryptionError,
    FormatError,
    IntegrityError,
    InvalidInviteCode,
    InviteCodeRequired,
    LimitExceeded,
    SecurityError,
    SignatureError,
    UnsupportedVersion,
)
from .reader import MediaEntry, PackageInfo, inspect_package, is_encrypted, read_public_header

__all__ = [
    "FORMAT_VERSION",
    "MIMETYPE",
    "BuiltPackage",
    "EduPkgError",
    "EncryptionError",
    "FormatError",
    "IntegrityError",
    "InvalidInviteCode",
    "InviteCodeRequired",
    "KeyPair",
    "LimitExceeded",
    "MediaEntry",
    "MediaFile",
    "PackageInfo",
    "SecurityError",
    "SignatureError",
    "UnsupportedVersion",
    "b64url_decode",
    "b64url_encode",
    "build_package",
    "canonical_json",
    "count_course",
    "generate_keypair",
    "inspect_package",
    "is_encrypted",
    "normalize_course",
    "read_outer_header",
    "read_public_header",
    "sha256_hex",
    "signing_payload",
]
