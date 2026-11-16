"""تجريد التخزين — نظام ملفات الآن، R2/S3 لاحقاً بنفس الواجهة."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Protocol

from app.core.config import settings
from app.core.security import sign_path

_SAFE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$")


import shutil


class Storage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def put_path(self, key: str, source: Path) -> None: ...
    def path(self, key: str) -> Path: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        if not _SAFE_KEY.match(key):
            raise ValueError(f"مفتاح تخزين غير صالح: {key}")
        target = (self.root / key).resolve()
        if not str(target).startswith(str(self.root)):
            raise ValueError("مسار تخزين خارج الجذر")
        return target

    def put(self, key: str, data: bytes) -> None:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(target)

    def put_path(self, key: str, source: Path) -> None:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))

    def path(self, key: str) -> Path:
        target = self._resolve(key)
        if not target.exists():
            raise FileNotFoundError(key)
        return target

    def delete(self, key: str) -> None:
        try:
            self._resolve(key).unlink(missing_ok=True)
        except ValueError:
            pass


storage: Storage = LocalStorage(settings.storage_dir)


def public_url(key: str) -> str:
    return f"{settings.api_prefix}/files/{key}?{sign_path(key)}"


def asset_key(sha256: str, ext: str) -> str:
    return f"assets/{sha256[:2]}/{sha256}{ext}"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
