"""خدمة الذكاء الاصطناعي — توليد الأسئلة، التلخيص، وشرح المفاهيم.

تدعم العمل محلياً (قواعد واستخراج نصوص ذكية) أو عبر API خارجي عند ضبط المفتاح.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import settings


def _clean_text(text: str) -> str:
    # إزالة وسوم HTML البسيطة والرموز الزائدة
    cleaned = re.sub(r"<[^>]+>", " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _extract_sentences(text: str) -> list[str]:
    # تقسيم النص إلى جمل حسب علامات الترقيم العربية والإنجليزية
    raw_sentences = re.split(r"[.\n\r!؟?؛;]+", text)
    sentences = [s.strip() for s in raw_sentences if len(s.strip()) > 15]
    return sentences


def generate_local_quiz(text: str, count: int = 3) -> list[dict[str, Any]]:
    """توليد أسئلة تفاعلية متنوعة من النص محلياً."""
    cleaned = _clean_text(text)
    sentences = _extract_sentences(cleaned)

    quizzes: list[dict[str, Any]] = []

    if not sentences:
        # احتياط إذا كان النص قصيراً جداً
        return [
            {
                "type": "quiz",
                "questionType": "multiple_choice",
                "question": "ما هي الفكرة الأساسية الواردة في هذا المقطع؟",
                "choices": ["الفكرة الأولى المذكورة في الشرح", "فكرة ثانوية غير مطروحة", "نقيض ما ورد في الدرس"],
                "answerIndex": 0,
                "explanation": "الإجابة مستخلصة مباشرة من أول فقرة في الدرس.",
            }
        ]

    # 1. سؤال اختيار من متعدد مبني على جملة رئيسية
    first_sent = sentences[0]
    words = [w for w in re.findall(r"\b[\w-]+\b", first_sent) if len(w) > 3]
    key_concept = words[0] if words else "المفهوم"

    quizzes.append({
        "type": "quiz",
        "questionType": "multiple_choice",
        "question": f"وفقاً للدرس، أي من العبارات الآتية تصف بدقة: {key_concept}؟",
        "choices": [
            first_sent,
            f"لا يرتبط {key_concept} بموضوع الدرس الحالي إطلاقاً.",
            f"يُعتبر {key_concept} مفهوماً ملغى تاريخياً وغير مستخدم.",
        ],
        "answerIndex": 0,
        "explanation": f"تمت الإشارة إلى ذلك صراحة في قول الكاتب: «{first_sent}».",
    })

    # 2. سؤال صح أو خطأ
    if len(sentences) > 1:
        second_sent = sentences[1]
        quizzes.append({
            "type": "quiz",
            "questionType": "true_false",
            "question": f"صح أم خطأ: «{second_sent}»؟",
            "choices": ["صح", "خطأ"],
            "answerIndex": 0,
            "explanation": "العبارة صحيحة تماماً ومطابقة لما ورد في نص المحتوى.",
        })

    # 3. سؤال قصير / إجابة نموذجية
    if len(sentences) > 2:
        third_sent = sentences[2]
        quizzes.append({
            "type": "quiz",
            "questionType": "short_answer",
            "question": "اشرح باختصار كيف يؤثر هذا المفهوم على التطبيق العملي؟",
            "choices": [],
            "answerIndex": 0,
            "explanation": f"الإجابة النموذجية: تتلخص في أن «{third_sent}».",
        })

    return quizzes[:count]


def generate_local_summary(text: str) -> dict[str, Any]:
    """توليد تلخيص ونقاط رئيسية من نص الدرس."""
    cleaned = _clean_text(text)
    sentences = _extract_sentences(cleaned)

    key_points = sentences[:4] if sentences else ["هذا الدرس يقدم مقدمة تمهيدية للمفاهيم الأساسية."]
    summary_paragraph = " ".join(key_points[:2])

    return {
        "summary": summary_paragraph,
        "key_points": key_points,
    }


def explain_local_concept(text: str, query: str = "") -> dict[str, Any]:
    """توضيح مفهوم للطلاب."""
    cleaned = _clean_text(text)
    sentences = _extract_sentences(cleaned)

    context = " ".join(sentences[:3]) if sentences else cleaned
    return {
        "explanation": f"بناءً على محتوى الدرس: {context} \n\nالمقصد الأساسي هو توضيح كيفية تطبيق هذه القواعد خطوة بخطوة في بيئة العمل.",
        "tips": [
            "راجع الأمثلة العملية الواردة في الدرس.",
            "قم بحل الأسئلة التفاعلية في نهاية الصفحة للتأكد من ثبات المعلومة.",
        ],
    }


async def run_ai_action(
    action: str,
    text: str,
    lesson_title: str | None = None,
) -> tuple[dict[str, Any], str]:
    """تنفيذ عملية الذكاء الاصطناعي مع التبديل التلقائي بين المحلي وGemini."""
    source = "local"

    # إن توفر مفتاح Gemini API نقوم بالاستعلام، وإلا نستخدم المنطق المحلي المدمج
    if settings.gemini_api_key:
        try:
            import httpx

            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.gemini_api_key}"
            prompt = ""
            if action == "generate_quiz":
                prompt = (
                    f"أنت خبير تربوي. قم بتوليد 3 أسئلة تفاعلية باللغة العربية بناءً على النص التالي من درس '{lesson_title or 'درس'}':\n"
                    f"{text}\n\n"
                    "أرجع النتيجة بصيغة JSON فقط كمصفوفة من الكائنات تحتوي على: "
                    "type='quiz', questionType ('multiple_choice' أو 'true_false' أو 'short_answer'), question, choices (قائمة خيارات), answerIndex (رقم الخيار الصحيح 0-based), explanation (شرح الإجابة)."
                )
            elif action == "summarize":
                prompt = (
                    f"قم بتلخيص نص الدرس التالي إلى فقرة موجزة و 3-5 نقاط رئيسية باللغة العربية:\n{text}\n"
                    "أرجع النتيجة بصيغة JSON فقط: {'summary': '...', 'key_points': ['...', '...']}"
                )
            else:
                prompt = f"اشرح المفهوم التالي بلغة بسيطة ومباشرة للطالب بناءً على الدرس:\n{text}"

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    url,
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.4},
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    raw_content = data["candidates"][0]["content"]["parts"][0]["text"]
                    # تنظيف كود markdown إن وجد
                    cleaned_json = re.sub(r"^```(?:json)?|```$", "", raw_content.strip(), flags=re.MULTILINE).strip()
                    parsed = json.loads(cleaned_json)
                    return {"result": parsed}, "gemini"
        except Exception:
            # الرجوع للوضع المحلي عند حدوث أي خطأ في الشبكة أو التحليل
            pass

    # التنفيذ المحلي
    if action == "generate_quiz":
        result = {"quizzes": generate_local_quiz(text)}
    elif action == "summarize":
        result = generate_local_summary(text)
    else:
        result = explain_local_concept(text)

    return result, source
