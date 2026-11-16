"""بناء حزمة `.edupkg` بشكل حتمي."""

from __future__ import annotations

import io
import posixpath
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime

from .canonical import b64url_encode, canonical_json, sha256_hex
from .crypto import encrypt_outer, sign, signing_payload
from .errors import FormatError, SecurityError
from .limits import ALLOWED_MEDIA_EXTENSIONS, MAX_ENTRIES, MAX_TOTAL_UNCOMPRESSED

MIMETYPE = b"application/vnd.edupkg+zip"
FORMAT_VERSION = 1
GENERATOR = "edupkg-py/1.0.0"

#: تاريخ ثابت داخل ZIP ⇒ نفس المدخلات تُنتج نفس البايتات.
FIXED_ZIP_DATE = (1980, 1, 1, 0, 0, 0)
DEFLATE_LEVEL = 9


@dataclass
class MediaFile:
    """وسيط واحد. الاسم يُستخدم لاستخراج الامتداد فقط."""

    name: str
    data: bytes
    sha256: str = field(default="")

    def __post_init__(self) -> None:
        self.sha256 = sha256_hex(self.data)
        ext = posixpath.splitext(self.name)[1].lower()
        if ext not in ALLOWED_MEDIA_EXTENSIONS:
            raise SecurityError("امتداد وسيط غير مسموح", detail={"name": self.name})

    @property
    def package_name(self) -> str:
        ext = posixpath.splitext(self.name)[1].lower()
        return f"media/{self.sha256}{ext}"


@dataclass
class BuiltPackage:
    data: bytes
    manifest: dict
    checksums: dict
    signature: dict | None


def _zipinfo(name: str, *, stored: bool = False) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=FIXED_ZIP_DATE)
    info.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
    info.create_system = 3  # Unix
    info.external_attr = 0o644 << 16
    return info


