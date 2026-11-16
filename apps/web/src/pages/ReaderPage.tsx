import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ProseView } from "../components/ProseView";
import { ApiError, api } from "../lib/api";
import type { Block, LibraryCourse, Lesson } from "../lib/types";
import { useAssetUrl } from "../lib/useAssets";

export default function ReaderPage() {
  const { courseId = "" } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<LibraryCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  async function load() {
    try {
      const data = await api.library.get(courseId);
      setCourse(data);
      setActiveId((current) => current ?? data.snapshot.units[0]?.lessons[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل المادة");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const lessons = useMemo<Lesson[]>(() => {
    if (!course) return [];
    return course.snapshot.units.flatMap((unit) => unit.lessons);
  }, [course]);

  const active = lessons.find((lesson) => lesson.id === activeId) ?? null;
  const progressMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of course?.progress ?? []) map.set(row.lesson_id, row.status);
    return map;
  }, [course]);

  const completedCount = lessons.filter(
    (lesson) => progressMap.get(lesson.id) === "completed",
  ).length;
  const percent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;

  async function markCompleted() {
    if (!active) return;
    await api.library.setProgress(courseId, active.id, "completed", 100);
    await load();
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !noteText.trim()) return;
    await api.library.notes.add(courseId, active.id, noteText.trim());
    setNoteText("");
    await load();
  }

  if (!course) {
    return (
      <main className="page">
        {error ? (
          <div className="alert alert-error">
            {error} — <Link to="/library">العودة للحقيبة</Link>
          </div>
        ) : (
          <div className="empty">جارٍ التحميل…</div>
        )}
      </main>
    );
  }

  const unitOfActive = course.snapshot.units.find((unit) =>
    unit.lessons.some((lesson) => lesson.id === activeId),
  );
  const notes = (course.notes ?? []).filter((note) => note.lesson_id === activeId);

  return (
    <main className="page">
      <div className="between" style={{ marginBottom: "1.1rem", flexWrap: "wrap" }}>
        <div className="row">
          <Link className="btn btn-sm" to="/library">
            →
          </Link>
          <div>
            <h1 className="page-title" style={{ fontSize: "1.25rem", marginBottom: 0 }}>
              {course.title}
            </h1>
            <span className="small muted">
              {completedCount} / {lessons.length} درس مكتمل
            </span>
          </div>
        </div>
        <div style={{ minWidth: 200 }}>
          <div className="progressbar">
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="small muted" style={{ textAlign: "left" }}>
            {percent}%
          </div>
        </div>
      </div>

      <div className="reader-grid">
        <aside className="card card-flat">
          <strong style={{ fontSize: "0.95rem" }}>محتوى المادة</strong>
          <div className="tree" style={{ marginTop: "0.6rem" }}>
            {course.snapshot.units.map((unit) => (
              <div className="tree-unit" key={unit.id}>
                <div className="tree-unit-head">{unit.title}</div>
                {unit.lessons.map((lesson) => {
                  const done = progressMap.get(lesson.id) === "completed";
                  return (
                    <button
                      key={lesson.id}
                      className={`tree-lesson ${activeId === lesson.id ? "active" : ""} ${
                        done ? "done" : ""
                      }`}
                      onClick={() => setActiveId(lesson.id)}
                    >
                      <span>{lesson.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <section className="card">
          {!active ? (
            <div className="empty">لا يوجد درس محدد.</div>
          ) : (
            <>
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="small muted">{unitOfActive?.title}</div>
                  <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.35rem" }}>{active.title}</h2>
                </div>
                {progressMap.get(active.id) === "completed" ? (
                  <span className="badge badge-green">✓ مكتمل</span>
                ) : (
                  <button className="btn btn-green btn-sm" onClick={markCompleted}>
                    إكمال الدرس
                  </button>
                )}
              </div>

              <div className="reader-body" style={{ marginTop: "1rem" }}>
                {active.blocks.length === 0 && (
                  <p className="muted">هذا الدرس لا يحتوي على محتوى بعد.</p>
                )}
                {active.blocks.map((block) => (
                  <ReadBlock key={block.id} block={block} />
                ))}
              </div>

              <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                <h3 style={{ fontSize: "1rem", marginTop: 0 }}>📝 ملاحظاتي على هذا الدرس</h3>
                <form onSubmit={addNote} className="row" style={{ marginBottom: "0.6rem" }}>
                  <input
                    className="input"
                    placeholder="أضف ملاحظة…"
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                  />
                  <button className="btn btn-sm" disabled={!noteText.trim()}>
                    إضافة
                  </button>
                </form>
                {notes.length === 0 ? (
                  <p className="small muted">لا ملاحظات بعد.</p>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="between" style={{ padding: "0.4rem 0" }}>
                      <span className="small" dir="auto">
                        {note.body}
                      </span>
                      <button
                        className="icon-btn"
                        title="حذف"
                        onClick={async () => {
                          await api.library.notes.remove(courseId, note.id);
                          await load();
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function ReadBlock({ block }: { block: Block }) {
  if (block.type === "heading") {
    return (
      <h2 dir="auto">{block.text}</h2>
    );
  }
  if (block.type === "text") {
    return <ProseView doc={block.doc} />;
  }
  if (block.type === "image" || block.type === "video" || block.type === "audio") {
    return <ReadMedia block={block} />;
  }
  if (block.type === "callout") {
    return <ReadCallout block={block} />;
  }
  if (block.type === "quiz") {
    return <ReadQuiz block={block} />;
  }
  return null;
}

function ReadMedia({ block }: { block: Block }) {
  const url = useAssetUrl(block.assetSha256);
  if (!url) return null;
  return (
    <figure style={{ margin: "0.8rem 0" }}>
      {block.type === "image" && <img src={url} alt={block.alt ?? ""} />}
      {block.type === "video" && <video src={url} controls />}
      {block.type === "audio" && <audio src={url} controls style={{ width: "100%" }} />}
      {(block.caption || block.alt) && (
        <figcaption className="small muted">{block.caption || block.alt}</figcaption>
      )}
    </figure>
  );
}

function ReadCallout({ block }: { block: Block }) {
  const variant = block.calloutVariant ?? "tip";
  const badges: Record<string, { label: string; cls: string; icon: string }> = {
    info: { label: "معلومة", cls: "badge-blue", icon: "ℹ️" },
    tip: { label: "تلميح", cls: "badge-green", icon: "💡" },
    warning: { label: "تنبيه", cls: "badge-amber", icon: "⚠️" },
    danger: { label: "تحذير هام", cls: "badge-red", icon: "🛑" },
  };
  const info = badges[variant] ?? badges.tip;

  return (
    <div className={`card card-flat callout-box callout-${variant}`} style={{ margin: "1rem 0" }}>
      <div className="row" style={{ gap: "0.5rem", marginBottom: "0.4rem" }}>
        <span>{info.icon}</span>
        <span className={`badge ${info.cls}`}>{info.label}</span>
        {block.calloutTitle && (
          <strong style={{ fontSize: "0.95rem" }} dir="auto">
            {block.calloutTitle}
          </strong>
        )}
      </div>
      <p style={{ margin: 0, whiteSpace: "pre-line", lineHeight: 1.65 }} dir="auto">
        {block.text}
      </p>
    </div>
  );
}

function ReadQuiz({ block }: { block: Block }) {
  const [picked, setPicked] = useState<number | null>(null);
  const choices = block.choices ?? [];

  return (
    <div className="card card-flat" style={{ margin: "1rem 0" }}>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <span className="badge badge-amber">سؤال</span>
      </div>
      <p style={{ fontWeight: 700, marginTop: 0 }} dir="auto">
        {block.question}
      </p>
      <div className="stack" style={{ gap: "0.4rem" }}>
        {choices.map((choice, index) => {
          const isPicked = picked === index;
          const isCorrect = index === (block.answerIndex ?? 0);
          const showState = picked !== null && (isPicked || isCorrect);
          return (
            <button
              key={index}
              className="btn"
              style={{
                justifyContent: "flex-start",
                borderColor: showState
                  ? isCorrect
                    ? "var(--green)"
                    : "var(--danger)"
                  : undefined,
                background: showState
                  ? isCorrect
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(239,68,68,0.1)"
                  : undefined,
                opacity: picked !== null && !isPicked && !isCorrect ? 0.55 : 1,
              }}
              onClick={() => setPicked(index)}
              disabled={picked !== null}
              dir="auto"
            >
              {choice}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p
          className="small"
          style={{ marginBottom: 0, color: picked === (block.answerIndex ?? 0) ? "#6ee7b7" : "#fca5a5" }}
        >
          {picked === (block.answerIndex ?? 0)
            ? "✓ إجابة صحيحة"
            : "✗ إجابة غير صحيحة — الخيار الصحيح مظلّل بالأخضر."}
        </p>
      )}
    </div>
  );
}
