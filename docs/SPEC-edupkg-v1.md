# مواصفة الحاوية التعليمية `.edupkg` — الإصدار 1

**الحالة:** مسودة معتمدة للتنفيذ (v1.0.0)
**MIME:** `application/vnd.edupkg+zip`
**الامتداد:** `.edupkg`

> هذه الوثيقة هي **المصدر المرجعي**. أي تغيير في الحزمة يبدأ من هنا،
> مع رفع `formatVersion` وإضافة سجل في قسم «سجل التغييرات».

---

## 1. المبادئ

1. **حتمية (Deterministic):** نفس المدخلات → نفس البايتات. بدون هذا لا يمكن
   اختبار التوافق ولا كشف التلاعب بشكل موثوق.
2. **تصريح صريح بالإصدار:** حزمة بإصدار أعلى من قدرة القارئ **تُرفض** ولا تُخمَّن.
3. **الأمان أولاً:** أي حزمة غير موثوقة تُعامَل كبيانات خطرة (ZIP bomb، path traversal، SVG/HTML خبيث).
4. **الحجم الصغير للبيانات الوصفية:** الوسائط لا تُعاد تسميتها إلا بالبصمة.

---

## 2. مستويان للتغليف

### 2.1 الطبقة الداخلية (الحمولة)

ZIP قياسي (deflate) يحتوي على المدخلات التالية:

| المدخل | إلزامي | الوصف |
|---|---|---|
| `mimetype` | نعم | أول مدخل، **غير مضغوط**، المحتوى: `application/vnd.edupkg+zip` |
| `manifest.json` | نعم | بطاقة التعريف |
| `course.json` | نعم | الشجرة الكاملة: وحدات ← دروس ← كتل |
| `assessments.json` | نعم | بنك أسئلة اختياري (قد يكون `{"items":[]}`) |
| `checksums.json` | نعم | SHA-256 لكل مدخل |
| `media/<sha256>.<ext>` | لا | الوسائط بأسماء بصمية |
| `signature.json` | لا | توقيع Ed25519 |

**ترتيب المدخلات إلزامي** (لضمان الحتمية):
`mimetype` → `manifest.json` → `course.json` → `assessments.json` →
`media/*` (مرتّبة تصاعدياً بالاسم) → `checksums.json` → `signature.json`.

### 2.2 الطبقة الخارجية

- **`protection = "open"` أو `"read-only"`:** الملف النهائي هو ZIP الداخلي كما هو.
  يبدأ بالبايتات `50 4B 03 04` (`PK\x03\x04`).
- **`protection = "invite-code"`:**
  ```
  [8 بايت]  السحر: "EDUPKG1\n"
  [4 بايت]  طول ترويسة JSON (big-endian uint32)
  [N بايت]  ترويسة JSON (غير مشفّرة، غير موقّعة)
  [الباقي]  نص AES-256-GCM للـ ZIP الداخلي كاملاً
  ```
  الترويسة:
  ```json
  {
    "formatVersion": 1,
    "packageId": "uuidv4",
    "protection": "invite-code",
    "meta": { "title": "...", "authorName": "...", "createdAt": "..." },
    "kdf": { "name": "argon2id", "salt": "b64url", "memoryKiB": 65536, "iterations": 3, "parallelism": 1 },
    "cipher": { "name": "aes-256-gcm", "nonce": "b64url12" }
  }
  ```
  المفتاح = `Argon2id(رمزم الدعوة, salt, m=64MiB, t=3, p=1, len=32)`.
  يُلحق وسم GCM (16 بايت) في نهاية النص المشفّر.

> ملاحظة: البيانات الوصفية في الترويسة **غير موثوقة**؛ تُستخدم لعرض واجهة
> «هذه الحزمة تحتاج رمز دعوة: <العنوان>» فقط. لا يُتخذ أي قرار أمني بناءً عليها.

---

## 3. `manifest.json`

