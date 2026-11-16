import { useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { defaultBlock, moveBlock } from "../lib/draft";
import type { Block, BlockType, CalloutVariant, Lesson } from "../lib/types";
import { useAssetUrl } from "../lib/useAssets";
import { AiAssistantModal } from "./AiAssistantModal";
import { RichText } from "./RichText";

export function BlockEditor({
  lesson,
  onChange,
}: {
  lesson: Lesson;
  onChange: (next: Lesson) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingType = useRef<BlockType>("image");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  const patch = (blockId: string, changes: Partial<Block>) =>
    onChange({
      ...lesson,
      blocks: lesson.blocks.map((block) =>
        block.id === blockId ? { ...block, ...changes } : block,
      ),
    });


  const remove = (blockId: string) =>
    onChange({ ...lesson, blocks: lesson.blocks.filter((block) => block.id !== blockId) });

  function add(type: BlockType) {
    if (type === "image" || type === "video" || type === "audio") {
      pendingType.current = type;
      fileInput.current?.click();
      return;
    }
    onChange({ ...lesson, blocks: [...lesson.blocks, defaultBlock(type)] });
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const asset = await api.assets.upload(file);
      onChange({
        ...lesson,
        blocks: [
          ...lesson.blocks,
          { ...defaultBlock(pendingType.current), assetSha256: asset.sha256 },
        ],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل رفع الملف");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/*,video/*,audio/*,.pdf"
        onChange={onFile}
      />

      {error && <div className="alert alert-error">{error}</div>}
      {uploading && (
        <div className="alert alert-info">
          <span className="spinner" style={{ marginInlineEnd: "0.5rem" }} /> جارٍ رفع الوسيط…
        </div>
      )}

      <div className="block-list">
        {lesson.blocks.length === 0 && (
          <div className="empty">الدرس فارغ — أضف أول كتلة من الأسفل.</div>
        )}

        {lesson.blocks.map((block, index) => (
          <div className="block" key={block.id}>
            <div className="block-tools">
              <button
                className="icon-btn"
                title="أعلى"
                onClick={() => onChange(moveBlock(lesson, block.id, -1))}
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                title="أسفل"
                onClick={() => onChange(moveBlock(lesson, block.id, 1))}
                disabled={index === lesson.blocks.length - 1}
              >
                ↓
              </button>
              <button className="icon-btn" title="حذف" onClick={() => remove(block.id)}>
                ✕
              </button>
            </div>

            {block.type === "heading" && (
              <input
                className="input"
                style={{ fontWeight: 800, fontSize: "1.1rem" }}
                value={block.text ?? ""}
                onChange={(event) => patch(block.id, { text: event.target.value })}
                placeholder="عنوان فرعي"
              />
            )}

            {block.type === "text" && (
              <RichText
                value={block.doc}
                resetKey={block.id}
                onChange={(doc) => patch(block.id, { doc })}
              />
            )}

            {(block.type === "image" ||
              block.type === "video" ||
              block.type === "audio") && (
              <MediaBlock
                block={block}
                onCaption={(caption) => patch(block.id, { caption })}
                onAlt={(alt) => patch(block.id, { alt })}
              />
            )}

            {block.type === "quiz" && (
              <QuizBlock
                block={block}
                onChange={(changes) => patch(block.id, changes)}
              />
            )}

            {block.type === "callout" && (
              <CalloutBlock
                block={block}
                onChange={(changes) => patch(block.id, changes)}
              />
            )}

            {block.type === "code" && (
              <CodeBlock
                block={block}
                onChange={(changes) => patch(block.id, changes)}
              />
            )}

            {block.type === "math" && (
              <MathBlock
                block={block}
                onChange={(changes) => patch(block.id, changes)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="add-block" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
        <button className="btn btn-sm" onClick={() => add("text")}>
          + نص
        </button>
        <button className="btn btn-sm" onClick={() => add("heading")}>
          + عنوان
        </button>
        <button className="btn btn-sm" onClick={() => add("callout")}>
          + تنبيه
        </button>
        <button className="btn btn-sm" onClick={() => add("code")}>
          + كود 💻
        </button>
        <button className="btn btn-sm" onClick={() => add("math")}>
          + معادلة ∑
        </button>
        <button className="btn btn-sm" onClick={() => add("image")}>
          + صورة
        </button>
        <button className="btn btn-sm" onClick={() => add("video")}>
          + فيديو
        </button>
        <button className="btn btn-sm" onClick={() => add("audio")}>
          + صوت
        </button>
        <button className="btn btn-sm" onClick={() => add("quiz")}>
          + سؤال
        </button>
        <button
          className="btn btn-sm btn-ghost"
          style={{
            border: "1px dashed var(--primary)",
            color: "var(--primary)",
            marginInlineStart: "auto",
          }}
          onClick={() => setShowAiModal(true)}
          title="توليد أسئلة أو تلخيص محتوى الدرس آلياً بالذكاء الاصطناعي"
        >
          ✨ مساعد الذكاء الاصطناعي
        </button>
      </div>

      {showAiModal && (
        <AiAssistantModal
          mode="teacher"
          lessonTitle={lesson.title}
          lessonContentText={
            lesson.blocks
              .map((b) => b.text || b.code || b.latex || "")
              .filter(Boolean)
              .join("\n\n") || lesson.title
          }
          onClose={() => setShowAiModal(false)}
          onApplyBlocks={(newBlocks) => {
            onChange({ ...lesson, blocks: [...lesson.blocks, ...newBlocks] });
          }}
        />
      )}
    </div>
  );

}

function MediaBlock({
  block,
  onCaption,
  onAlt,
}: {
  block: Block;
  onCaption: (value: string) => void;
  onAlt: (value: string) => void;
}) {
  const url = useAssetUrl(block.assetSha256);

  if (!block.assetSha256 || !url) {
    return <div className="alert">وسيط غير متاح أو قيد التحميل…</div>;
  }

  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      {block.type === "image" && <img src={url} alt={block.alt ?? ""} />}
      {block.type === "video" && <video src={url} controls style={{ maxWidth: "100%" }} />}
      {block.type === "audio" && <audio src={url} controls style={{ width: "100%" }} />}
      {block.type === "image" ? (
        <input
          className="input"
          placeholder="وصف الصورة (alt)"
          value={block.alt ?? ""}
          onChange={(event) => onAlt(event.target.value)}
        />
      ) : (
        <input
          className="input"
          placeholder="تعليق على الوسيط"
          value={block.caption ?? ""}
          onChange={(event) => onCaption(event.target.value)}
        />
      )}
    </div>
  );
}

function QuizBlock({
  block,
  onChange,
}: {
  block: Block;
  onChange: (changes: Partial<Block>) => void;
}) {
  const choices = block.choices ?? [];

  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      <span className="badge badge-amber">سؤال تفاعلي</span>
      <textarea
        className="textarea"
        style={{ minHeight: 56 }}
        value={block.question ?? ""}
        onChange={(event) => onChange({ question: event.target.value })}
        placeholder="نص السؤال"
      />
      {choices.map((choice, index) => (
        <div className="row" key={index}>
          <input
            type="radio"
            checked={(block.answerIndex ?? 0) === index}
            onChange={() => onChange({ answerIndex: index })}
            title="الإجابة الصحيحة"
          />
          <input
            className="input"
            value={choice}
            onChange={(event) => {
              const next = [...choices];
              next[index] = event.target.value;
              onChange({ choices: next });
            }}
          />
          <button
            className="icon-btn"
            title="حذف الخيار"
            onClick={() => {
              const next = choices.filter((_, i) => i !== index);
              onChange({
                choices: next,
                answerIndex: Math.min(block.answerIndex ?? 0, Math.max(next.length - 1, 0)),
              });
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn btn-sm"
        onClick={() => onChange({ choices: [...choices, `الخيار ${choices.length + 1}`] })}
      >
        + خيار
      </button>
    </div>
  );
}

function CalloutBlock({
  block,
  onChange,
}: {
  block: Block;
  onChange: (changes: Partial<Block>) => void;
}) {
  const variant = block.calloutVariant ?? "tip";
  const badges: Record<CalloutVariant, { label: string; cls: string }> = {
    info: { label: "معلومة", cls: "badge-blue" },
    tip: { label: "تلميح", cls: "badge-green" },
    warning: { label: "تنبيه", cls: "badge-amber" },
    danger: { label: "تحذير هام", cls: "badge-red" },
  };

  return (
    <div className={`card card-flat callout-box callout-${variant}`} style={{ gap: "0.5rem" }}>
      <div className="between" style={{ flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.3rem" }}>
        <div className="row" style={{ gap: "0.4rem" }}>
          <select
            className="input input-sm"
            style={{ width: "auto" }}
            value={variant}
            onChange={(e) => onChange({ calloutVariant: e.target.value as CalloutVariant })}
          >
            <option value="tip">💡 تلميح</option>
            <option value="info">ℹ️ معلومة</option>
            <option value="warning">⚠️ تنبيه</option>
            <option value="danger">🛑 تحذير</option>
          </select>
          <span className={`badge ${badges[variant]?.cls ?? "badge-green"}`}>
            {badges[variant]?.label}
          </span>
        </div>
        <input
          className="input input-sm"
          style={{ fontWeight: 700, flex: 1, minWidth: 160 }}
          placeholder="عنوان التنبيه"
          value={block.calloutTitle ?? ""}
          onChange={(e) => onChange({ calloutTitle: e.target.value })}
        />
      </div>
      <textarea
        className="textarea"
        style={{ minHeight: 60 }}
        placeholder="نص التنبيه أو الملاحظة…"
        value={block.text ?? ""}
        onChange={(e) => onChange({ text: e.target.value })}
        dir="auto"
      />
    </div>
  );
}

function CodeBlock({
  block,
  onChange,
}: {
  block: Block;
  onChange: (changes: Partial<Block>) => void;
}) {
  const languages = [
    { value: "python", label: "Python" },
    { value: "javascript", label: "JavaScript" },
    { value: "typescript", label: "TypeScript" },
    { value: "html", label: "HTML" },
    { value: "css", label: "CSS" },
    { value: "sql", label: "SQL" },
    { value: "cpp", label: "C++" },
    { value: "bash", label: "Bash / Shell" },
    { value: "json", label: "JSON" },
  ];

  return (
    <div className="card card-flat stack" style={{ gap: "0.5rem", borderInlineStart: "3px solid #3b82f6" }}>
      <div className="between" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
        <div className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>💻 كتلة برمجية</span>
          <select
            className="input input-sm"
            style={{ width: "auto" }}
            value={block.language ?? "python"}
            onChange={(e) => onChange({ language: e.target.value })}
          >
            {languages.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <textarea
        className="textarea input-ltr"
        style={{
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: "0.88rem",
          minHeight: 120,
          background: "#0d1117",
          color: "#e6edf3",
          direction: "ltr",
        }}
        dir="ltr"
        placeholder="// اكتب الكود هنا..."
        value={block.code ?? ""}
        onChange={(e) => onChange({ code: e.target.value })}
      />
    </div>
  );
}

function MathBlock({
  block,
  onChange,
}: {
  block: Block;
  onChange: (changes: Partial<Block>) => void;
}) {
  const shortcuts = [
    { label: "كお客 (كسر)", snippet: "\\frac{a}{b}" },
    { label: "√ جذر", snippet: "\\sqrt{x}" },
    { label: "x² أُس", snippet: "x^{2}" },
    { label: "∫ تكامل", snippet: "\\int_{a}^{b} f(x) \\, dx" },
    { label: "∑ مجموع", snippet: "\\sum_{i=1}^{n} x_i" },
    { label: "π باي", snippet: "\\pi" },
    { label: "∞ ما لا نهاية", snippet: "\\infty" },
    { label: "≠ لا يساوي", snippet: "\\neq" },
    { label: "± زائد/ناقص", snippet: "\\pm" },
  ];

  function insertSnippet(snip: string) {
    const cur = block.latex ?? "";
    onChange({ latex: cur ? `${cur} ${snip}` : snip });
  }

  return (
    <div className="card card-flat stack" style={{ gap: "0.5rem", borderInlineStart: "3px solid #8b5cf6" }}>
      <div className="between">
        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>∑ معادلة رياضية (LaTeX)</span>
        <label className="row" style={{ gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={block.displayMode ?? true}
            onChange={(e) => onChange({ displayMode: e.target.checked })}
          />
          عرض ممركز كسطر منفصل (Display Mode)
        </label>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem" }}>
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ fontSize: "0.75rem", padding: "2px 6px" }}
            onClick={() => insertSnippet(s.snippet)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <textarea
        className="textarea input-ltr"
        style={{
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: "0.9rem",
          minHeight: 70,
          direction: "ltr",
        }}
        dir="ltr"
        placeholder="مثال: f(x) = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
        value={block.latex ?? ""}
        onChange={(e) => onChange({ latex: e.target.value })}
      />

      {block.latex && (
        <div
          style={{
            background: "var(--card-2)",
            padding: "0.8rem",
            borderRadius: "var(--radius)",
            textAlign: block.displayMode ? "center" : "left",
            direction: "ltr",
            fontSize: "1.2rem",
            fontFamily: "KaTeX_Main, Times New Roman, serif",
            overflowX: "auto",
          }}
        >
          {block.latex}
        </div>
      )}
    </div>
  );
}

