"""قراءة والتحقق من حزمة `.edupkg` — لا يُوثق بأي بايت قبل فحصه."""

from __future__ import annotations

import io
import json
import posixpath
import zipfile
from dataclasses import dataclass, field

from .canonical import sha256_hex
from .crypto import MAGIC, decrypt_outer, read_outer_header, signing_payload, verify_signature
from .errors import (
    FormatError,
    IntegrityError,
    LimitExceeded,
    SecurityError,
    SignatureError,
    UnsupportedVersion,
)
from .limits import (
    RESERVED_NAMES,
    check_archive_limits,
    check_entry_name,
    check_media_name,
)

SUPPORTED_FORMAT_VERSION = 1
CHUNK = 1 << 20
#: مدخلات لا تدخل في checksums.json
UNCHECKED_NAMES = {"mimetype", "manifest.json", "checksums.json", "signature.json"}


@dataclass
class MediaEntry:
    name: str
    sha256: str
    size: int
    data: bytes | None = None

    @property
    def ext(self) -> str:
        return posixpath.splitext(self.name)[1].lower()


@dataclass
class PackageInfo:
    manifest: dict
    course: dict
    assessments: dict
    media: list[MediaEntry] = field(default_factory=list)
    protection: str = "open"
    signed: bool = False
    verified: bool = False
    warnings: list[str] = field(default_factory=list)
    header_meta: dict = field(default_factory=dict)
    package_size: int = 0

    @property
    def title(self) -> str:
        return self.course.get("title") or self.manifest.get("course", {}).get("title", "")

    def media_by_sha(self, sha: str) -> MediaEntry | None:
        return next((m for m in self.media if m.sha256 == sha), None)


def is_encrypted(data: bytes) -> bool:
    return data.startswith(MAGIC)


def read_public_header(data: bytes) -> dict | None:
    """بيانات عرض فقط (غير موثوقة) لحزمة مشفّرة."""
    if not is_encrypted(data):
        return None
    header, _ = read_outer_header(data)
    return header


