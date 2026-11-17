import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AiAssistantModal } from "../components/AiAssistantModal";
import { DiscussionPanel } from "../components/DiscussionPanel";
import { ProseView } from "../components/ProseView";
import { Watermark } from "../components/Watermark";
import { ApiError, api } from "../lib/api";
import type { Block, LibraryCourse, Lesson } from "../lib/types";
import { useAssetUrl } from "../lib/useAssets";

export default function ReaderPage() {
  const { courseId = "" } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<LibraryCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [activeBottomTab, setActiveBottomTab] = useState<"notes" | "discussions">("notes");
  const [showAiTutor, setShowAiTutor] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);


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
    <main className="page" style={{ position: "relative" }}>
      <Watermark enabled={watermarkEnabled} />

      <div className="between" style={{ marginBottom: "1.1rem", flexWrap: "wrap", gap: "0.8rem" }}>
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

        <div className="row" style={{ gap: "0.8rem", alignItems: "center" }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{ border: "1px solid var(--border)" }}
            onClick={() => setShowAiTutor(true)}
            title="طرح استفسارات أو طلب تبسيط لهذا الدرس من المساعد الذكي"
          >
            🤖 المساعد الذكي للدرس
          </button>

          <label
            className="row small muted"
            style={{ gap: "0.3rem", cursor: "pointer", userSelect: "none" }}
            title="علامة مائية أمنية ديناميكية باسمك وبريدك لردع التسريب"
          >
            <input
              type="checkbox"
              checked={watermarkEnabled}
              onChange={(e) => setWatermarkEnabled(e.target.checked)}
            />
            حماية المحتوى
          </label>

          <div style={{ minWidth: 150 }}>
            <div className="progressbar">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="small muted" style={{ textAlign: "left" }}>
              {percent}%
            </div>
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
                <div className="row" style={{ gap: "0.5rem", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.4rem" }}>
                  <button
                    className={`btn btn-sm ${activeBottomTab === "notes" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setActiveBottomTab("notes")}
                  >
                    📝 ملاحظاتي الخاصة ({notes.length})
                  </button>
                  <button
                    className={`btn btn-sm ${activeBottomTab === "discussions" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setActiveBottomTab("discussions")}
                  >
                    💬 أسئلة ونقاشات الدرس
                  </button>
                </div>

                {activeBottomTab === "notes" ? (
                  <div>
                    <form onSubmit={addNote} className="row" style={{ marginBottom: "0.6rem" }}>
                      <input
                        className="input"
                        placeholder="أضف ملاحظة خاصة بك…"
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
                ) : (
                  <DiscussionPanel courseId={courseId} lessonId={active.id} />
                )}
              </div>

              {showAiTutor && (
                <AiAssistantModal
                  mode="student"
                  lessonTitle={active.title}
                  lessonContentText={
                    active.blocks
                      .map((b) => b.text || b.code || b.latex || "")
                      .filter(Boolean)
                      .join("\n\n") || active.title
                  }
                  onClose={() => setShowAiTutor(false)}
                />
              )}
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
  if (block.type === "code") {
    return <ReadCode block={block} />;
  }
  if (block.type === "math") {
    return <ReadMath block={block} />;
  }
  if (block.type === "table") {
    return <ReadTable block={block} />;
  }
  return null;
}

function ReadTable({ block }: { block: Block }) {
  const headers = block.tableHeaders ?? [];
  const rows = block.tableRows ?? [];

  return (
    <div style={{ margin: "1.2rem 0", overflowX: "auto" }}>
      {block.tableCaption && (
        <div style={{ fontWeight: 600, marginBottom: "0.5rem", color: "var(--primary-light)" }} dir="auto">
          {block.tableCaption}
        </div>
      )}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        {headers.length > 0 && (
          <thead>
            <tr style={{ background: "var(--card-2)" }}>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "0.6rem 0.8rem",
                    textAlign: "center",
                    border: "1px solid var(--border)",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                  }}
                  dir="auto"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              }}
            >
              {row.map((cell, ci) => {
                const isEnglish = /^[a-zA-Z0-9\s.,!?'"()-]+$/.test(cell || "");
                return (
                  <td
                    key={ci}
                    style={{
                      padding: "0.6rem 0.8rem",
                      border: "1px solid var(--border)",
                      direction: isEnglish ? "ltr" : "rtl",
                      textAlign: isEnglish ? "left" : "right",
                      fontSize: "0.9rem",
                    }}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadCode({ block }: { block: Block }) {
  const [copied, setCopied] = useState(false);
  const code = block.code ?? "";
  const lang = block.language ?? "code";

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        margin: "1.2rem 0",
        borderRadius: "var(--radius)",
        background: "#0d1117",
        border: "1px solid #30363d",
        overflow: "hidden",
      }}
      dir="ltr"
    >
      <div
        className="between"
        style={{
          padding: "0.4rem 0.8rem",
          background: "#161b22",
          borderBottom: "1px solid #30363d",
          fontSize: "0.8rem",
          color: "#8b949e",
        }}
      >
        <span style={{ fontWeight: 600, textTransform: "uppercase" }}>{lang}</span>
        <button
          className="btn btn-sm btn-ghost"
          style={{ fontSize: "0.75rem", padding: "2px 8px", color: copied ? "var(--green)" : "#c9d1d9" }}
          onClick={copy}
        >
          {copied ? "✓ تم النسخ" : "📋 نسخ"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "1rem",
          overflowX: "auto",
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: "0.9rem",
          lineHeight: 1.6,
          color: "#e6edf3",
          direction: "ltr",
          unicodeBidi: "isolate",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ReadMath({ block }: { block: Block }) {
  const latex = block.latex ?? "";
  const isDisplay = block.displayMode ?? true;

  return (
    <div
      style={{
        margin: "1rem 0",
        padding: isDisplay ? "1rem" : "0.5rem",
        background: "var(--card-2)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        textAlign: isDisplay ? "center" : "left",
        direction: "ltr",
        unicodeBidi: "isolate",
        fontFamily: "KaTeX_Main, Times New Roman, serif",
        fontSize: isDisplay ? "1.25rem" : "1.05rem",
        overflowX: "auto",
      }}
    >
      {latex}
    </div>
  );
}


function ReadMedia({ block }: { block: Block }) {
  const url = useAssetUrl(block.assetSha256);
  if (!url) return null;
  const isPdf = url.toLowerCase().includes(".pdf");

  return (
    <figure style={{ margin: "1rem 0" }}>
      {block.type === "image" && (
        isPdf ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <div className="between" style={{ padding: "0.5rem 1rem", background: "var(--card-2)" }}>
              <span style={{ fontWeight: 600 }}>📄 مستند PDF / شرائح مرفقة</span>
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                فتح في نافذة كاملة ↗
              </a>
            </div>
            <iframe src={url} style={{ width: "100%", height: "520px", border: "none" }} title={block.caption || "مستند PDF"} />
          </div>
        ) : (
          <img src={url} alt={block.alt ?? ""} style={{ maxWidth: "100%", borderRadius: "var(--radius)" }} />
        )
      )}
      {block.type === "video" && <video src={url} controls style={{ width: "100%", borderRadius: "var(--radius)" }} />}
      {block.type === "audio" && <audio src={url} controls style={{ width: "100%" }} />}
      {(block.caption || block.alt) && (
        <figcaption className="small muted" style={{ marginTop: "0.4rem" }}>{block.caption || block.alt}</figcaption>
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
  const [studentInput, setStudentInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const choices = block.choices ?? [];
  const isShortAnswer = choices.length === 0;

  return (
    <div className="card card-flat" style={{ margin: "1rem 0", borderInlineStart: "3px solid #f59e0b" }}>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <span className="badge badge-amber">
          {isShortAnswer ? "سؤال مقالي / قصير" : choices.length === 2 && choices[0] === "صح" ? "صح أم خطأ" : "سؤال اختياري"}
        </span>
      </div>
      <p style={{ fontWeight: 700, marginTop: 0 }} dir="auto">
        {block.question}
      </p>

      {isShortAnswer ? (
        <div className="stack" style={{ gap: "0.5rem" }}>
          <textarea
            className="input"
            rows={2}
            placeholder="اكتب إجابتك هنا للتدريب الذاتي…"
            value={studentInput}
            onChange={(e) => setStudentInput(e.target.value)}
            disabled={revealed}
            dir="auto"
          />
          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={() => setRevealed(true)} disabled={revealed}>
              {revealed ? "✓ تم استعراض النموذج" : "تحقق من الإجابة النموذجية"}
            </button>
          </div>
          {revealed && (
            <div className="card card-flat" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
              <div style={{ fontWeight: 600, color: "var(--green)", marginBottom: "0.2rem" }}>الإجابة النموذجية:</div>
              <p style={{ margin: 0 }} dir="auto">{block.explanation || "راجع الشرح الوارد في الدرس للمقارنة مع إجابتك."}</p>
            </div>
          )}
        </div>
      ) : (
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

          {picked !== null && (
            <div style={{ marginTop: "0.4rem" }}>
              <p
                className="small"
                style={{
                  marginBottom: block.explanation ? "0.3rem" : 0,
                  color: picked === (block.answerIndex ?? 0) ? "#6ee7b7" : "#fca5a5",
                  fontWeight: 600,
                }}
              >
                {picked === (block.answerIndex ?? 0)
                  ? "✓ إجابة صحيحة!"
                  : "✗ إجابة غير صحيحة — الخيار الصحيح مظلّل بالأخضر."}
              </p>
              {block.explanation && (
                <div className="small muted" style={{ background: "var(--card-2)", padding: "0.4rem 0.6rem", borderRadius: 6 }} dir="auto">
                  💡 الشرح والتوضيح: {block.explanation}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

