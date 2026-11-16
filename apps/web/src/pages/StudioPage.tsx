import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../lib/api";
import type { CourseSummary, PackageJob } from "../lib/types";

export default function StudioPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const [importJob, setImportJob] = useState<PackageJob | null>(null);
  const [codeModal, setCodeModal] = useState(false);
  const [code, setCode] = useState("");
  const [importTitle, setImportTitle] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setCourses(await api.courses.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المواد");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createCourse(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api.courses.create({ title });
      navigate(`/studio/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل الإنشاء");
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const job = await api.packages.import(file);
      setImportJob(job);
      const meta = job.meta as {
        needsCode?: boolean;
        header?: { title?: string };
        preview?: { title?: string };
      };
      if (meta.needsCode) {
        setImportTitle(meta.header?.title || "حزمة محمية");
        setCodeModal(true);
      } else {
        setImportTitle(meta.preview?.title || "مادة مستوردة");
        setCodeModal(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل استيراد الحزمة");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport(event: React.FormEvent) {
    event.preventDefault();
    if (!importJob) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.packages.commit(importJob.id, {
        invite_code: code || undefined,
      });
      setCodeModal(false);
      navigate(`/studio/${result.course_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر فك الحزمة");
    } finally {
      setBusy(false);
    }
  }

  async function removeCourse(id: string) {
    if (!confirm("حذف المادة نهائياً؟")) return;
    try {
      await api.courses.remove(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل الحذف");
    }
  }

  const meta = (importJob?.meta || {}) as {
    needsCode?: boolean;
    header?: { title?: string; authorName?: string };
    preview?: { counts?: Record<string, number>; author?: string };
  };

  return (
    <main className="page">
      <div className="between" style={{ marginBottom: "1.3rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">استوديو الإنشاء</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            ابنِ منهجك، انشره إصداراً ثابتاً، ثم صدّره حاويةً موقّعة.
          </p>
        </div>
        <div className="row">
          <input
            ref={fileInput}
            type="file"
            accept=".edupkg,.zip"
            hidden
            onChange={onPickFile}
          />
          <button
            className="btn"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            ⬆ استيراد حزمة
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + مادة جديدة
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {busy && (
        <div className="alert alert-info" style={{ marginBottom: "1rem" }}>
          <span className="spinner" style={{ marginInlineEnd: "0.5rem" }} /> جارٍ التنفيذ…
        </div>
      )}

      {courses === null ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : courses.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>📚</div>
          لا توجد مواد بعد. أنشئ مادتك الأولى أو استورد حزمة <code>.edupkg</code>.
        </div>
      ) : (
        <div className="course-grid">
          {courses.map((course) => (
            <article key={course.id} className="card course-card">
              <div className="between">
                <span className={`badge ${course.published_version_id ? "badge-green" : ""}`}>
                  {course.published_version_id ? "منشورة" : "مسودة"}
                </span>
                <button
                  className="icon-btn"
                  title="حذف"
                  onClick={() => removeCourse(course.id)}
                >
                  🗑
                </button>
              </div>
              <h3>
                <Link to={`/studio/${course.id}`}>{course.title}</Link>
              </h3>
              <p className="muted small" style={{ margin: 0, flex: 1 }}>
                {course.description || "بدون وصف"}
              </p>
              <div className="course-meta">
                <span>📦 {course.unit_count} وحدات</span>
                <span>📖 {course.lesson_count} دروس</span>
              </div>
              <Link className="btn btn-sm" to={`/studio/${course.id}`}>
                تحرير
              </Link>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="مادة جديدة" onClose={() => setCreating(false)}>
          <form onSubmit={createCourse} className="stack">
            <div>
              <label className="label" htmlFor="title">
                اسم المادة
              </label>
              <input
                id="title"
                className="input"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="مثال: الرياضيات — الصف الثالث"
              />
            </div>
            <button className="btn btn-primary" disabled={busy || !title.trim()}>
              إنشاء
            </button>
          </form>
        </Modal>
      )}

      {codeModal && importJob && (
        <Modal title="استيراد حزمة" onClose={() => setCodeModal(false)}>
          <form onSubmit={commitImport} className="stack">
            <div className="alert alert-info">
              <strong>{importTitle}</strong>
              {meta.preview?.author && (
                <div className="small muted">المؤلف: {meta.preview.author}</div>
              )}
              {meta.preview?.counts && (
                <div className="small muted">
                  {meta.preview.counts.units ?? 0} وحدات · {meta.preview.counts.lessons ?? 0}{" "}
                  دروس · {meta.preview.counts.media ?? 0} وسائط
                </div>
              )}
            </div>

            {meta.needsCode ? (
              <div>
                <label className="label" htmlFor="code">
                  رمز الدعوة (الحزمة مشفّرة)
                </label>
                <input
                  id="code"
                  className="input input-ltr"
                  dir="ltr"
                  autoFocus
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                الحزمة موقّعة وسيتم التحقق من سلامتها قبل الاستيراد.
              </p>
            )}

            <button className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner" />}
              استيراد إلى حسابي
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}
