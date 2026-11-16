"""مسارات الذكاء الاصطناعي: توليد أسئلة، تلخيص، وشرح."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas import AiGenerateIn, AiGenerateOut
from app.services.ai import run_ai_action

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/generate", response_model=AiGenerateOut)
async def generate_ai(
    payload: AiGenerateIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
):
    result, source = await run_ai_action(
        action=payload.action,
        text=payload.text,
        lesson_title=payload.lesson_title,
    )
    return AiGenerateOut(
        action=payload.action,
        result=result,
        source=source,
    )
