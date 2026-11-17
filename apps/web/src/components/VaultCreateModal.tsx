import { useState } from "react";
import { Modal } from "./Modal";
import type { Vault } from "../lib/types";

const ICONS = ["🗄️", "📦", "📁", "🔐", "📚", "💾", "🌐", "🧪", "🎨", "💻", "⚙️", "📑", "📊", "🎯"];

interface Props {
  vault?: Vault | null;
  onClose: () => void;
  onSave: (data: { name: string; description: string; icon: string }) => Promise<void>;
}

export function VaultCreateModal({ vault, onClose, onSave }: Props) {
  const [name, setName] = useState(vault?.name || "");
  const [description, setDescription] = useState(vault?.description || "");
  const [icon, setIcon] = useState(vault?.icon || "🗄️");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("يرجى كتابة اسم للخزينة");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), description: description.trim(), icon });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الخزينة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={vault ? "تعديل بيانات الخزينة" : "إنشاء خزينة جديدة"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <div className="alert alert-danger">{error}</div>}

        <div>
          <label className="label">رمز الخزينة (الأيقونة)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.3rem" }}>
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                className="btn btn-sm"
                style={{
                  fontSize: "1.2rem",
                  padding: "0.3rem 0.5rem",
                  borderColor: icon === ic ? "var(--primary)" : undefined,
                  background: icon === ic ? "var(--primary-soft)" : undefined,
                }}
                onClick={() => setIcon(ic)}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">اسم الخزينة *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: خزينة المراجع الخارجية، أرشيف الاختبارات، كود وتطبيقات..."
            required
            autoFocus
          />
        </div>

        <div>
          <label className="label">وصف الخزينة (اختياري)</label>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مستودع لحفظ الملفات والمشاريع المستوردة..."
          />
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? <span className="spinner" /> : vault ? "حفظ التعديلات" : "إنشاء الخزينة"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
