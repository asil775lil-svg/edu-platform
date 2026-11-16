"""التشفير والتوقيع — باستخدام مكتبات مثبتة فقط (PyNaCl + Argon2id)."""

from __future__ import annotations

import json
import os
import struct
from dataclasses import dataclass

from argon2.low_level import Type as Argon2Type
from argon2.low_level import hash_secret_raw
from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

from .canonical import b64url_decode, b64url_encode, sha256_bytes
from .errors import EncryptionError, InvalidInviteCode, SignatureError

MAGIC = b"EDUPKG1\n"
AES_NONCE_LEN = 12
AES_TAG_LEN = 16
SIGN_PREFIX = b"edupkg-v1\n"


# --------------------------------------------------------------------------- #
# Ed25519
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class KeyPair:
    private_key: bytes  # 32 bytes seed
    public_key: bytes  # 32 bytes

    @property
    def public_key_b64(self) -> str:
        return b64url_encode(self.public_key)

    @property
    def key_id(self) -> str:
        return b64url_encode(sha256_bytes(self.public_key)[:16])


def generate_keypair() -> KeyPair:
    sk = SigningKey.generate()
    return KeyPair(private_key=bytes(sk), public_key=bytes(sk.verify_key))


def signing_payload(manifest: dict, checksums: dict) -> bytes:
    from .canonical import canonical_json

    return SIGN_PREFIX + canonical_json({"manifest": manifest, "checksums": checksums})


def sign(private_key: bytes, payload: bytes) -> dict:
    key = SigningKey(private_key)
    signature = key.sign(payload).signature
    return {
        "alg": "ed25519",
        "keyId": b64url_encode(sha256_bytes(bytes(key.verify_key))[:16]),
        "sig": b64url_encode(signature),
    }


def verify_signature(public_key_b64: str, payload: bytes, signature: dict) -> None:
    if signature.get("alg") != "ed25519":
        raise SignatureError("خوارزمية توقيع غير مدعومة", detail={"alg": signature.get("alg")})
    try:
        pub = b64url_decode(public_key_b64)
        sig = b64url_decode(signature["sig"])
    except (KeyError, ValueError, TypeError) as exc:
        raise SignatureError("توقيع تالف", detail={"reason": str(exc)}) from exc
    if len(pub) != 32 or len(sig) != 64:
        raise SignatureError("أطوال مفاتيح/توقيع غير صحيحة")
    try:
        VerifyKey(pub).verify(payload, sig)
    except BadSignatureError as exc:
        raise SignatureError("التوقيع لا يطابق محتوى الحزمة") from exc


# --------------------------------------------------------------------------- #
# Argon2id + AES-256-GCM
# --------------------------------------------------------------------------- #
ARGON2_PARAMS = {"memoryKiB": 65536, "iterations": 3, "parallelism": 1}


def derive_key(code: str, salt: bytes) -> bytes:
    return hash_secret_raw(
        secret=code.encode("utf-8"),
        salt=salt,
        time_cost=ARGON2_PARAMS["iterations"],
        memory_cost=ARGON2_PARAMS["memoryKiB"],
        parallelism=ARGON2_PARAMS["parallelism"],
        hash_len=32,
        type=Argon2Type.ID,
    )


def _aes_gcm(key: bytes, nonce: bytes, data: bytes, *, encrypt: bool) -> bytes:
    """AES-256-GCM عبر cryptography إن وُجدت، وإلا خطأ واضح."""
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:  # pragma: no cover
        raise EncryptionError(
            "مكتبة cryptography مطلوبة لتشفير الحزم: pip install cryptography"
        ) from exc
    return AESGCM(key).encrypt(nonce, data, MAGIC) if encrypt else AESGCM(key).decrypt(
        nonce, data, MAGIC
    )


def encrypt_outer(inner_zip: bytes, code: str, header_meta: dict) -> bytes:
    salt = os.urandom(16)
    nonce = os.urandom(AES_NONCE_LEN)
    key = derive_key(code, salt)
    header = {
        "formatVersion": 1,
        "packageId": header_meta["packageId"],
        "protection": "invite-code",
        "meta": {
            "title": header_meta.get("title", ""),
            "authorName": header_meta.get("authorName", ""),
            "createdAt": header_meta.get("createdAt", ""),
        },
        "kdf": {"name": "argon2id", "salt": b64url_encode(salt), **ARGON2_PARAMS},
        "cipher": {"name": "aes-256-gcm", "nonce": b64url_encode(nonce)},
    }
    header_bytes = json.dumps(header, ensure_ascii=False).encode("utf-8")
    ciphertext = _aes_gcm(key, nonce, inner_zip, encrypt=True)
    return MAGIC + struct.pack(">I", len(header_bytes)) + header_bytes + ciphertext


def read_outer_header(data: bytes) -> tuple[dict, bytes]:
    """يفصل الترويسة (غير موثوقة) عن النص المشفّر."""
    if not data.startswith(MAGIC):
        raise EncryptionError("ليست حزمة مشفّرة")
    offset = len(MAGIC)
    if len(data) < offset + 4:
        raise EncryptionError("ترويسة مقطوعة")
    (header_len,) = struct.unpack(">I", data[offset : offset + 4])
    if header_len > 64 * 1024 or len(data) < offset + 4 + header_len:
        raise EncryptionError("طول ترويسة غير صالح")
    try:
        header = json.loads(data[offset + 4 : offset + 4 + header_len].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EncryptionError("ترويسة غير قابلة للقراءة") from exc
    return header, data[offset + 4 + header_len :]


def decrypt_outer(data: bytes, code: str | None) -> tuple[bytes, dict]:
    header, ciphertext = read_outer_header(data)
    if not code:
        raise EncryptionError("هذه الحزمة تتطلب رمز دعوة")
    kdf = header.get("kdf") or {}
    cipher = header.get("cipher") or {}
    if kdf.get("name") != "argon2id" or cipher.get("name") != "aes-256-gcm":
        raise EncryptionError("خوارزمية غير مدعومة", detail={"kdf": kdf, "cipher": cipher})
    try:
        salt = b64url_decode(kdf["salt"])
        nonce = b64url_decode(cipher["nonce"])
    except (KeyError, ValueError) as exc:
        raise EncryptionError("معاملات تشفير تالفة") from exc
    if len(nonce) != AES_NONCE_LEN:
        raise EncryptionError("nonce غير صالح")
    key = derive_key(code, salt)
    try:
        plaintext = _aes_gcm(key, nonce, ciphertext, encrypt=False)
    except Exception as exc:  # cryptography يرفع InvalidTag
        raise InvalidInviteCode("رمز الدعوة غير صحيح أو الحزمة تالفة") from exc
    return plaintext, header
