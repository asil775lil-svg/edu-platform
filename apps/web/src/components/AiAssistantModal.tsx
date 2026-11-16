/**
 * نافذة مساعد الذكاء الاصطناعي — للمعلم (توليد أسئلة/تلخيص) وللطالب (شرح واستفسار).
 */
import { useState } from "react";
import { api } from "../lib/api";
import type { AiResult, Block } from "../lib/types";
import { Modal } from "./Modal";

interface Props {
  mode: "teacher" | "student";
  lessonTitle: string;
  lessonContentText: string;
  onClose: () => void;
  onApplyBlocks?: (blocks: Block[]) => void;
}

export function AiAssistantModal({
  mode,
  lessonTitle,
  lessonContentText,
  onClose,
  onApplyBlocks,
}: Props) {
  const [action, setAction] = useState<"generate_quiz" | "summarize" | "explain">(
    mode === "teacher" ? "generate_quiz" : "explain"
  );
  const [inputText, setInputText] = useState(lessonContentText || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);

  async function handleRun() {
    if (!inputText.trim()) {
      setError("يرجى كتابة أو توفير نص من الدرس للتحليل.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.ai.generate({
        action,
        text: inputText.trim(),
        lesson_title: lessonTitle,
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشلت معالجة الطلب بالذكاء الاصطناعي");
    } finally {
      setBusy(false);
    }
  }

  function applyQuizToLesson() {
    if (!result?.result.quizzes || !onApplyBlocks) return;
    const newBlocks: Block[] = result.result.quizzes.map((q, idx) => ({
      id: `blk_ai_${Date.now()}_${idx}`,
      type: "quiz",
      question: q.question,
      choices: q.choices,
      answerIndex: q.answerIndex,
    }));
    onApplyBlocks(newBlocks);
    onClose();
  }

  function applySummaryToLesson() {
    if (!result?.result.summary || !onApplyBlocks) return;
    const summaryBlock: Block = {
      id: `blk_ai_sum_${Date.now()}`,
      type: "callout",
      calloutTitle: "ملخص الدرس والوجبات الأساسية",
      calloutVariant: "tip",
      text: `${result.result.summary}\n\n• ${result.result.key_points?.join("\n• ") || ""}`,
    };
    onApplyBlocks([summaryBlock]);
    onClose();
  }

  return (
    <Modal title="✨ المساعد الذكي" onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ gap: "0.4rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.4rem" }}>
          {mode === "teacher" ? (
            <>
              <button
                type="button"
                className={`btn btn-sm ${action === "generate_quiz" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setAction("generate_quiz");
                  setResult(null);
                }}
              >
                ❓ توليد أسئلة واختبارات
              </button>
              <button
                type="button"
                className={`btn btn-sm ${action === "summarize" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setAction("summarize");
                  setResult(null);
                }}
              >
                📝 تلخيص الدرس
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`btn btn-sm ${action === "explain" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setAction("explain");
                setResult(null);
              }}
            >
              💡 تبسيط وشرح الدرس
            </button>
          )}
        </div>

        <div>
          <label className="label">نص الدرس المراد تحليله</label>
          <textarea
            className="input"
            rows={5}
            dir="auto"
            placeholder="انسخ أو اكتب محتوى الدرس هنا..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={handleRun} disabled={busy || !inputText.trim()}>
            {busy ? <span className="spinner" /> : null}
            {busy ? "جارٍ المعالجة الذكية…" : "✨ بدء التوليد"}
          </button>
        </div>

        {/* عرض النتائج */}
        {result && (
          <div className="card card-flat stack" style={{ marginTop: "1rem", border: "1px solid var(--primary)" }}>
            <div className="between">
              <span style={{ fontWeight: 600 }}>النتيجة المولدة:</span>
              <span className="small muted">
                {result.source === "gemini" ? "Google Gemini ✓" : "تحليل ذكي مدمج ✓"}
              </span>
            </div>

            {/* نتيجة الاختبارات */}
            {result.result.quizzes && (
              <div className="stack" style={{ gap: "0.6rem" }}>
                {result.result.quizzes.map((q, i) => (
                  <div key={i} className="card card-flat" style={{ background: "var(--card-2)" }}>
                    <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
                      {i + 1}. {q.question}
                    </div>
                    <ul style={{ margin: "0 1.2rem", padding: 0 }}>
                      {q.choices.map((c, ci) => (
                        <li
                          key={ci}
                          style={{
                            color: ci === q.answerIndex ? "var(--green)" : "inherit",
                            fontWeight: ci === q.answerIndex ? 600 : 400,
                          }}
                        >
                          {c} {ci === q.answerIndex ? "✓ (الإجابة الصحيحة)" : ""}
                        </li>
                      ))}
                    </ul>
                    {q.explanation && (
                      <div className="small muted" style={{ marginTop: "0.4rem" }}>
                        الشرح: {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
                {onApplyBlocks && (
                  <button className="btn btn-primary btn-sm" onClick={applyQuizToLesson}>
                    ➕ إضافة هذه الأسئلة إلى الدرس مباشرة
                  </button>
                )}
              </div>
            )}

            {/* نتيجة التلخيص */}
            {result.result.summary && (
              <div className="stack">
                <p style={{ lineHeight: 1.6, margin: 0 }}>{result.result.summary}</p>
                {result.result.key_points && result.result.key_points.length > 0 && (
                  <ul style={{ margin: "0.5rem 1.2rem 0", padding: 0 }}>
                    {result.result.key_points.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                )}
                {onApplyBlocks && (
                  <button className="btn btn-primary btn-sm" onClick={applySummaryToLesson}>
                    ➕ إضافة هذا الملخص إلى الدرس مباشرة
                  </button>
                )}
              </div>
            )}

            {/* نتيجة الشرح للطالب */}
            {result.result.explanation && (
              <div className="stack">
                <p style={{ lineHeight: 1.7, margin: 0 }}>{result.result.explanation}</p>
                {result.result.tips && result.result.tips.length > 0 && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <strong>نصائح للمذاكرة:</strong>
                    <ul>
                      {result.result.tips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
