/**
 * نافذة الاستيراد الذكي: تحويل مجلد أو ملف Markdown تلقائياً إلى وحدات ودروس وكتل.
 */
import { useRef, useState } from "react";
import { api } from "../lib/api";
import type { CourseDetail } from "../lib/types";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  onImported: (course: CourseDetail) => void;
}

export function SmartImportModal({ onClose, onImported }: Props) {
  const [tab, setTab] = useState<"markdown" | "zip">("markdown");
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleMarkdownSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !markdown.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.smartImport.markdown(title.trim(), markdown.trim());
      onImported(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشل الاستيراد");
    } finally {
      setBusy(false);
    }
  }

  async function handleZipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.smartImport.zip(file);
      onImported(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشل استيراد المجلد المضغوط");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <Modal title="📥 الاستيراد الذكي للمناهج" onClose={onClose}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          أنشئ مادة كاملة تلقائياً في ثوانٍ عبر لصق نص Markdown أو رفع أرشيف ZIP لمجلداتك وملفاتك.
        </p>

        <div className="row" style={{ gap: "0.4rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.4rem" }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === "markdown" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab("markdown")}
          >
            📝 لصق نص Markdown
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === "zip" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab("zip")}
          >
            🗂 رفع ملف ZIP لمجلدات
          </button>
        </div>

        {tab === "markdown" ? (
          <form onSubmit={handleMarkdownSubmit} className="stack" style={{ gap: "0.8rem" }}>
            <div>
              <label className="label">عنوان المادة</label>
              <input
                className="input"
                dir="auto"
                required
                placeholder="مثال: مقدمة في علوم الحاسب"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <div className="between" style={{ marginBottom: "0.2rem" }}>
                <label className="label" style={{ marginBottom: 0 }}>
                  محتوى الماركداون
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost small"
                  onClick={() => {
                    setTitle("مقدمة في الذكاء الاصطناعي");
                    setMarkdown(
                      `# الوحدة الأولى: أساسيات الذكاء الاصطناعي\n## الدرس 1: ما هو الذكاء الاصطناعي؟\nالذكاء الاصطناعي هو محاكاة للذكاء البشري في الآلات.\n\n> [!tip] تلميح: تعلم المفاهيم النظرية يسهل التطبيق البرمجي.\n\n## الدرس 2: البرمجة بلغة بايثون\nنستخدم بايثون لأنها غنية بالمكتبات الرياضية.\n\n\`\`\`python\nimport math\nprint("مرحباً بالعالم!", math.pi)\n\`\`\`\n\n$$ f(x) = x^2 + 2x + 1 $$\n\n# الوحدة الثانية: تعلم الآلة\n## الدرس 1: الفرق بين التعلم الموجه وغير الموجه\nفي التعلم الموجه نزود النموذج ببيانات مع تسميات صحيحة.`
                    );
                  }}
                >
                  استخدام نموذج تجريبي
                </button>
              </div>
              <textarea
                className="input input-ltr"
                dir="ltr"
                rows={10}
                required
                placeholder={`# اسم الوحدة\n## اسم الدرس\nمحتوى الدرس...`}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
              />
              <p className="small muted" style={{ marginTop: "0.3rem", marginBottom: 0 }}>
                💡 استخدم <code>#</code> لعنوان الوحدة، و<code>##</code> لعنوان الدرس،
                و<code>```</code> للأكواد البرمجية، و<code>$$</code> للمعادلات.
              </p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !markdown.trim()}>
                {busy ? <span className="spinner" /> : null}
                {busy ? "جارٍ التحليل والإنشاء…" : "🚀 استيراد وبناء المادة"}
              </button>
            </div>
          </form>
        ) : (
          <div className="stack" style={{ gap: "1rem", textAlign: "center", padding: "1.5rem 0" }}>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".zip,application/zip"
              onChange={handleZipUpload}
            />

            <div
              style={{
                border: "2px dashed var(--border)",
                borderRadius: "var(--radius)",
                padding: "2rem 1rem",
                cursor: "pointer",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📦</div>
              <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>
                انقر لاختيار ملف ZIP يحتوي على المجلدات والدروس
              </div>
              <div className="small muted">
                يقوم النظام بتحويل كل مجلد داخل الأرشيف إلى وحدة وكل ملف نصي إلى درس تلقائياً.
              </div>
            </div>

            {busy && (
              <div className="alert alert-info">
                <span className="spinner" style={{ marginInlineEnd: "0.5rem" }} />
                جارٍ فك الضغط وتحليل هيكل الوحدات والدروس…
              </div>
            )}

            {error && <div className="alert alert-error">{error}</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