def _read_entry(archive: zipfile.ZipFile, info: zipfile.ZipInfo, *, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    with archive.open(info) as handle:
        while True:
            chunk = handle.read(CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                raise LimitExceeded(
                    "ملف يتجاوز الحد عند فك الضغط", detail={"name": info.filename}
                )
            chunks.append(chunk)
    return b"".join(chunks)


def _validate_course(course: dict) -> None:
    if not isinstance(course, dict):
        raise FormatError("course.json ليس كائناً")
    seen: set[str] = set()

    def claim(identifier: object, kind: str) -> None:
        if not isinstance(identifier, str) or not identifier:
            raise FormatError(f"معرّف {kind} مفقود أو غير صالح")
        if identifier in seen:
            raise FormatError("معرّف مكرّر داخل الحزمة", detail={"id": identifier})
        seen.add(identifier)

    units = course.get("units")
    if not isinstance(units, list):
        raise FormatError("course.units يجب أن تكون قائمة")
    for unit in units:
        if not isinstance(unit, dict):
            raise FormatError("وحدة غير صالحة")
        claim(unit.get("id"), "وحدة")
        lessons = unit.get("lessons") or []
        if not isinstance(lessons, list):
            raise FormatError("lessons يجب أن تكون قائمة")
        for lesson in lessons:
            if not isinstance(lesson, dict):
                raise FormatError("درس غير صالح")
            claim(lesson.get("id"), "درس")
            blocks = lesson.get("blocks") or []
            if not isinstance(blocks, list):
                raise FormatError("blocks يجب أن تكون قائمة")
            for block in blocks:
                if not isinstance(block, dict) or not block.get("type"):
                    raise FormatError("كتلة غير صالحة")
                claim(block.get("id"), "كتلة")


def inspect_package(
    data: bytes,
    *,
    invite_code: str | None = None,
    load_media: bool = False,
    require_signature: bool = False,
) -> PackageInfo:
    header_meta: dict = {}
    inner = data

    if is_encrypted(data):
        inner, header = decrypt_outer(data, invite_code)
        header_meta = header.get("meta") or {}
    elif not data.startswith(b"PK\x03\x04"):
        raise FormatError("الملف ليس حزمة .edupkg صالحة (سحر غير معروف)")

    try:
        archive = zipfile.ZipFile(io.BytesIO(inner))
    except zipfile.BadZipFile as exc:
        raise FormatError("أرشيف ZIP تالف") from exc

    with archive:
        infos = archive.infolist()
        check_archive_limits(infos, len(inner))

        names = [info.filename for info in infos]
        if len(names) != len(set(names)):
            raise SecurityError("أسماء مدخلات مكرّرة")

        media_names: list[str] = []
        for name in names:
            check_entry_name(name)
            if name in RESERVED_NAMES:
                continue
            check_media_name(name)
            media_names.append(name)

        if infos[0].filename != "mimetype":
            raise FormatError("مدخل mimetype يجب أن يكون أولاً")
        if infos[0].compress_type != zipfile.ZIP_STORED:
            raise FormatError("مدخل mimetype يجب أن يكون غير مضغوط")

        by_name = {info.filename: info for info in infos}

        def read(name: str) -> bytes:
            info = by_name.get(name)
            if info is None:
                raise FormatError("مدخل إلزامي مفقود", detail={"name": name})
            return _read_entry(archive, info, limit=info.file_size + 1)

        if read("mimetype").strip(b"\r\n\x00 ") != b"application/vnd.edupkg+zip":
            raise FormatError("mimetype غير متوافق")

        try:
            manifest = json.loads(read("manifest.json").decode("utf-8"))
            course = json.loads(read("course.json").decode("utf-8"))
            assessments = json.loads(read("assessments.json").decode("utf-8"))
            checksums = json.loads(read("checksums.json").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise FormatError("محتوى JSON تالف") from exc

        version = manifest.get("formatVersion")
        if not isinstance(version, int) or version > SUPPORTED_FORMAT_VERSION:
            raise UnsupportedVersion(
                "إصدار الحزمة أحدث من قدرة القارئ",
                detail={"found": version, "supported": SUPPORTED_FORMAT_VERSION},
            )

        _validate_course(course)

        # --- تطابق البصمات ---
        files = checksums.get("files") or {}
        if checksums.get("alg") != "sha256" or not isinstance(files, dict):
            raise FormatError("checksums.json غير صالح")
        expected = set(files)
        actual = set(names) - UNCHECKED_NAMES
        if expected != actual:
            raise IntegrityError(
                "قائمة الملفات لا تطابق البصمات",
                detail={
                    "missing": sorted(expected - actual)[:10],
                    "unexpected": sorted(actual - expected)[:10],
                },
            )
        for name, digest in files.items():
            if sha256_hex(read(name)) != digest:
                raise IntegrityError("بصمة ملف لا تطابق", detail={"name": name})

        # --- التوقيع ---
        signature = json.loads(read("signature.json").decode("utf-8")) if (
            "signature.json" in by_name
        ) else None
        signed = signature is not None
        if signed:
            public_key = (manifest.get("author") or {}).get("publicKey")
            if not public_key:
                raise SignatureError("توقيع موجود بلا مفتاح عام")
            verify_signature(public_key, signing_payload(manifest, checksums), signature)
        elif require_signature:
            raise SignatureError("هذه الحزمة غير موقّعة")

        if header_meta and header_meta.get("packageId") and (
            header_meta["packageId"] != manifest.get("packageId")
        ):
            raise IntegrityError("ترويسة الحزمة لا تطابق البيان")

        media = []
        for name in media_names:
            info = by_name[name]
            declared = files.get(name, "")
            if not declared:
                raise IntegrityError("وسيط بلا بصمة", detail={"name": name})
            stem = posixpath.splitext(posixpath.basename(name))[0]
            if stem != declared:
                raise IntegrityError(
                    "اسم الوسيط لا يطابق بصمته", detail={"name": name, "sha256": declared}
                )
            payload = read(name) if load_media else None
            if payload is not None and sha256_hex(payload) != declared:
                raise IntegrityError("بصمة وسيط لا تطابق", detail={"name": name})
            media.append(
                MediaEntry(name=name, sha256=declared, size=info.file_size, data=payload)
            )

    warnings: list[str] = []
    if not signed:
        warnings.append("unsigned: الحزمة غير موقّعة، المصدر غير مُتحقَّق منه")
    if manifest.get("protection") == "read-only":
        warnings.append("read-only: الاستيراد لا يسمح بالتعديل أو إعادة التصدير")

    return PackageInfo(
        manifest=manifest,
        course=course,
        assessments=assessments,
        media=media,
        protection=manifest.get("protection", "open"),
        signed=signed,
        verified=True,
        warnings=warnings,
        header_meta=header_meta,
        package_size=len(data),
    )
