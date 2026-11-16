import { useState } from "react";
import { ApiError, api, waitForJob } from "../lib/api";
import type { PackageJob } from "../lib/types";
import { Modal } from "./Modal";

type Protection = "open" | "read-only" | "invite-code";

export function ExportDialog({
  courseId,
  onClose,
}: {
  courseId: string;
  onClose: () => void;
}) {
  const [protection, setProtection] = useState<Protection>("open");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [job, setJob] = useState<PackageJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    setStage("جارٍ بناء الحزمة وتوقيعها…");
    try {
      const created = await api.packages.export({
        course_id: courseId,
        protection,
        invite_code: protection === "invite-code" ? code : undefined,
      });
      const finished = await waitForJob(created.id);
      setJob(finished);
      if (finished.status === "failed") setError(finished.error || "فشل التصدير");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل التصدير");
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  const meta = (job?.meta || {}) as {
    filename?: string;
    size?: number;
    sha256?: string;
    counts?: Record<string, number>;
    signed?: boolean;
    missingMedia?: string[];
  };

  return (
    <Modal title="تصدير الحزمة (.edupkg)" onClose={onClose}>
      {!job ? (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            تُصدَّر النسخة المنشورة إن وُجدت، وإلا المسودة الحالية. الحزمة موقّعة بمفتاح حسابك.
          </p>

          <div>
            <label className="label" htmlFor="protection">
              درجة الحماية
            </label>
            <select
              id="protection"
              className="select"
              value={protection}
              onChange={(event) => setProtection(event.target.value as Protection)}
            >
              <option value="open">مفتوح — يُسمح بالتعديل مع حفظ اسم المؤلف</option>
              <option value="read-only">للقراءة فقط — يُستورد للمذاكرة دون تعديل</option>
              <option value="invite-code">محمي برمز دعوة — تشفير AES-256-GCM</option>
            </select>
          </div>

          {protection === "invite-code" && (
            <div>
              <label className="label" htmlFor="code">
                رمز الدعوة
              </label>
              <input
                id="code"
                className="input input-ltr"
                dir="ltr"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="مثال: MATH-2026"
                minLength={4}
              />
              <p className="small muted" style={{ marginBottom: 0 }}>
                لن يُخزَّن الرمز عندنا. المشتري يحتاجه لفك الحزمة.
              </p>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <div className="row" style={{ gap: "0.6rem" }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={start}
              disabled={busy || (protection === "invite-code" && code.trim().length < 4)}
            >
              {busy && <span className="spinner" />}
              {busy ? stage : "تصدير حزمة .edupkg"}
            </button>
            <a
              className="btn"
              href={`/api/courses/${courseId}/export-html`}
              download
              title="تصدير كصفحة ويب مستقلة تعمل بدون إنترنت وبدون تثبيت برامج"
            >
              🌐 تصدير HTML أوفلاين
            </a>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="alert alert-success">
            ✓ تم بناء الحزمة وتوقيعها بنجاح.
          </div>
          <div className="card card-flat" style={{ fontSize: "0.9rem" }}>
            <div className="between">
              <span className="muted">الملف</span>
              <span className="bidi-ltr" dir="ltr">
                {meta.filename}
              </span>
            </div>
            <div className="between">
              <span className="muted">الحجم</span>
              <span>{((meta.size ?? 0) / 1024).toFixed(1)} KB</span>
            </div>
            <div className="between">
              <span className="muted">المحتوى</span>
              <span>
                {meta.counts?.units ?? 0} وحدات · {meta.counts?.lessons ?? 0} دروس ·{" "}
                {meta.counts?.media ?? 0} وسائط
              </span>
            </div>
            <div className="between">
              <span className="muted">التوقيع</span>
              <span>{meta.signed ? "Ed25519 ✓" : "بدون توقيع"}</span>
            </div>
            <div style={{ marginTop: "0.4rem" }}>
              <div className="muted small">بصمة SHA-256</div>
              <code
                dir="ltr"
                className="bidi-ltr"
                style={{ wordBreak: "break-all", fontSize: "0.72rem" }}
              >
                {meta.sha256}
              </code>
            </div>
          </div>

          {meta.missingMedia && meta.missingMedia.length > 0 && (
            <div className="alert alert-error">
              تحذير: {meta.missingMedia.length} وسائط مفقودة من التخزين ولم تُضمَّن.
            </div>
          )}

          <div className="row">
            <a
              className="btn btn-primary"
              href={`/api/packages/${job.id}/download`}
              download
            >
              ⬇ تنزيل الحزمة
            </a>
            <button className="btn btn-ghost" onClick={onClose}>
              إغلاق
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
