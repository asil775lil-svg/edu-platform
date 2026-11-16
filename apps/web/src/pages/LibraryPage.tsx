import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CatalogItem, LibraryItem, PackageJob } from "../lib/types";

export default function LibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"my_courses" | "explore">("my_courses");

  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<PackageJob | null>(null);
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const [myItems, allCourses] = await Promise.all([
        api.library.list(),
        api.library.catalog(),
      ]);
      setItems(myItems);
      setCatalog(allCourses);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الحقيبة");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleEnroll(courseId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.library.enroll(courseId);
      navigate(`/library/${courseId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل الانضمام للمادة");
      setBusy(false);
    }
  }

  async function handleFork(courseId: string) {
    setBusy(true);
    setError(null);
    try {
      const forked = await api.courses.fork(courseId);
      navigate(`/studio/${forked.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل نسخ المادة إلى الاستوديو");
      setBusy(false);
    }
  }


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
      <div className="between" style={{ marginBottom: "1.3rem", flexWrap: "wrap", gap: "0.8rem" }}>
        <div>
          <h1 className="page-title">الحقيبة الدراسية</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            تصفح موادك المشترك بها، أو انضم لمواد المعلمين المنشورة على المنصة.
          </p>
        </div>
        <div className="row">
          <input ref={fileInput} type="file" accept=".edupkg,.zip" hidden onChange={onPick} />
          <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" /> : "⬆"} استيراد حزمة من معلّم
          </button>
        </div>
      </div>

      <div className="nav" style={{ marginBottom: "1.4rem", width: "fit-content" }}>
        <button
          type="button"
          className={`btn btn-sm btn-ghost ${tab === "my_courses" ? "btn-primary" : ""}`}
          onClick={() => setTab("my_courses")}
        >
          🎒 موادي المشترك بها ({items?.length ?? 0})
        </button>
        <button
          type="button"
          className={`btn btn-sm btn-ghost ${tab === "explore" ? "btn-primary" : ""}`}
          onClick={() => setTab("explore")}
        >
          🌐 استكشاف المواد المنشورة ({catalog?.length ?? 0})
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {tab === "my_courses" && (
        <>
          {items === null ? (
            <div className="empty">جارٍ التحميل…</div>
          ) : items.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>🎒</div>
              حقيبتك فارغة حالياً.
              <div style={{ marginTop: "0.6rem" }}>
                <button className="btn btn-sm btn-primary" onClick={() => setTab("explore")}>
                  استكشف المواد المنشورة الآن
                </button>
              </div>
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
        </>
      )}

      {tab === "explore" && (
        <>
          {catalog === null ? (
            <div className="empty">جارٍ تحميل دليل المواد…</div>
          ) : catalog.length === 0 ? (
            <div className="empty">لا توجد مواد منشورة حتى الآن على المنصة.</div>
          ) : (
            <div className="course-grid">
              {catalog.map((item) => (
                <article className="card course-card" key={item.course_id}>
                  <div className="between">
                    <span className="badge badge-green">منشورة ✓</span>
                    <span className="small muted">بواسطة: {item.teacher_name}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="muted small" style={{ margin: 0, flex: 1 }}>
                    {item.description || "بدون وصف"}
                  </p>
                  <div className="course-meta" style={{ marginTop: "0.8rem" }}>
                    <span>📚 {item.total_lessons} درس</span>
                  </div>
                  <div className="row" style={{ gap: "0.4rem" }}>
                    {item.is_enrolled ? (
                      <Link
                        className="btn btn-sm"
                        style={{
                          flex: 1,
                          textAlign: "center",
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#6ee7b7",
                          borderColor: "rgba(16, 185, 129, 0.35)",
                        }}
                        to={`/library/${item.course_id}`}
                      >
                        ✓ مشترك — دراسة
                      </Link>
                    ) : (
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ flex: 1 }}
                        onClick={() => handleEnroll(item.course_id)}
                        disabled={busy}
                      >
                        + انضمام ودراسة
                      </button>
                    )}
                    {user?.role === "teacher" && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleFork(item.course_id)}
                        disabled={busy}
                        title="نسخ هذا المنهج إلى الاستوديو وتعديله وتخصيصه لطلابك (Fork)"
                      >
                        🍴 نسخ للمنهج
                      </button>
                    )}
                  </div>
                </article>

              ))}
            </div>
          )}
        </>
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
