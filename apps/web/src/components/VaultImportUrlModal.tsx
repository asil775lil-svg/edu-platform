import { useState } from "react";
import { Modal } from "./Modal";
import { api, ApiError } from "../lib/api";
import type { VaultFile } from "../lib/types";

interface Props {
  vaultId: string;
  vaultName: string;
  onClose: () => void;
  onSuccess: (files: VaultFile[]) => void;
}

export function VaultImportUrlModal({ vaultId, vaultName, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [url, setUrl] = useState("");
  const [batchUrls, setBatchUrls] = useState("");
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [folder, setFolder] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const parsedTags = tagsStr
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (mode === "single") {
        if (!url.trim()) {
          setError("يرجى إدخال رابط الملف الخارجي");
          setBusy(false);
          return;
        }
        const imported = await api.vaults.importUrl(vaultId, {
          url: url.trim(),
          filename: filename.trim() || undefined,
          description: description.trim() || undefined,
          folder: folder.trim() || undefined,
          tags: parsedTags,
        });
        onSuccess([imported]);
      } else {
        const urlsList = batchUrls
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean);
        if (urlsList.length === 0) {
          setError("يرجى كتابة رابط واحد على الأقل في السطور أدناه");
          setBusy(false);
          return;
        }
        const importedList = await api.vaults.importUrls(vaultId, {
          urls: urlsList,
          folder: folder.trim() || undefined,
          tags: parsedTags,
        });
        if (importedList.length === 0) {
          throw new Error("تعذر استيراد أي رابط من الروابط المدخلة");
        }
        onSuccess(importedList);
      }
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
    <Modal title={`استيراد من جهة خارجية إلى [${vaultName}]`} onClose={onClose}>
      <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <div className="alert alert-danger">{error}</div>}

        {/* أزرار تبديل النمط */}
        <div className="row" style={{ gap: "0.4rem", background: "var(--card-2)", padding: "0.3rem", borderRadius: "10px" }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              background: mode === "single" ? "var(--primary)" : "transparent",
              borderColor: mode === "single" ? "var(--primary)" : "transparent",
              color: mode === "single" ? "#fff" : "var(--muted)",
            }}
            onClick={() => setMode("single")}
          >
            🌐 رابط مفرد
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              background: mode === "batch" ? "var(--primary)" : "transparent",
              borderColor: mode === "batch" ? "var(--primary)" : "transparent",
              color: mode === "batch" ? "#fff" : "var(--muted)",
            }}
            onClick={() => setMode("batch")}
          >
            📑 استيراد روابط مجمعة (Batch)
          </button>
        </div>

        <div className="callout-box callout-info" style={{ fontSize: "0.85rem" }}>
          <strong>🛡️ حماية متقدمة وقبول لجميع الصيغ:</strong>
          <div style={{ marginTop: "0.2rem" }}>
            يتم فحص الروابط تلقائياً ضد ثغرات SSRF وتنزيل كافة الامتدادات (PDF, DOCX, ZIP, MP4, PY, EXE...) مع عزل أمني وحساب البصمة الرقمية.
          </div>
        </div>

        {mode === "single" ? (
          <>
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
            </div>

            <div>
              <label className="label">اسم الملف المخصص (اختياري)</label>
              <input
                className="input"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="اتركه فارغاً لاستخراج الاسم تلقائياً من الرابط"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="label">قائمة الروابط (رابط في كل سطر) *</label>
            <textarea
              className="input"
              dir="ltr"
              rows={4}
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
              placeholder="https://example.com/file1.pdf&#10;https://example.com/file2.zip&#10;https://example.com/file3.mp4"
              required
              autoFocus
            />
            <div className="small muted" style={{ marginTop: "0.25rem" }}>
              ضع كل رابط في سطر منفصل؛ سيتم استيرادها وحفظها بالتوازي.
            </div>
          </div>
        )}

        <div className="row" style={{ gap: "0.8rem" }}>
          <div style={{ flex: 1 }}>
            <label className="label">المجلد الحاوي (اختياري)</label>
            <input
              className="input"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="مثال: مراجع، وحدة-1، كود"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">الوسوم (مفصولة بفواصل)</label>
            <input
              className="input"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="مثال: اختبار, مرجع, مهم"
            />
          </div>
        </div>

        {mode === "single" && (
          <div>
            <label className="label">ملاحظات / وصف المحتوى (اختياري)</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف مختصر لمصدر الملف أو طريقة استخدامه..."
            />
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || (mode === "single" ? !url.trim() : !batchUrls.trim())}
          >
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
