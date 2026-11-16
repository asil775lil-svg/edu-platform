# منظومة المنصة التعليمية الذكية

منصة يبني فيها المعلّم منهجاً كاملاً ويصدّره **حاويةً مستقلة موقّعة** (`.edupkg`)،
ويستوردها الطالب ليدرسها مع تتبّع التقدّم والملاحظات — بواجهة عربية RTL أولاً.

- **الخطة:** [`docs/PLAN.md`](docs/PLAN.md)
- **مواصفة الحزمة:** [`docs/SPEC-edupkg-v1.md`](docs/SPEC-edupkg-v1.md)

## الحالة الحالية (MVP)

| المكوّن | الحالة |
|---|---|
| مكتبة `.edupkg` (بناء/توقيع/تشفير/تحقق) | ✅ 14 اختباراً |
| خادم FastAPI (مصادقة، مواد، وسائط، حزم، حقيبة) | ✅ 6 اختبارات مسار كامل |
| واجهة React RTL (استوديو، محرر، حقيبة، قارئ) | ✅ typecheck + build |
| تصدير/استيراد حزمة عبر الواجهة | ✅ مُتحقَّق يدوياً في المتصفح |
| صقل RTL للنصوص المختلطة (عربي + كود + روابط) | ✅ عزل اتجاهي لكل فقرة وكود |
| اختبار E2E آلي في متصفح حقيقي (Playwright) | ✅ ناجح |
| أوفلاين، AI، مستودع عام، مدفوعات | ⏳ v1.0 (خارج MVP) |

## البنية

| المسار | الوصف |
|---|---|
| `apps/api` | خادم FastAPI: المصادقة، المواد، الوسائط، الحزم، الحقيبة |
| `apps/web` | واجهة React 19 + Vite + TipTap (RTL) |
| `packages/pkg` | مكتبة Python: بناء/التحقق من `.edupkg` |
| `scripts/dev.ps1` | تشغيل الخادم والواجهة معاً |
| `docs` | الخطة والمواصفة |

> `packages/pkg-ts` و`packages/shared` و`infra` مخطَّطة لـ v1.0، غير موجودة بعد.

## التشغيل السريع

```powershell
# 1) الخادم (مرة واحدة)
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e "..\..\packages\pkg" -e ".[dev]"

# 2) الواجهة (مرة واحدة)
cd ..\web
npm install

# 3) التشغيل معاً من جذر المشروع
cd ..\..
.\scripts\dev.ps1
```

- الواجهة: <http://localhost:5173>
- الـ API: <http://127.0.0.1:8010/api> — التوثيق التفاعلي: `/docs`

إن كان المنفذ مشغولاً: `.\scripts\dev.ps1 -ApiPort 8020`،
والواجهة تقرأ العنوان من `apps/web/.env.local` (`VITE_API_TARGET`).

## الاختبارات

```powershell
# مكتبة الحزم
cd packages\pkg
.\.venv\Scripts\python.exe -m pytest -q

# الخادم (مسار كامل: تسجيل ← نشر ← تصدير ← استيراد ← دراسة)
cd apps\api
$env:PYTHONIOENCODING="utf-8"
.\.venv\Scripts\python.exe -m pytest -q

# الواجهة
cd apps\web
npm run typecheck
npm run build

# E2E في متصفح حقيقي (Playwright) — يشغّل خادم اختبار معزول على 8021 تلقائياً
npm run test:e2e        # أول مرة فقط: npx playwright install chromium
```

> إن تعذّر تنزيل متصفح Playwright، استخدم متصفحاً مثبّتاً:
> `$env:E2E_BROWSER_CHANNEL="chrome"` (أو `msedge`) ثم أعد تشغيل الأمر.

اختبار E2E يغطي المسار الكامل: تسجيل معلّم ← بناء درس (نص مختلط + كود + صورة +
سؤال) ← حفظ تلقائي ← نشر ← تصدير حزمة موقّعة ← استيرادها في حساب طالب ←
دراسة وإكمال الدرس وإضافة ملاحظة، مع التحقق من اتجاه النص المختلط (`RTL`/`LTR`).

## المبادئ

1. **لا اختراع تشفير** — Ed25519 + AES-256-GCM + Argon2id عبر مكتبات مثبتة.
2. **الشجرة مخزّنة كـ JSON واحد** (`courses.draft` للتحرير، `course_versions.snapshot` ثابت عند النشر).
3. **الوسائط معنونة بـ SHA-256** → منع تكرار مجاني وحزم صغيرة.
4. **أي حزمة غير موثوقة تُعامَل كبيانات خطرة** — حدود فك ضغط، رفض المسارات الخارجية، تحقق بصمات وتوقيع.
5. **الحماية ردع لا DRM** — ثلاث درجات: `open` / `read-only` / `invite-code`.

## ملاحظات أمنية قبل الإنتاج

- ضع `EDU_SECRET_KEY` طويلاً وعشوائياً (بذور مفاتيح Ed25519 مشتقّة منه).
- فعّل `EDU_COOKIE_SECURE=true` خلف HTTPS.
- الجلسات كوكيز `HttpOnly` + `SameSite=Lax`؛ أضف رمز CSRF عند إتاحة أصول متقاطعة.
- انتقل إلى Postgres وR2 بتغيير `EDU_DATABASE_URL` وتنفيذ واجهة `Storage` — دون تعديل منطق التطبيق.
