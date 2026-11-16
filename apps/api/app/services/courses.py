"""منطق المواد المشترك بين المسارات والخدمات."""

from __future__ import annotations

from edupkg import count_course, normalize_course

from app.db.models import Course


def empty_draft(course_id: str, title: str, description: str = "") -> dict:
    return {
        "schemaVersion": 1,
        "id": course_id,
        "title": title,
        "description": description,
        "versionSeq": 0,
        "units": [],
    }


def publish_snapshot(course: Course) -> dict:
    """يحوّل المسودة إلى لقطة ثابتة قانونية (معرّفات وترتيب مضمونان)."""
    draft = dict(course.draft or {})
    draft.setdefault("id", course.id)
    draft["title"] = course.title
    draft["description"] = course.description
    snapshot = normalize_course(draft)
    snapshot["counts"] = count_course(snapshot)
    return snapshot


def course_counts(draft: dict | None) -> tuple[int, int]:
    if not draft:
        return 0, 0
    units = draft.get("units") or []
    lessons = sum(len(unit.get("lessons") or []) for unit in units)
    return len(units), lessons


def collect_asset_hashes(course: dict) -> set[str]:
    """كل بصمات الوسائط المشار إليها في المنهج."""
    hashes: set[str] = set()
    for unit in course.get("units") or []:
        for lesson in unit.get("lessons") or []:
            for block in lesson.get("blocks") or []:
                value = block.get("assetSha256")
                if isinstance(value, str) and len(value) == 64:
                    hashes.add(value)
    return hashes