```json
{
  "formatVersion": 1,
  "packageId": "7d1c...-uuid",
  "createdAt": "2026-11-15T10:00:00Z",
  "generator": "edupkg-py/1.0.0",
  "course": {
    "id": "uuid",
    "title": "الرياضيات — الصف الثالث",
    "language": "ar",
    "level": "secondary",
    "versionSeq": 3
  },
  "author": {
    "id": "uuid",
    "name": "أ. محمد",
    "publicKey": "b64url-ed25519-32B"
  },
  "protection": "open",
  "encryption": null,
  "entryPoint": "course.json",
  "counts": { "units": 3, "lessons": 10, "media": 12 },
  "uncompressedSize": 209715200,
  "license": "CC-BY-4.0"
}
```

- `protection` ∈ `open` | `read-only` | `invite-code`
- `encryption` يكون `null` في الحمولة الداخلية دائماً (التشفير خارجي).
- `author.publicKey` مطلوب إن وُجد `signature.json`.

---

## 4. `course.json`

```json
{
  "schemaVersion": 1,
  "id": "uuid",
  "title": "...",
  "description": "...",
  "units": [
    {
      "id": "uuid",
      "title": "الوحدة الأولى",
      "order": 0,
      "lessons": [
        {
          "id": "uuid",
          "title": "الدرس الأول",
          "order": 0,
          "blocks": [
            { "id": "uuid", "type": "heading", "level": 2, "text": "مقدمة" },
            { "id": "uuid", "type": "text", "doc": { "type": "doc", "content": [] } },
            { "id": "uuid", "type": "image", "assetSha256": "…", "alt": "…" },
            { "id": "uuid", "type": "video", "assetSha256": "…", "durationSec": 120 },
            { "id": "uuid", "type": "quiz", "question": "…", "choices": ["…"], "answerIndex": 1 }
          ]
        }
      ]
    }
  ]
}
```

**قواعد:**
- كل `id` فريد داخل الحزمة وثابت عبر الإصدارات (UUIDv4).
- `assetSha256` يشير إلى `media/<sha256>.<ext>` أو إلى أصل خارجي عبر `href`.
- الترتيب يُحدَّد بـ `order` تصاعدياً، وليس بترتيب المصفوفة.

---

## 5. `checksums.json`

```json
{
  "alg": "sha256",
  "files": {
    "course.json": "<hex>",
    "assessments.json": "<hex>",
    "media/<sha256>.mp4": "<hex>"
  }
}
```

- يشمل كل المدخلات **عدا**: `mimetype`، `manifest.json`، `checksums.json`، `signature.json`.
- يجب أن يطابق محتوى الأرشيف فعلياً بعد فك الضغط.

---

## 6. التوقيع

```json
{ "alg": "ed25519", "keyId": "<sha256(pubkey) base64url>", "sig": "<base64url64B>" }
```

- **الحمولة الموقّعة** = `b"edupkg-v1\n"` + بايتات `canonicalJSON({"manifest": …, "checksums": …})`.
- **Canonical JSON:** UTF-8، مفاتيح مرتّبة تصاعدياً (codepoint)، بدون مسافات،
  `ensure_ascii=false`، أرقام بصيغة JSON القصيرة.
- التحقق يشمل: التوقيع + تطابق البصمات + تطابق `packageId` بين الترويسة والـ manifest.

---

## 7. حدود الأمان (رفض إلزامي)

| الفحص | الحد |
|---|---|
| إجمالي الحجم بعد فك الضغط | ≤ 2 GiB |
| عدد المدخلات | ≤ 500 |
| نسبة الضغط الإجمالية | ≤ 100:1 |
| حجم أي مدخل واحد | ≤ 1 GiB |
| مسار يحتوي `..` أو يبدأ بـ `/` أو `\` أو `:` | رفض |
| المسارات المطلقة أو رموز محركات الأقراص | رفض |
| ملف بامتداد غير مسموح | رفض |
| محتوى SVG/HTML يحتوي `<script>`/`on*=` | تجريد أو رفض |

الامتدادات المسموحة للوسائط:
`mp4, webm, mp3, wav, m4a, pdf, png, jpg, jpeg, webp, gif, svg, epub, zip(html5-بمعزل)`.

---

## 8. سجل التغييرات

| الإصدار | التاريخ | التغيير |
|---|---|---|
| 1.0.0 | 2026-11-15 | الإصدار الأول |
