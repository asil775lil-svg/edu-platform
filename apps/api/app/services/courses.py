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


def parse_markdown_to_draft(course_id: str, title: str, markdown: str) -> dict:
    """تحويل نص Markdown إلى هيكل مادة بوحدات ودروس وكتل."""
    import re
    import uuid

    units: list[dict] = []
    current_unit: dict | None = None
    current_lesson: dict | None = None

    def ensure_unit() -> dict:
        nonlocal current_unit
        if current_unit is None:
            current_unit = {
                "id": f"unit_{uuid.uuid4().hex[:8]}",
                "title": "الوحدة الأولى",
                "order": len(units),
                "lessons": [],
            }
            units.append(current_unit)
        return current_unit

    def ensure_lesson() -> dict:
        nonlocal current_lesson
        unit = ensure_unit()
        if current_lesson is None:
            current_lesson = {
                "id": f"les_{uuid.uuid4().hex[:8]}",
                "title": "الدرس التمهيدي",
                "order": len(unit["lessons"]),
                "blocks": [],
            }
            unit["lessons"].append(current_lesson)
        return current_lesson

    lines = markdown.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # عنوان وحدة (# الوحدة)
        if stripped.startswith("# ") and not stripped.startswith("## "):
            unit_title = stripped[2:].strip()
            current_unit = {
                "id": f"unit_{uuid.uuid4().hex[:8]}",
                "title": unit_title,
                "order": len(units),
                "lessons": [],
            }
            units.append(current_unit)
            current_lesson = None
            i += 1
            continue

        # عنوان درس (## الدرس)
        if stripped.startswith("## ") and not stripped.startswith("### "):
            lesson_title = stripped[3:].strip()
            unit = ensure_unit()
            current_lesson = {
                "id": f"les_{uuid.uuid4().hex[:8]}",
                "title": lesson_title,
                "order": len(unit["lessons"]),
                "blocks": [],
            }
            unit["lessons"].append(current_lesson)
            i += 1
            continue

        lesson = ensure_lesson()

        # عنوان فرعي (### عنوان)
        if stripped.startswith("### "):
            heading_text = stripped[4:].strip()
            lesson["blocks"].append({
                "id": f"blk_{uuid.uuid4().hex[:8]}",
                "type": "heading",
                "text": heading_text,
                "level": 3,
            })
            i += 1
            continue

        # كتلة كود (```lang)
        if stripped.startswith("```"):
            lang = stripped[3:].strip() or "text"
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1  # تجاوز الـ ``` الأخيرة
            lesson["blocks"].append({
                "id": f"blk_{uuid.uuid4().hex[:8]}",
                "type": "code",
                "code": "\n".join(code_lines),
                "language": lang,
            })
            continue

        # معادلة رياضية ($$ math $$)
        if stripped.startswith("$$"):
            math_lines = [stripped[2:]]
            if stripped.endswith("$$") and len(stripped) > 4:
                math_text = stripped[2:-2].strip()
                i += 1
            else:
                i += 1
                while i < len(lines) and not lines[i].strip().endswith("$$"):
                    math_lines.append(lines[i])
                    i += 1
                if i < len(lines):
                    math_lines.append(lines[i].strip()[:-2])
                    i += 1
                math_text = "\n".join(math_lines).strip()
            lesson["blocks"].append({
                "id": f"blk_{uuid.uuid4().hex[:8]}",
                "type": "math",
                "latex": math_text,
                "displayMode": True,
            })
            continue


        # تنبيه (> اقتباس أو تنبيه)
        if stripped.startswith(">"):
            callout_text = stripped.lstrip("> ").strip()
            variant = "info"
            if "[!warning]" in callout_text or "[!danger]" in callout_text:
                variant = "warning"
                callout_text = re.sub(r"\[!(?:warning|danger)\]", "", callout_text).strip()
            elif "[!tip]" in callout_text:
                variant = "tip"
                callout_text = re.sub(r"\[!tip\]", "", callout_text).strip()
            lesson["blocks"].append({
                "id": f"blk_{uuid.uuid4().hex[:8]}",
                "type": "callout",
                "calloutTitle": "ملاحظة هامة",
                "calloutVariant": variant,
                "text": callout_text,
            })
            i += 1
            continue

        # فقرة نصية عادية
        para_lines = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].strip().startswith(("#", "```", "$$", ">")):
            para_lines.append(lines[i])
            i += 1
        para_text = " ".join(p.strip() for p in para_lines)
        lesson["blocks"].append({
            "id": f"blk_{uuid.uuid4().hex[:8]}",
            "type": "text",
            "doc": {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": para_text}],
                    }
                ],
            },
        })

    return {
        "schemaVersion": 1,
        "id": course_id,
        "title": title,
        "description": f"منهج مستورد تلقائياً — {len(units)} وحدات",
        "versionSeq": 0,
        "units": units,
    }

