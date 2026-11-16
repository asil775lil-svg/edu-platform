"""مخططات الطلبات والردود."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


# --------------------------------------------------------------------------- #
# الحسابات
# --------------------------------------------------------------------------- #
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    role: Literal["teacher", "student"] = "teacher"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    public_key: str | None = None

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# المواد
# --------------------------------------------------------------------------- #
class CourseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    draft: dict[str, Any] | None = None
    expected_updated_at: datetime | None = None


class CourseOut(BaseModel):
    id: str
    title: str
    description: str
    owner_id: str
    published_version_id: str | None
    unit_count: int = 0
    lesson_count: int = 0
    updated_at: datetime


class CourseDetail(CourseOut):
    draft: dict[str, Any]


class VersionOut(BaseModel):
    id: str
    seq: int
    created_at: datetime
    counts: dict[str, int] = {}


# --------------------------------------------------------------------------- #
# المكتبة
# --------------------------------------------------------------------------- #
class EnrollIn(BaseModel):
    course_id: str


class ProgressIn(BaseModel):
    status: Literal["not_started", "in_progress", "completed"] = "in_progress"
    position: int = 0


class NoteIn(BaseModel):
    lesson_id: str
    body: str = Field(min_length=1, max_length=10000)
    anchor: dict[str, Any] = {}


class NoteOut(BaseModel):
    id: str
    lesson_id: str
    body: str
    anchor: dict[str, Any]
    updated_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# الحزم
# --------------------------------------------------------------------------- #
class ExportIn(BaseModel):
    course_id: str
    protection: Literal["open", "read-only", "invite-code"] = "open"
    invite_code: str | None = Field(default=None, min_length=4, max_length=64)
    include_media: bool = True


class JobOut(BaseModel):
    id: str
    kind: str
    status: str
    meta: dict[str, Any] = {}
    error: str | None = None
    download_url: str | None = None
    created_at: datetime


class ImportCommitIn(BaseModel):
    invite_code: str | None = None
    title: str | None = None


# --------------------------------------------------------------------------- #
# الأصول
# --------------------------------------------------------------------------- #
class AssetOut(BaseModel):
    id: str
    sha256: str
    ext: str
    mime: str
    size: int
    url: str
    deduplicated: bool = False
