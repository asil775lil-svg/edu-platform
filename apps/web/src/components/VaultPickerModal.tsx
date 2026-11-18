import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../lib/api";
import type { Block, Vault, VaultDetail, VaultFile } from "../lib/types";
import { defaultBlock } from "../lib/draft";

interface Props {
  onClose: () => void;
  onSelectBlock: (block: Block) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 بايت";
  const k = 1024;
  const sizes = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function VaultPickerModal({ onClose, onSelectBlock }: Props) {
  const [vaults, setVaults] = useState<Vault[] | null>(null);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [vaultDetail, setVaultDetail] = useState<VaultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.vaults
      .list()
      .then((data) => {
        setVaults(data);
        if (data.length > 0) {
          setSelectedVaultId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedVaultId) return;
    setLoadingFiles(true);
    api.vaults
      .get(selectedVaultId, { q: search || undefined })
      .then((detail) => setVaultDetail(detail))
      .catch(() => {})
      .finally(() => setLoadingFiles(false));
  }, [selectedVaultId, search]);

  async function handleInsertFile(file: VaultFile) {
    const ext = file.ext.toLowerCase();

    // 1. صور
    if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"].includes(ext)) {
      onSelectBlock({
        ...defaultBlock("image"),
        caption: file.filename,
        alt: file.description || file.filename,
        text: file.view_url,
      });
      onClose();
      return;
    }

    // 2. فيديو
    if ([".mp4", ".webm", ".mov"].includes(ext)) {
      onSelectBlock({
        ...defaultBlock("video"),
        caption: file.filename,
        text: file.view_url,
      });
      onClose();
      return;
    }

    // 3. صوت
    if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) {
      onSelectBlock({
        ...defaultBlock("audio"),
        caption: file.filename,
        text: file.view_url,
      });
      onClose();
      return;
    }

    // 4. كود وبرمجة
    const codeExts: Record<string, string> = {
      ".py": "python",
      ".js": "javascript",
      ".ts": "typescript",
      ".html": "html",
      ".css": "css",
      ".sql": "sql",
      ".json": "json",
      ".sh": "bash",
      ".cpp": "cpp",
    };
    if (codeExts[ext]) {
      try {
        const inspect = await api.vaults.inspect(file.vault_id, file.id);
        const codeContent = inspect.preview_data.content || "";
        onSelectBlock({
          ...defaultBlock("code"),
          language: codeExts[ext],
          code: codeContent,
        });
        onClose();
        return;
      } catch {
        // fallback to reference block
      }
    }

    // 5. مستندات، PDF، ملفات مضغوطة، أو صيغ أخرى ككتلة تنبيه ومرجع مرفق
    onSelectBlock({
      ...defaultBlock("callout"),
      calloutVariant: "info",
      calloutTitle: `📎 مرفق دراسي من الخزينة: ${file.filename}`,
      text: `ملف مرفق (${file.ext ? file.ext.toUpperCase() : "ملف"} — ${formatBytes(file.size)}).\n` +
        (file.description ? `${file.description}\n` : "") +
        `رابط التنزيل المباشر: ${file.download_url}`,
    });
    onClose();
  }

  return (
    <Modal title="🗄️ إدراج ملف أو وسيط من الخزائن" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: "400px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}>
            <span className="spinner" /> جاري تحميل الخزائن...
          </div>
        ) : !vaults || vaults.length === 0 ? (
          <div className="empty" style={{ padding: "3rem 1rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🗄️</div>
            <h4>لا توجد خزن ملفات حالياً</h4>
            <p className="small muted">
              يمكنك إنشاء خزينة ورفع أو استيراد ملفات إليها أولاً لتتمكن من إدراجها داخل الدروس.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "1rem", flex: 1 }}>
            {/* القائمة الجانبية للخزن */}
            <div
              style={{
                borderLeft: "1px solid var(--border)",
                paddingLeft: "0.8rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
              }}
            >
              <div className="small muted" style={{ fontWeight: 600, marginBottom: "0.3rem" }}>
                اختر الخزينة:
              </div>
              {vaults.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="btn btn-sm"
                  style={{
                    justifyContent: "flex-start",
                    textAlign: "right",
                    background: selectedVaultId === v.id ? "var(--primary-soft)" : "transparent",
                    borderColor: selectedVaultId === v.id ? "var(--primary)" : "transparent",
                    color: selectedVaultId === v.id ? "#93c5fd" : "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  onClick={() => setSelectedVaultId(v.id)}
                >
                  <span style={{ marginInlineEnd: "0.3rem" }}>{v.icon}</span>
                  {v.name}
                </button>
              ))}
            </div>

            {/* قائمة الملفات في الخزينة المختارة */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <input
                className="input input-sm"
                placeholder="🔍 بحث في ملفات هذه الخزينة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div style={{ flex: 1, maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {loadingFiles ? (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <span className="spinner" /> جاري تحميل الملفات...
                  </div>
                ) : !vaultDetail || vaultDetail.files.length === 0 ? (
                  <div className="empty" style={{ padding: "2rem 1rem" }}>
                    لا توجد ملفات في هذه الخزينة
                  </div>
                ) : (
                  vaultDetail.files.map((f) => (
                    <div
                      key={f.id}
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        padding: "0.5rem 0.8rem",
                        background: "var(--card-2)",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        fontSize: "0.88rem",
                      }}
                    >
                      <div style={{ overflow: "hidden", maxWidth: "70%" }}>
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {f.filename}
                        </div>
                        <div className="small muted">
                          {formatBytes(f.size)} · {f.ext.toUpperCase() || "ملف"} {f.folder ? `· [${f.folder}]` : ""}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                        onClick={() => handleInsertFile(f)}
                      >
                        ➕ إدراج في الدرس
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
