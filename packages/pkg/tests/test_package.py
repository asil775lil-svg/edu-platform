"""اختبارات مكتبة الحزم — تغطي الحتمية، التوقيع، التشفير، والأمان."""

from __future__ import annotations

import io
import json
import zipfile

import pytest

from edupkg import (
    FormatError,
    IntegrityError,
    InvalidInviteCode,
    MediaFile,
    SecurityError,
    UnsupportedVersion,
    build_package,
    canonical_json,
    generate_keypair,
    inspect_package,
    is_encrypted,
)

SAMPLE_COURSE = {
    "id": "course_1",
    "title": "الرياضيات — الصف الثالث",
    "language": "ar",
    "versionSeq": 1,
    "units": [
        {
            "id": "unit_1",
            "title": "الأعداد",
            "order": 0,
            "lessons": [
                {
                    "id": "les_1",
                    "title": "مقدمة",
                    "order": 0,
                    "blocks": [
                        {"id": "b1", "type": "heading", "level": 2, "text": "مرحباً"},
                        {"id": "b2", "type": "text", "doc": {"type": "doc", "content": []}},
                    ],
                }
            ],
        }
    ],
}


def _build(**kwargs):
    keys = generate_keypair()
    author = {"id": "teacher_1", "name": "أ. محمد"}
    params = {"course": SAMPLE_COURSE, "author": author, "private_key": keys.private_key}
    params.update(kwargs)
    return keys, build_package(**params)


# --------------------------------------------------------------------------- #
# الحتمية والتوقيع
# --------------------------------------------------------------------------- #
def test_canonical_json_is_stable():
    a = canonical_json({"b": 1, "a": [2, 3], "c": "عربي"})
    b = canonical_json({"c": "عربي", "a": [2, 3], "b": 1})
    assert a == b
    assert "عربي".encode() in a


def test_build_is_deterministic():
    keys = generate_keypair()
    kwargs = {
        "course": SAMPLE_COURSE,
        "author": {"id": "t1", "name": "أ. محمد", "publicKey": keys.public_key_b64},
        "private_key": keys.private_key,
        "package_id": "fixed-id",
    }
    first = build_package(**kwargs).data
    second = build_package(**kwargs).data
    assert first == second


def test_roundtrip_signed_package():
    keys, built = _build()
    info = inspect_package(built.data, require_signature=True)
    assert info.verified and info.signed
    assert info.title == SAMPLE_COURSE["title"]
    assert info.manifest["author"]["publicKey"] == keys.public_key_b64
    assert info.manifest["counts"]["lessons"] == 1
    assert info.warnings == []


def test_unsigned_package_is_flagged():
    built = build_package(course=SAMPLE_COURSE, author={"name": "x"})
    info = inspect_package(built.data)
    assert info.signed is False
    assert any(w.startswith("unsigned") for w in info.warnings)


def test_tampered_course_is_rejected():
    _keys, built = _build()
    inner = built.data
    with zipfile.ZipFile(io.BytesIO(inner)) as source:
        entries = {name: source.read(name) for name in source.namelist()}

    tampered = dict(entries)
    tampered["course.json"] = canonical_json({**SAMPLE_COURSE, "title": "منهج مزوّر"})

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in entries:  # نفس الترتيب
            if name == "mimetype":
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_STORED
                archive.writestr(info, tampered[name])
            else:
                archive.writestr(name, tampered[name])

    with pytest.raises(IntegrityError):
        inspect_package(buffer.getvalue())


