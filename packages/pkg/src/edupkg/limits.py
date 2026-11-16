"""حدود الأمان — تُطبَّق قبل قراءة أي بايت من المحتوى."""

from __future__ import annotations

import posixpath

from .errors import FormatError, LimitExceeded, SecurityError

MAX_TOTAL_UNCOMPRESSED = 2 * 1024**3  # 2 GiB
MAX_ENTRIES = 500
MAX_ENTRY_SIZE = 1024**3  # 1 GiB
MAX_COMPRESSION_RATIO = 100  # :1

ALLOWED_MEDIA_EXTENSIONS = {
    ".mp4", ".webm", ".mp3", ".wav", ".m4a",
    ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".epub",
}

RESERVED_NAMES = {"mimetype", "manifest.json", "course.json", "assessments.json",
                  "checksums.json", "signature.json"}


def check_entry_name(name: str) -> None:
    if not name or name.startswith(("/", "\\")):
        raise SecurityError("مسار مطلق مرفوض", detail={"name": name})
    if "\\" in name:
        raise SecurityError("محدّد مسار غير قياسي مرفوض", detail={"name": name})
    if ":" in name:
        raise SecurityError("مسار يحتوي محرّك أقراص مرفوض", detail={"name": name})
    norm = posixpath.normpath(name)
    if norm.startswith("..") or norm != name:
        raise SecurityError("مسار خارجي (traversal) مرفوض", detail={"name": name})
    if "\x00" in name:
        raise SecurityError("اسم ملف يحتوي بايت صفري", detail={"name": name})


def check_media_name(name: str) -> None:
    check_entry_name(name)
    if not name.startswith("media/"):
        raise FormatError("مدخل غير معروف في الحزمة", detail={"name": name})
    ext = posixpath.splitext(name)[1].lower()
    if ext not in ALLOWED_MEDIA_EXTENSIONS:
        raise SecurityError("امتداد وسيط غير مسموح", detail={"name": name})


def check_archive_limits(infos, archive_size: int) -> None:
    """infos: قائمة ZipInfo. يرفض القنابل قبل فك الضغط."""
    if len(infos) > MAX_ENTRIES:
        raise LimitExceeded(
            "عدد ملفات الحزمة يتجاوز الحد",
            detail={"count": len(infos), "max": MAX_ENTRIES},
        )
    total = 0
    for info in infos:
        if info.file_size > MAX_ENTRY_SIZE:
            raise LimitExceeded(
                "ملف واحد يتجاوز الحد الأقصى",
                detail={"name": info.filename, "size": info.file_size},
            )
        total += info.file_size
    if total > MAX_TOTAL_UNCOMPRESSED:
        raise LimitExceeded(
            "الحجم بعد فك الضغط يتجاوز الحد",
            detail={"total": total, "max": MAX_TOTAL_UNCOMPRESSED},
        )
    if archive_size > 0 and total / max(archive_size, 1) > MAX_COMPRESSION_RATIO:
        raise LimitExceeded(
            "نسبة ضغط مريبة (محاولة zip bomb محتملة)",
            detail={"ratio": round(total / archive_size, 1), "max": MAX_COMPRESSION_RATIO},
        )