def _write_zip(entries: list[tuple[str, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, data in entries:
            archive.writestr(
                _zipinfo(name, stored=(name == "mimetype")),
                data,
                compresslevel=DEFLATE_LEVEL,
            )
    return buffer.getvalue()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def normalize_course(course: dict) -> dict:
    """يضمن وجود معرّفات وترتيب لكل عقدة. لا يغيّر معرّفاً موجوداً أبداً."""
    if not isinstance(course, dict):
        raise FormatError("course يجب أن يكون كائناً")
    normalized = dict(course)
    normalized.setdefault("schemaVersion", 1)
    normalized.setdefault("id", _new_id("course"))
    normalized.setdefault("title", "بدون عنوان")
    normalized.setdefault("description", "")

    units = []
    for unit_index, unit in enumerate(normalized.get("units") or []):
        if not isinstance(unit, dict):
            raise FormatError("وحدة غير صالحة")
        unit_out = {
            "id": unit.get("id") or _new_id("unit"),
            "title": unit.get("title") or "وحدة",
            "order": unit.get("order", unit_index),
            "lessons": [],
        }
        if unit.get("summary"):
            unit_out["summary"] = unit["summary"]
        for lesson_index, lesson in enumerate(unit.get("lessons") or []):
            if not isinstance(lesson, dict):
                raise FormatError("درس غير صالح")
            blocks = []
            for block_index, block in enumerate(lesson.get("blocks") or []):
                if not isinstance(block, dict) or not block.get("type"):
                    raise FormatError("كتلة غير صالحة")
                block_out = dict(block)
                block_out.setdefault("id", _new_id("blk"))
                block_out.setdefault("order", block_index)
                blocks.append(block_out)
            lesson_out = {
                "id": lesson.get("id") or _new_id("les"),
                "title": lesson.get("title") or "درس",
                "order": lesson.get("order", lesson_index),
                "blocks": blocks,
            }
            if lesson.get("summary"):
                lesson_out["summary"] = lesson["summary"]
            unit_out["lessons"].append(lesson_out)
        unit_out["lessons"].sort(key=lambda item: (item["order"], item["id"]))
        units.append(unit_out)
    units.sort(key=lambda item: (item["order"], item["id"]))
    normalized["units"] = units
    return normalized


def count_course(course: dict) -> dict:
    units = course.get("units") or []
    return {
        "units": len(units),
        "lessons": sum(len(unit.get("lessons") or []) for unit in units),
        "blocks": sum(
            len(lesson.get("blocks") or [])
            for unit in units
            for lesson in (unit.get("lessons") or [])
        ),
    }


def build_package(
    *,
    course: dict,
    author: dict,
    protection: str = "open",
    invite_code: str | None = None,
    media: list[MediaFile] | None = None,
    private_key: bytes | None = None,
    license: str | None = None,
    created_at: datetime | None = None,
    package_id: str | None = None,
) -> BuiltPackage:
    if protection not in {"open", "read-only", "invite-code"}:
        raise FormatError("درجة حماية غير معروفة", detail={"protection": protection})
    if protection == "invite-code" and not invite_code:
        raise FormatError("الحماية برمز الدعوة تتطلب رمزاً")

    media = media or []
    if len(media) + 6 > MAX_ENTRIES:
        raise SecurityError("عدد ملفات الحزمة يتجاوز الحد", detail={"max": MAX_ENTRIES})

    # الوسائط معنونة بالبصمة ⇒ المتطابق منها يُخزَّن مرة واحدة تلقائياً
    unique_media: dict[str, MediaFile] = {}
    for item in media:
        unique_media.setdefault(item.package_name, item)
    media = list(unique_media.values())

    normalized_course = normalize_course(course)
    course_bytes = canonical_json(normalized_course)
    assessments = dict(normalized_course.get("assessments") or {"items": []})
    if "items" not in assessments:
        assessments["items"] = []
    assessments_bytes = canonical_json(assessments)

    created = (created_at or datetime.now(UTC)).astimezone(UTC)
    created_iso = created.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    pkg_id = package_id or str(uuid.uuid4())
    counts = count_course(normalized_course)

    uncompressed = len(course_bytes) + len(assessments_bytes) + sum(len(m.data) for m in media)
    if uncompressed > MAX_TOTAL_UNCOMPRESSED:
        raise SecurityError("حجم الحزمة يتجاوز الحد الأقصى")

    manifest = {
        "formatVersion": FORMAT_VERSION,
        "packageId": pkg_id,
        "createdAt": created_iso,
        "generator": GENERATOR,
        "course": {
            "id": normalized_course["id"],
            "title": normalized_course["title"],
            "language": normalized_course.get("language", "ar"),
            "level": normalized_course.get("level", ""),
            "versionSeq": int(normalized_course.get("versionSeq", 1)),
        },
        "author": {
            "id": author.get("id", ""),
            "name": author.get("name", ""),
            "publicKey": author.get("publicKey", ""),
        },
        "protection": protection,
        "encryption": None,
        "entryPoint": "course.json",
        "counts": {**counts, "media": len(media)},
        "uncompressedSize": uncompressed,
        "license": license or "",
    }

    checksums = {
        "alg": "sha256",
        "files": {
            "course.json": sha256_hex(course_bytes),
            "assessments.json": sha256_hex(assessments_bytes),
            **{m.package_name: m.sha256 for m in media},
        },
    }
    checksums_bytes = canonical_json(checksums)

    signature = None
    signature_bytes = None
    if private_key is not None:
        from nacl.signing import SigningKey

        if not manifest["author"]["publicKey"]:
            manifest["author"]["publicKey"] = b64url_encode(
                bytes(SigningKey(private_key).verify_key)
            )
        signature = sign(private_key, signing_payload(manifest, checksums))
        signature_bytes = canonical_json(signature)

    entries: list[tuple[str, bytes]] = [
        ("mimetype", MIMETYPE),
        ("manifest.json", canonical_json(manifest)),
        ("course.json", course_bytes),
        ("assessments.json", assessments_bytes),
    ]
    entries.extend(
        (m.package_name, m.data) for m in sorted(media, key=lambda item: item.package_name)
    )
    entries.append(("checksums.json", checksums_bytes))
    if signature_bytes is not None:
        entries.append(("signature.json", signature_bytes))

    inner_zip = _write_zip(entries)

    if protection == "invite-code":
        assert invite_code is not None
        data = encrypt_outer(
            inner_zip,
            invite_code,
            {
                "packageId": pkg_id,
                "title": normalized_course["title"],
                "authorName": manifest["author"]["name"],
                "createdAt": created_iso,
            },
        )
    else:
        data = inner_zip

    return BuiltPackage(data=data, manifest=manifest, checksums=checksums, signature=signature)
