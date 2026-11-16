"""JSON قانوني (canonical) وبصمات — أساس التوقيع والحتمية.

القاعدة: نفس المدخلات يجب أن تُنتج نفس البايتات على كل المنصات.
"""

from __future__ import annotations

import base64
import hashlib
import json
from typing import Any


def canonical_json(obj: Any) -> bytes:
    """JSON قانوني: مفاتيح مرتّبة، بلا مسافات، UTF-8، بلا تهريب يونيكود."""
    return json.dumps(
        obj,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_bytes(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64url_decode(text: str) -> bytes:
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))
