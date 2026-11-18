"""خدمة فحص وقراءة محتويات ملفات الخزينة بصيغها الأصلية من داخل المنصة."""

from __future__ import annotations

import csv
import io
import json
import os
import posixpath
import sqlite3
import tarfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any


def _safe_read_text(path: Path, max_bytes: int = 3 * 1024 * 1024) -> str:
    """قراءة نص الملف مع دعم الترميزات المختلفة والتوقف عند الحد الأقصى."""
    raw = path.read_bytes()[:max_bytes]
    for enc in ("utf-8-sig", "utf-8", "cp1256", "windows-1256", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _inspect_docx(path: Path) -> dict[str, Any]:
    """استخراج الفقرات والعناوين والجداول من مستند Word (.docx) مباشرة."""
    blocks: list[dict[str, Any]] = []
    try:
        with zipfile.ZipFile(path, "r") as z:
            if "word/document.xml" not in z.namelist():
                return {"kind": "docx", "blocks": [{"type": "paragraph", "text": "مستند Word غير قياسي."}]}

            doc_xml = z.read("word/document.xml")
            tree = ET.fromstring(doc_xml)
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

            for elem in tree.iter():
                tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                if tag == "p":
                    p_style = elem.find(".//w:pStyle", ns)
                    style_val = (
                        p_style.attrib.get(f"{{{ns['w']}}}val", "")
                        if p_style is not None
                        else ""
                    )
                    texts = [t.text for t in elem.findall(".//w:t", ns) if t.text]
                    full_text = "".join(texts).strip()
                    if full_text:
                        s_lower = style_val.lower()
                        if "heading" in s_lower or "title" in s_lower:
                            level = 1 if "1" in s_lower or "title" in s_lower else (2 if "2" in s_lower else 3)
                            blocks.append({"type": "heading", "level": level, "text": full_text})
                        else:
                            blocks.append({"type": "paragraph", "text": full_text})

                elif tag == "tbl":
                    rows: list[list[str]] = []
                    for tr in elem.findall(".//w:tr", ns):
                        cells: list[str] = []
                        for tc in tr.findall(".//w:tc", ns):
                            cell_texts = [t.text for t in tc.findall(".//w:t", ns) if t.text]
                            cells.append("".join(cell_texts).strip())
                        if cells:
                            rows.append(cells)
                    if rows:
                        blocks.append({"type": "table", "rows": rows[:100]})  # حد أقصى 100 صف
    except Exception as exc:
        blocks = [{"type": "error", "text": f"تعذر قراءة بنية المستند: {str(exc)}"}]

    return {"kind": "docx", "blocks": blocks}


def _inspect_xlsx(path: Path) -> dict[str, Any]:
    """استخراج الجداول والصفوف من ملف Excel (.xlsx) مباشرة."""
    sheets: list[dict[str, Any]] = []
    try:
        with zipfile.ZipFile(path, "r") as z:
            # 1. قراءة النصوص المشتركة (Shared Strings)
            shared_strings: list[str] = []
            if "xl/sharedStrings.xml" in z.namelist():
                ss_tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
                ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                for si in ss_tree.findall(".//s:si", ns):
                    t = si.find(".//s:t", ns)
                    if t is not None and t.text:
                        shared_strings.append(t.text)
                    else:
                        texts = [sub.text for sub in si.findall(".//s:t", ns) if sub.text]
                        shared_strings.append("".join(texts))

            # 2. قراءة أسماء أوراق العمل
            sheet_names: list[str] = []
            if "xl/workbook.xml" in z.namelist():
                wb_tree = ET.fromstring(z.read("xl/workbook.xml"))
                ns_wb = {"w": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                for sheet in wb_tree.findall(".//w:sheet", ns_wb):
                    sheet_names.append(sheet.attrib.get("name", "ورقة"))

            # 3. قراءة محتويات أوراق العمل المتاحة
            worksheets = sorted([n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")])
            for idx, ws_name in enumerate(worksheets[:5]):  # أول 5 أوراق عمل كحد أقصى
                s_name = sheet_names[idx] if idx < len(sheet_names) else f"ورقة {idx + 1}"
                ws_tree = ET.fromstring(z.read(ws_name))
                ns_ws = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

                rows: list[list[str]] = []
                for row_elem in ws_tree.findall(".//s:row", ns_ws)[:200]:  # أول 200 صف
                    cell_vals: list[str] = []
                    for c_elem in row_elem.findall(".//s:c", ns_ws):
                        c_type = c_elem.attrib.get("t", "")
                        v_elem = c_elem.find(".//s:v", ns_ws)
                        val = v_elem.text if v_elem is not None and v_elem.text else ""
                        if c_type == "s" and val.isdigit():
                            idx_str = int(val)
                            val = shared_strings[idx_str] if idx_str < len(shared_strings) else val
                        cell_vals.append(val)
                    if any(cell_vals):
                        rows.append(cell_vals)

                sheets.append({"name": s_name, "rows": rows})
    except Exception as exc:
        sheets = [{"name": "خطأ", "rows": [[f"تعذر استخراج بيانات الجدول: {str(exc)}"]]}]

    return {"kind": "spreadsheet", "sheets": sheets}


def _inspect_csv(path: Path) -> dict[str, Any]:
    """قراءة وتحليل ملفات CSV و TSV."""
    rows: list[list[str]] = []
    try:
        content = _safe_read_text(path, max_bytes=1024 * 1024)
        sample = content[:4096]
        sniffer = csv.Sniffer()
        try:
            dialect = sniffer.sniff(sample)
        except Exception:
            dialect = csv.excel

        reader = csv.reader(io.StringIO(content), dialect=dialect)
        for i, row in enumerate(reader):
            if i >= 300:  # حد أقصى 300 صف للمعاينة
                break
            rows.append(row)
    except Exception as exc:
        rows = [[f"تعذر قراءة ملف CSV: {str(exc)}"]]

    return {"kind": "spreadsheet", "sheets": [{"name": "البيانات", "rows": rows}]}


def _inspect_zip(path: Path) -> dict[str, Any]:
    """فحص واستعراض هيكل المجلدات والملفات داخل الأرشيف المضغوط (ZIP)."""
    files: list[dict[str, Any]] = []
    total_uncompressed = 0
    try:
        with zipfile.ZipFile(path, "r") as z:
            for info in z.infolist():
                total_uncompressed += info.file_size
                is_dir = info.is_dir() or info.filename.endswith("/")
                files.append({
                    "path": info.filename,
                    "size": info.file_size,
                    "compress_size": info.compress_size,
                    "is_dir": is_dir,
                    "ext": posixpath.splitext(info.filename)[1].lower(),
                })
    except Exception as exc:
        return {"kind": "archive", "error": f"تعذر فك بنية الأرشيف: {str(exc)}", "files": []}

    return {
        "kind": "archive",
        "file_count": len(files),
        "total_uncompressed": total_uncompressed,
        "files": files[:500],
    }


def _inspect_tar(path: Path) -> dict[str, Any]:
    """فحص أرشيف TAR / TAR.GZ."""
    files: list[dict[str, Any]] = []
    total_uncompressed = 0
    try:
        with tarfile.open(path, "r:*") as tar:
            for member in tar.getmembers()[:500]:
                total_uncompressed += member.size
                files.append({
                    "path": member.name,
                    "size": member.size,
                    "is_dir": member.isdir(),
                    "ext": posixpath.splitext(member.name)[1].lower(),
                })
    except Exception as exc:
        return {"kind": "archive", "error": f"تعذر فحص أرشيف TAR: {str(exc)}", "files": []}

    return {
        "kind": "archive",
        "file_count": len(files),
        "total_uncompressed": total_uncompressed,
        "files": files,
    }


def _inspect_sqlite(path: Path) -> dict[str, Any]:
    """استعراض جداول وبيانات قاعدة بيانات SQLite."""
    tables_data: list[dict[str, Any]] = []
    try:
        uri = f"file:{path.as_posix()}?mode=ro"
        with sqlite3.connect(uri, uri=True) as conn:
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
            tables = [row[0] for row in cur.fetchall()]

            for tbl in tables[:10]:
                cur.execute(f"PRAGMA table_info('{tbl}');")
                cols = [c[1] for c in cur.fetchall()]
                cur.execute(f"SELECT COUNT(*) FROM '{tbl}';")
                cnt = cur.fetchone()[0]
                cur.execute(f"SELECT * FROM '{tbl}' LIMIT 50;")
                sample_rows = cur.fetchall()
                tables_data.append({
                    "name": tbl,
                    "columns": cols,
                    "row_count": cnt,
                    "sample": [[str(v) if v is not None else "NULL" for v in r] for r in sample_rows],
                })
    except Exception as exc:
        return {"kind": "database", "error": str(exc), "tables": []}

    return {"kind": "database", "tables": tables_data}


def _inspect_pptx(path: Path) -> dict[str, Any]:
    """استخراج الشرائح والعناوين والنصوص من عروض PowerPoint (.pptx) مباشرة."""
    slides: list[dict[str, Any]] = []
    try:
        with zipfile.ZipFile(path, "r") as z:
            slide_names = sorted(
                [n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")],
                key=lambda x: int("".join(filter(str.isdigit, x)) or 0),
            )
            ns = {
                "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
                "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
            }

            for idx, s_name in enumerate(slide_names[:50]):  # حد أقصى 50 شريحة
                tree = ET.fromstring(z.read(s_name))
                paragraphs: list[str] = []
                for p in tree.findall(".//a:p", ns):
                    t_parts = [t.text for t in p.findall(".//a:t", ns) if t.text]
                    p_text = "".join(t_parts).strip()
                    if p_text:
                        paragraphs.append(p_text)

                slide_title = paragraphs[0] if paragraphs else f"الشريحة {idx + 1}"
                body_points = paragraphs[1:] if len(paragraphs) > 1 else []
                slides.append({
                    "slide_number": idx + 1,
                    "title": slide_title,
                    "content": body_points,
                    "all_text": paragraphs,
                })
    except Exception as exc:
        slides = [{
            "slide_number": 1,
            "title": "خطأ",
            "content": [f"تعذر استخراج شرائح العرض: {str(exc)}"],
            "all_text": [],
        }]

    return {"kind": "slides", "slide_count": len(slides), "slides": slides}


def _inspect_binary(path: Path) -> dict[str, Any]:
    """فحص الملفات الثنائية والتنفيذية مع استخراج الترويسة ومصفوفة Hex Dump."""
    try:
        head = path.read_bytes()[:256]
        hex_dump = []
        ascii_dump = []
        for i in range(0, len(head), 16):
            chunk = head[i : i + 16]
            hex_str = " ".join(f"{b:02X}" for b in chunk)
            ascii_str = "".join(chr(b) if 32 <= b <= 126 else "." for b in chunk)
            hex_dump.append(hex_str)
            ascii_dump.append(ascii_str)
        return {
            "kind": "binary",
            "bytes_examined": len(head),
            "hex_dump": hex_dump,
            "ascii_dump": ascii_dump,
        }
    except Exception:
        return {"kind": "binary", "hex_dump": [], "ascii_dump": []}


def inspect_file(path: Path, filename: str, ext: str, mime: str) -> dict[str, Any]:
    """الموجه الرئيسي لمعاينة وقراءة الملفات بصيغتها الأصلية من داخل الخزينة."""
    e = ext.lower()

    # 1. PDF
    if e == ".pdf":
        return {"kind": "pdf"}

    # 2. مستندات Word
    if e in (".docx", ".dotx"):
        return _inspect_docx(path)

    # 2.5 عروض PowerPoint
    if e in (".pptx", ".potx", ".ppsx"):
        return _inspect_pptx(path)

    # 3. جداول Excel
    if e in (".xlsx", ".xlsm", ".xltx"):
        return _inspect_xlsx(path)

    # 4. جداول CSV و TSV
    if e in (".csv", ".tsv"):
        return _inspect_csv(path)

    # 5. الأرشيف المضغوط
    if e in (".zip", ".edupkg", ".jar", ".apk"):
        return _inspect_zip(path)
    if e in (".tar", ".gz", ".tgz", ".bz2", ".xz"):
        return _inspect_tar(path)

    # 6. قواعد بيانات SQLite
    if e in (".sqlite", ".sqlite3", ".db"):
        return _inspect_sqlite(path)

    # 7. وسائط (فيديو / صوت)
    if e in (".mp4", ".webm", ".mkv", ".mov", ".avi"):
        return {"kind": "media", "media_type": "video"}
    if e in (".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"):
        return {"kind": "media", "media_type": "audio"}

    # 8. صور
    if e in (".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".ico"):
        return {"kind": "image"}

    # 9. كود برمجي ونصوص ومستندات ماركداون
    code_exts = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".html": "html",
        ".htm": "html",
        ".css": "css",
        ".json": "json",
        ".xml": "xml",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".sql": "sql",
        ".sh": "bash",
        ".bash": "bash",
        ".ps1": "powershell",
        ".bat": "batch",
        ".cmd": "batch",
        ".c": "c",
        ".cpp": "cpp",
        ".h": "c",
        ".hpp": "cpp",
        ".java": "java",
        ".rs": "rust",
        ".go": "go",
        ".php": "php",
        ".rb": "ruby",
        ".md": "markdown",
        ".markdown": "markdown",
        ".txt": "text",
        ".rtf": "text",
        ".env": "text",
        ".log": "text",
        ".ini": "ini",
        ".conf": "ini",
    }
    if e in code_exts or mime.startswith("text/") or mime in ("application/json", "application/xml", "application/javascript"):
        lang = code_exts.get(e, "text")
        content = _safe_read_text(path)
        return {
            "kind": "code",
            "language": lang,
            "content": content,
            "line_count": len(content.splitlines()),
        }

    # 10. ثنائيات وبرمجيات أخرى
    return _inspect_binary(path)
