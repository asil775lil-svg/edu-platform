import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../lib/api";
import type { LibraryItem, PackageJob } from "../lib/types";

export default function LibraryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<PackageJob | null>(null);
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setItems(await api.library.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الحقيبة");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const created = await api.packages.import(file);
      setJob(created);
      const meta = created.meta as { needsCode?: boolean };
      if (meta.needsCode) setCodeOpen(true);
      else await finishImport(created.id, undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل استيراد الحزمة");
    } finally {
      setBusy(false);
    }
  }

  async function finishImport(jobId: string, inviteCode: string | undefined) {
    setBusy(true);
    try {
      const result = await api.packages.commit(jobId, { invite_code: inviteCode });
      await api.library.enroll(result.course_id);
      setCodeOpen(false);
      navigate(`/library/${result.course_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر فك الحزمة");
    } finally {
      setBusy(false);
    }
  }

  const meta = (job?.meta || {}) as {
    needsCode?: boolean;
    header?: { title?: string; authorName?: string };
    preview?: { title?: string; counts?: Record<string, number> };
  };

  return (
    <main className="page">
      <div className="between" style={{ marginBottom: "1.3rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">حقيبتي الدراسية</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            موادك المشترك بها وتقدّمك فيها. استورد حزمة جديدة للبدء.
          </p>
        </div>
        <div className="row">
          <input ref={fileInput} type="file" accept=".edupkg,.zip" hidden onChange={onPick} />
          <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" /> : "⬆"} استيراد حزمة
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {items === null ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>🎒</div>
          حقيبتك فارغة. استورد حزمة <code>.edupkg</code> من معلّمك للبدء.
        </div>
      ) : (
        <div className="course-grid">
          {items.map((item) => {
            const percent =
              item.total_lessons === 0
                ? 0
                : Math.round((item.completed_lessons / item.total_lessons) * 100);
            return (
              <article className="card course-card" key={item.course_id}>
                <div className="between">
                  <span className={`badge ${percent === 100 ? "badge-green" : ""}`}>
                    {percent === 100 ? "مكتمل" : `${percent}%`}
                  </span>
                  {item.has_update && <span className="badge badge-amber">تحديث متاح</span>}
                </div>
                <h3>{item.title}</h3>
                <p className="muted small" style={{ margin: 0, flex: 1 }}>
                  {item.description || "بدون وصف"}
                </p>
                <div className="progressbar">
                  <span style={{ width: `${percent}%` }} />
                </div>
                <div className="course-meta">
                  <span>
                    {item.completed_lessons} / {item.total_lessons} درس
                  </span>
                </div>
                <Link className="btn btn-sm btn-primary" to={`/library/${item.course_id}`}>
                  متابعة الدراسة
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {codeOpen && job && (
        <Modal title="حزمة محمية" onClose={() => setCodeOpen(false)}>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              finishImport(job.id, code);
            }}
          >
            <div className="alert alert-info">
              <strong>{meta.header?.title || meta.preview?.title || "مادة محمية"}</strong>
              {meta.header?.authorName && (
                <div className="small muted">المؤلف: {meta.header.authorName}</div>
              )}
              <div className="small muted">
                {meta.preview?.counts
                  ? `${meta.preview.counts.units ?? 0} وحدات · ${meta.preview.counts.lessons ?? 0} دروس`
                  : "أدخل رمز الدعوة الذي حصلت عليه من المعلّم."}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="invite">
                رمز الدعوة
              </label>
              <input
                id="invite"
                className="input input-ltr"
                dir="ltr"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner" />}
              فك الحزمة وإضافتها
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}