def test_tampered_media_is_rejected_when_loaded():
    video = MediaFile(name="intro.mp4", data=b"\x00" * 2048)
    built = build_package(course=SAMPLE_COURSE, author={"name": "x"}, media=[video])
    with zipfile.ZipFile(io.BytesIO(built.data)) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
        order = archive.namelist()

    entries[video.package_name] = b"\xff" * 2048
    entries["checksums.json"] = canonical_json(
        {
            "alg": "sha256",
            "files": {
                name: __import__("hashlib").sha256(data).hexdigest()
                for name, data in entries.items()
                if name in {"course.json", "assessments.json"} or name.startswith("media/")
            },
        }
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in order:
            if name == "mimetype":
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_STORED
                archive.writestr(info, entries[name])
            else:
                archive.writestr(name, entries[name])

    # البصمات أُعيد حسابها، لكن اسم الوسيط ما زال بصمة المحتوى الأصلي ⇒ رفض
    with pytest.raises(IntegrityError):
        inspect_package(buffer.getvalue(), load_media=True)


def test_media_is_content_addressed_and_deduplicated():
    payload = b"video-bytes" * 100
    media = [MediaFile(name="a.mp4", data=payload), MediaFile(name="b.mp4", data=payload)]
    built = build_package(course=SAMPLE_COURSE, author={"name": "x"}, media=media)
    info = inspect_package(built.data, load_media=True)
    assert len(info.media) == 1, "الوسائط المتطابقة يجب أن تُخزَّن مرة واحدة"
    assert info.media[0].data == payload
    assert info.media[0].name == f"media/{info.media[0].sha256}.mp4"


# --------------------------------------------------------------------------- #
# التشفير
# --------------------------------------------------------------------------- #
def test_invite_code_package_requires_code():
    built = build_package(
        course=SAMPLE_COURSE,
        author={"name": "x"},
        protection="invite-code",
        invite_code="ABCD-1234",
    )
    assert is_encrypted(built.data)
    with pytest.raises(InvalidInviteCode):
        inspect_package(built.data, invite_code="WRONG")
    info = inspect_package(built.data, invite_code="ABCD-1234")
    assert info.protection == "invite-code"
    assert info.title == SAMPLE_COURSE["title"]


def test_encrypted_package_does_not_leak_content():
    built = build_package(
        course=SAMPLE_COURSE,
        author={"name": "x"},
        protection="invite-code",
        invite_code="SECRET",
    )
    # العنوان يُعرض عمداً في الترويسة العامة، لكن المحتوى نفسه لا يظهر
    assert b"course.json" not in built.data
    assert b"unit_1" not in built.data
    assert b"units" not in built.data
    assert b"assessments" not in built.data


def test_wrong_protection_is_rejected():
    with pytest.raises(FormatError):
        build_package(course=SAMPLE_COURSE, author={"name": "x"}, protection="weird")


# --------------------------------------------------------------------------- #
# الأمان
# --------------------------------------------------------------------------- #
def _write_zip(entries: list[tuple[str, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries:
            if name == "mimetype":
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_STORED
                archive.writestr(info, data)
            else:
                archive.writestr(name, data)
    return buffer.getvalue()


def test_path_traversal_is_rejected():
    payload = _write_zip(
        [
            ("mimetype", b"application/vnd.edupkg+zip"),
            ("manifest.json", b"{}"),
            ("course.json", b"{}"),
            ("assessments.json", b"{}"),
            ("checksums.json", b"{}"),
            ("../../evil.sh", b"boom"),
        ]
    )
    with pytest.raises(SecurityError):
        inspect_package(payload)


def test_unknown_extension_is_rejected():
    payload = _write_zip(
        [
            ("mimetype", b"application/vnd.edupkg+zip"),
            ("manifest.json", b"{}"),
            ("course.json", b"{}"),
            ("assessments.json", b"{}"),
            ("checksums.json", b"{}"),
            ("media/abc.exe", b"MZ"),
        ]
    )
    with pytest.raises(SecurityError):
        inspect_package(payload)


def test_bad_magic_is_rejected():
    with pytest.raises(FormatError):
        inspect_package(b"not a package at all")


def test_future_format_version_is_rejected():
    _keys, built = _build()
    with zipfile.ZipFile(io.BytesIO(built.data)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    manifest["formatVersion"] = 99
    entries = []
    with zipfile.ZipFile(io.BytesIO(built.data)) as archive:
        for name in archive.namelist():
            data = archive.read(name)
            entries.append((name, canonical_json(manifest) if name == "manifest.json" else data))
    with pytest.raises(UnsupportedVersion):
        inspect_package(_write_zip(entries))


def test_export_standalone_html():
    from edupkg import export_standalone_html

    html = export_standalone_html(SAMPLE_COURSE, {"testsha": b"\x89PNG\r\n\x1a\n" + b"\x00" * 32})
    assert "<!DOCTYPE html>" in html
    assert "الرياضيات — الصف الثالث" in html
    assert "data:image/png;base64," in html
    assert "الأعداد" in html

