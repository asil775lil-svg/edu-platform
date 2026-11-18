import { useRef, useState } from "react";
import { Modal } from "./Modal";
import { api, ApiError } from "../lib/api";
import type { VaultFile } from "../lib/types";

interface Props {
  vaultId: string;
  vaultName: string;
  onClose: () => void;
  onSuccess: (files: VaultFile[]) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 بايت";
  const k = 1024;
  const sizes = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function VaultUploadModal({ vaultId, vaultName, onClose, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [folder, setFolder] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setError("يرجى اختيار ملف واحد على الأقل للرفع");
      return;
    }

    setBusy(true);
    setError(null);
    const uploadedFiles: VaultFile[] = [];

    const parsedTags = tagsStr
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        setUploadIndex(i + 1);
        const f = selectedFiles[i];
        const res = await api.vaults.upload(
          vaultId,
          f,
          description.trim() || undefined,
          folder.trim() || undefined,
          parsedTags,
        );
        uploadedFiles.push(res);
      }
      onSuccess(uploadedFiles);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("تعذر استكمال رفع الملفات");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`رفع واستيراد ملفات إلى [${vaultName}]`} onClose={onClose}>
      <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="callout-box callout-info" style={{ fontSize: "0.88rem" }}>
          <strong>📁 مدعوم لجميع أنواع وصيغ الملفات:</strong>
          <div style={{ marginTop: "0.2rem" }}>
            يمكنك رفع واستيراد أي صيغة دون قيود (PDF, ZIP, DOCX, XLSX, MP4, PY, EXE, ISO, JSON...).
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: "2px dashed var(--border)",
            borderRadius: "var(--radius)",
            padding: "2rem 1rem",
            textAlign: "center",
            cursor: "pointer",
            background: "var(--card)",
            transition: "0.2s",
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) {
              const filesArray = Array.from(e.dataTransfer.files);
              setSelectedFiles((prev) => [...prev, ...filesArray]);
            }
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>📤</div>
          <div style={{ fontWeight: 600 }}>انقر هنا لاختيار الملفات أو اسحبها وأفلتها</div>
          <div className="small muted">تقبل المنصة جميع الصيغ والامتدادات بأي حجم مسموح</div>
        </div>

        {selectedFiles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "180px", overflowY: "auto" }}>
            <div className="small muted" style={{ fontWeight: 600 }}>
              الملفات المختارة ({selectedFiles.length}):
            </div>
            {selectedFiles.map((file, idx) => (
              <div
                key={idx}
                className="row"
                style={{
                  justifyContent: "space-between",
                  background: "var(--card-2)",
                  padding: "0.4rem 0.7rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                  📄 {file.name}
                </div>
                <div className="row" style={{ gap: "0.5rem" }}>
                  <span className="muted">{formatBytes(file.size)}</span>
                  {!busy && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: "20px", height: "20px", fontSize: "0.75rem" }}
                      onClick={() => removeFile(idx)}
                      title="إزالة"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
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
              placeholder="مثال: صور, مشروع, تدريب"
            />
          </div>
        </div>

        <div>
          <label className="label">ملاحظات مشتركة (اختياري)</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثال: ملفات مستوردة من نظام الأرشفة الخارجي..."
          />
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || selectedFiles.length === 0}
          >
            {busy ? (
              <>
                <span className="spinner" /> جاري الرفع ({uploadIndex} من {selectedFiles.length})...
              </>
            ) : (
              `رفع ${selectedFiles.length} ملف 🚀`
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
