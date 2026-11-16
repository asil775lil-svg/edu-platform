import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BlockEditor } from "../components/BlockEditor";
import { ExportDialog } from "../components/ExportDialog";
import { LessonTree } from "../components/LessonTree";
import { ApiError, api } from "../lib/api";
import { findLesson, updateLesson } from "../lib/draft";
import type { CourseDetail, CourseDraft } from "../lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function CourseEditorPage() {
  const { courseId = "" } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const firstRun = useRef(true);

  async function load() {
    try {
      const data = await api.courses.get(courseId);
      setCourse(data);
      setDraft(data.draft);
      setActiveId((current) => current ?? data.draft.units[0]?.lessons[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المادة");
    }
  }

  useEffect(() => {
    firstRun.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (!draft) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const updated = await api.courses.update(courseId, {
          title: draft.title,
          description: draft.description,
          draft,
          expected_updated_at: course?.updated_at,
        });
        setCourse(updated);
        setSaveState("saved");
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError(
            "تنبيه: تم تعديل المادة من جلسة أو تبويب آخر. أعد تحميل الصفحة لتفادي الكتابة فوق التعديلات.",
          );
        }
        setSaveState("error");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, courseId]);

  const activeLesson = useMemo(
    () => (draft && activeId ? findLesson(draft, activeId) : null),
    [draft, activeId],
  );

  async function publish() {
    if (!draft || draft.units.length === 0) {
      setError("أضف وحدة واحدة على الأقل قبل النشر");
      return;
    }
    setPublishing(true);
    setError(null);
    setNotice(null);
    try {
      const version = await api.courses.publish(courseId);
      setNotice(`تم نشر الإصدار رقم ${version.seq} بنجاح.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل النشر");
    } finally {
      setPublishing(false);
    }
  }

  if (!draft) {
    return (
      <main className="page">
        {error ? <div className="alert alert-error">{error}</div> : <div className="empty">جارٍ التحميل…</div>}
      </main>
    );
  }

  return (
    <main className="page">
      <div className="between" style={{ marginBottom: "1rem", flexWrap: "wrap", gap: "0.6rem" }}>
        <div className="row" style={{ flex: 1, minWidth: 260 }}>
          <Link className="btn btn-sm" to="/studio">
            →
          </Link>
          <input
            className="input"
            style={{ fontSize: "1.15rem", fontWeight: 800, background: "transparent" }}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            aria-label="اسم المادة"
          />
        </div>

        <div className="row">
          <span className="small muted">
            {saveState === "saving" && "جارٍ الحفظ…"}
            {saveState === "saved" && "✓ محفوظ"}
            {saveState === "error" && "⚠ فشل الحفظ"}
          </span>
          <span className={`badge ${course?.published_version_id ? "badge-green" : ""}`}>
            {course?.published_version_id ? "منشورة" : "مسودة"}
          </span>
          <button className="btn" onClick={publish} disabled={publishing}>
            {publishing && <span className="spinner" />}
            نشر إصدار
          </button>
          <button className="btn btn-primary" onClick={() => setExportOpen(true)}>
            تصدير
          </button>
          <button
            className="btn btn-ghost btn-danger"
            onClick={async () => {
              if (!confirm("حذف المادة نهائياً؟")) return;
              await api.courses.remove(courseId);
              navigate("/studio");
            }}
          >
            🗑
          </button>
        </div>
      </div>

      {notice && <div className="alert alert-success" style={{ marginBottom: "1rem" }}>{notice}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

      <div className="editor-grid">
        <LessonTree
          draft={draft}
          activeId={activeId}
          onSelect={setActiveId}
          onChange={setDraft}
        />

        <section className="card">
          {activeLesson ? (
            <>
              <input
                className="input"
                style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "0.4rem" }}
                value={activeLesson.title}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((current) =>
                    current
                      ? updateLesson(current, activeLesson.id, (lesson) => ({
                          ...lesson,
                          title: value,
                        }))
                      : current,
                  );
                }}
                aria-label="اسم الدرس"
              />
              <p className="small muted" style={{ marginTop: 0 }}>
                {activeLesson.blocks.length} كتلة · يُحفظ تلقائياً
              </p>

              <BlockEditor
                lesson={activeLesson}
                onChange={(next) =>
                  setDraft((current) =>
                    current
                      ? updateLesson(current, activeLesson.id, () => next)
                      : current,
                  )
                }
              />
            </>
          ) : (
            <div className="empty">
              اختر درساً من الشجرة أو أنشئ درساً جديداً للبدء في الكتابة.
            </div>
          )}
        </section>
      </div>

      {exportOpen && <ExportDialog courseId={courseId} onClose={() => setExportOpen(false)} />}
    </main>
  );
}
