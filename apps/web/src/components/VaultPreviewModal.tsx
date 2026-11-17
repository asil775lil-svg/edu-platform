import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { VaultFile } from "../lib/types";

interface Props {
  file: VaultFile;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 بايت";
  const k = 1024;
  const sizes = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function VaultPreviewModal({ file, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  const ext = file.ext.toLowerCase();
  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp"].includes(ext);
  const isVideo = [".mp4", ".webm", ".mov", ".mkv"].includes(ext);
  const isAudio = [".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(ext);
  const isPdf = ext === ".pdf";
  const isCodeOrText = [
    ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".py", ".js", ".ts",
    ".jsx", ".tsx", ".html", ".css", ".sql", ".sh", ".ps1", ".bat", ".c",
    ".cpp", ".h", ".java", ".rs", ".go", ".csv",
  ].includes(ext) || file.mime.startsWith("text/");

  useEffect(() => {
    if (isCodeOrText && file.size < 2 * 1024 * 1024) {
      setLoadingText(true);
      fetch(file.view_url, { credentials: "include" })
        .then((res) => (res.ok ? res.text() : Promise.reject("تعذر قراءة النص")))
        .then((text) => setTextContent(text))
        .catch(() => setTextContent("تعذر تحميل المعاينة النصية للملف."))
        .finally(() => setLoadingText(false));
    }
  }, [file.view_url, isCodeOrText, file.size]);

  function copyDownloadUrl() {
    const fullUrl = window.location.origin + file.download_url;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copySha256() {
    navigator.clipboard.writeText(file.sha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  }

  return (
    <Modal title={`معاينة وتفاصيل: ${file.filename}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
        {/* منطقة المعاينة */}
        <div
          style={{
            background: "#080d1a",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            minHeight: "220px",
            maxHeight: "450px",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {isImage ? (
            <img
              src={file.view_url}
              alt={file.filename}
              style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain" }}
            />
          ) : isVideo ? (
            <video
              src={file.view_url}
              controls
              style={{ maxWidth: "100%", maxHeight: "400px" }}
            />
          ) : isAudio ? (
            <div style={{ padding: "2rem", width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎵</div>
              <audio src={file.view_url} controls style={{ width: "80%" }} />
            </div>
          ) : isPdf ? (
            <iframe
              src={file.view_url}
              title={file.filename}
              style={{ width: "100%", height: "450px", border: "none" }}
            />
          ) : isCodeOrText ? (
            <div style={{ width: "100%", height: "100%", overflow: "auto", padding: "1rem" }}>
              {loadingText ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <span className="spinner" /> جاري قراءة الكود...
                </div>
              ) : (
                <pre
                  dir="ltr"
                  style={{
                    margin: 0,
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    lineHeight: 1.6,
                    color: "#93c5fd",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {textContent}
                </pre>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
              <div style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
                {ext === ".zip" || ext === ".rar" || ext === ".7z"
                  ? "📦"
                  : ext === ".exe" || ext === ".msi" || ext === ".apk"
                  ? "⚙️"
                  : ext === ".docx" || ext === ".xlsx" || ext === ".pptx"
                  ? "📑"
                  : "📁"}
              </div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{file.filename}</div>
              <div className="small muted" style={{ marginTop: "0.25rem" }}>
                صيغة ({ext || "بدون امتداد"}) — {file.mime}
              </div>
              <div style={{ marginTop: "1rem" }}>
                <a href={file.download_url} download className="btn btn-primary">
                  تحميل الملف الآن ({formatBytes(file.size)}) ⬇️
                </a>
              </div>
            </div>
          )}
        </div>

        {/* بطاقة التفاصيل الفنية ومصدر الاستيراد */}
        <div
          style={{
            background: "var(--card-2)",
            borderRadius: "10px",
            border: "1px solid var(--border)",
            padding: "1rem",
            fontSize: "0.88rem",
            display: "grid",
            gap: "0.6rem",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">مصدر الاستيراد:</span>
            <span>
              {file.source_type === "external_url" ? (
                <span className="badge" style={{ background: "rgba(59, 130, 246, 0.2)", color: "#93c5fd" }}>
                  🌐 مستورد من جهة خارجية
                </span>
              ) : (
                <span className="badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#6ee7b7" }}>
                  💻 رفع مباشر
                </span>
              )}
            </span>
          </div>

          {file.source_url && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span className="muted">الرابط الخارجي الأصلي:</span>
              <a
                href={file.source_url}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                style={{
                  color: "var(--primary)",
                  wordBreak: "break-all",
                  fontSize: "0.82rem",
                  textDecoration: "underline",
                }}
              >
                {file.source_url}
              </a>
            </div>
          )}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">حجم الملف:</span>
            <strong>{formatBytes(file.size)}</strong>
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">نوع المحتوى (MIME):</span>
            <code style={{ fontSize: "0.8rem" }}>{file.mime}</code>
          </div>

          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span className="muted">بصمة التشفير (SHA-256):</span>
            <div className="row" style={{ gap: "0.4rem" }}>
              <code style={{ fontSize: "0.75rem" }}>{file.sha256.slice(0, 16)}...</code>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                onClick={copySha256}
              >
                {copiedHash ? "تم النسخ ✓" : "نسخ البصمة"}
              </button>
            </div>
          </div>

          {file.description && (
            <div>
              <span className="muted">الملاحظات والوصف:</span>
              <div style={{ marginTop: "0.2rem", color: "var(--text)" }}>{file.description}</div>
            </div>
          )}
        </div>

        {/* أزرار الإجراءات */}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-ghost" onClick={copyDownloadUrl}>
            {copied ? "تم نسخ الرابط المباشر ✓" : "📋 نسخ رابط التنزيل المباشر"}
          </button>
          <div className="row" style={{ gap: "0.5rem" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              إغلاق
            </button>
            <a href={file.download_url} download className="btn btn-primary">
              تحميل الملف ⬇️
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}
