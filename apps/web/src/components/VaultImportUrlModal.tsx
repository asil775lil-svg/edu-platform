import { useState } from "react";
import { Modal } from "./Modal";
import { api, ApiError } from "../lib/api";
import type { VaultFile } from "../lib/types";

interface Props {
  vaultId: string;
  vaultName: string;
  onClose: () => void;
  onSuccess: (file: VaultFile) => void;
}

export function VaultImportUrlModal({ vaultId, vaultName, onClose, onSuccess }: Props) {
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("يرجى إدخال رابط الملف الخارجي");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const imported = await api.vaults.importUrl(vaultId, {
        url: url.trim(),
        filename: filename.trim() || undefined,
        description: description.trim() || undefined,
      });
      onSuccess(imported);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("فشل استيراد الملف من الرابط الخارجي");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`استيراد ملف من جهة خارجية إلى [${vaultName}]`} onClose={onClose}>
      <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="callout-box callout-info" style={{ fontSize: "0.88rem" }}>
          <strong>🌐 قبول جميع الصيغ والامتدادات:</strong>
          <p style={{ margin: "0.2rem 0 0" }}>
            تقبل الخزينة استيراد وحفظ كافة الامتدادات من الجهات الخارجية دون أي قيود: مستندات (PDF, DOCX, XLSX)، ملفات مضغوطة (ZIP, RAR, 7Z, TAR)، كود وبيانات (PY, JS, JSON, SQL)، وسائط (MP4, MP3)، برمجيات وحزم (EXE, APK, ISO, EDUPKG)، وغيرها.
          </p>
        </div>

        <div>
          <label className="label">رابط الملف المباشر (Direct URL) *</label>
          <input
            className="input"
            type="url"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/files/dataset.zip"
            required
            autoFocus
          />
          <div className="small muted" style={{ marginTop: "0.25rem" }}>
            يتم تنزيل الملف بأمان من السيرفر الخارجي وحساب بصمة التحقق (SHA-256) تلقائياً.
          </div>
        </div>

        <div>
          <label className="label">اسم الملف المخصص (اختياري)</label>
          <input
            className="input"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="اتركه فارغاً لاستخراج الاسم تلقائياً من الرابط الخارجي"
          />
        </div>

        <div>
          <label className="label">ملاحظات / وصف المحتوى (اختياري)</label>
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر لمصدر الملف أو طريقة استخدامه..."
          />
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>
            {busy ? (
              <>
                <span className="spinner" /> جاري الاستيراد والتنزيل...
              </>
            ) : (
              "بدء الاستيراد 📥"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
