import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { VaultFile, VaultFileInspect } from "../lib/types";

interface Props {
  file: VaultFile;
  vaultId: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 بايت";
  const k = 1024;
  const sizes = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function VaultReaderModal({ file, vaultId, onClose }: Props) {
  const [inspectData, setInspectData] = useState<VaultFileInspect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // أدوات القارئ
  const [fontSize, setFontSize] = useState(15);
  const [wrapCode, setWrapCode] = useState(true);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [activeTableIndex, setActiveTableIndex] = useState(0);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [fileNotes, setFileNotes] = useState(file.description || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesFeedback, setNotesFeedback] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    api.vaults
      .inspect(vaultId, file.id)
      .then((data) => {
        if (mounted) setInspectData(data);
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof ApiError ? err.message : "تعذر استخراج بيانات المعاينة");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [vaultId, file.id]);

  function copyText(content: string) {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      await api.vaults.updateFile(vaultId, file.id, { description: fileNotes.trim() });
      setNotesFeedback(true);
      setTimeout(() => setNotesFeedback(false), 2000);
    } catch {
      alert("تعذر حفظ الملاحظة");
    } finally {
      setSavingNotes(false);
    }
  }

  const kind = inspectData?.preview_data?.kind || "binary";
  const pData = inspectData?.preview_data;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(3, 7, 18, 0.92)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* الشريط العلوي للقارئ (Top Navigation & Controls) */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.7rem 1.4rem",
          background: "var(--card)",
          borderBottom: "1px solid var(--border)",
          gap: "1rem",
        }}
      >
        {/* معلومات الملف */}
        <div className="row" style={{ gap: "0.8rem", overflow: "hidden" }}>
          <div
            style={{
              padding: "0.3rem 0.6rem",
              borderRadius: "8px",
              background: "var(--primary-soft)",
              color: "#93c5fd",
              fontWeight: 700,
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
            }}
          >
            {file.ext ? file.ext.toUpperCase() : "ملف"}
          </div>
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "1.05rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "450px",
              }}
              title={file.filename}
            >
              {file.filename}
            </div>
            <div className="small muted" style={{ fontSize: "0.78rem" }}>
              {formatBytes(file.size)} · {file.mime} · {file.source_type === "external_url" ? "مستورد من رابط خارجي" : "رفع مباشر"}
            </div>
          </div>
        </div>

        {/* أدوات التحكم بالقراءة */}
        <div className="row" style={{ gap: "0.5rem" }}>
          {(kind === "code" || kind === "docx") && (
            <div className="row" style={{ gap: "0.3rem", background: "var(--card-2)", padding: "0.2rem 0.5rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <span className="small muted">حجم الخط:</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setFontSize((s) => Math.max(12, s - 1))}
                title="تصغير الخط"
              >
                A-
              </button>
              <span style={{ fontSize: "0.85rem", minWidth: "22px", textAlign: "center" }}>{fontSize}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setFontSize((s) => Math.min(26, s + 1))}
                title="تكبير الخط"
              >
                A+
              </button>
            </div>
          )}

          {kind === "code" && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setWrapCode((w) => !w)}
              title="تبديل التفاف الأسطر"
            >
              {wrapCode ? "عزل الأسطر ↔" : "التفاف الأسطر ↩"}
            </button>
          )}

          {kind === "code" && pData?.content && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => copyText(pData.content || "")}
            >
              {copied ? "تم النسخ ✓" : "📋 نسخ النص"}
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ color: notesOpen ? "var(--primary)" : undefined }}
            onClick={() => setNotesOpen((o) => !o)}
            title="تدوين ملاحظات حول الملف"
          >
            📝 ملاحظاتي {fileNotes ? "•" : ""}
          </button>

          <a
            href={file.download_url}
            download
            className="btn btn-sm btn-primary"
            title="تحميل الملف الأصلي"
          >
            ⬇️ تحميل
          </a>

          <button
            type="button"
            className="icon-btn"
            style={{ width: "34px", height: "34px", fontSize: "1.1rem" }}
            onClick={onClose}
            title="إغلاق القارئ (Esc)"
          >
            ✕
          </button>
        </div>
      </header>

      {/* منطقة القراءة والمعاينة المباشرة (Reader Canvas) */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          padding: kind === "pdf" ? 0 : "1.5rem",
          background: kind === "pdf" ? "#1e1e1e" : "#080d1a",
        }}
      >
        {loading ? (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--muted)" }}>
            <span className="spinner" style={{ width: "32px", height: "32px" }} />
            <div style={{ marginTop: "1rem", fontSize: "1rem" }}>
              جاري فحص وتجهيز الملف للقراءة من داخل الخزينة...
            </div>
          </div>
        ) : error ? (
          <div style={{ margin: "auto", maxWidth: "500px", textAlign: "center" }}>
            <div className="alert alert-danger">{error}</div>
            <div style={{ marginTop: "1rem" }}>
              <a href={file.download_url} download className="btn btn-primary">
                تحميل الملف لفتحه خارجياً ⬇️
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* 1. قارئ مستندات PDF */}
            {kind === "pdf" && (
              <iframe
                src={`${file.view_url}#toolbar=1&navpanes=1`}
                title={file.filename}
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            )}

            {/* 2. قارئ مستندات Word (.docx) */}
            {kind === "docx" && (
              <div
                style={{
                  maxWidth: "850px",
                  margin: "0 auto",
                  width: "100%",
                  background: "var(--card)",
                  padding: "2.5rem 3rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.8,
                  boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                }}
              >
                <div style={{ borderBottom: "2px solid var(--border)", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
                  <div className="small muted">مستند Word مقروء من داخل الخزينة</div>
                  <h1 style={{ fontSize: "1.8rem", margin: "0.2rem 0" }}>{file.filename}</h1>
                </div>

                {pData?.blocks && pData.blocks.length > 0 ? (
                  pData.blocks.map((block, idx) => {
                    if (block.type === "heading") {
                      const HeadingTag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
                      return (
                        <HeadingTag
                          key={idx}
                          style={{
                            color: "#93c5fd",
                            marginTop: "1.6rem",
                            marginBottom: "0.6rem",
                            borderBottom: block.level === 1 ? "1px solid var(--border)" : "none",
                            paddingBottom: block.level === 1 ? "0.4rem" : "none",
                          }}
                        >
                          {block.text}
                        </HeadingTag>
                      );
                    }
                    if (block.type === "paragraph") {
                      return (
                        <p key={idx} style={{ margin: "0 0 1rem", textAlign: "justify" }}>
                          {block.text}
                        </p>
                      );
                    }
                    if (block.type === "table" && block.rows) {
                      return (
                        <div key={idx} style={{ overflowX: "auto", margin: "1.2rem 0" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
                            <tbody>
                              {block.rows.map((r, rIdx) => (
                                <tr
                                  key={rIdx}
                                  style={{
                                    background: rIdx === 0 ? "var(--card-2)" : "transparent",
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  {r.map((c, cIdx) => (
                                    <td
                                      key={cIdx}
                                      style={{
                                        padding: "0.6rem 0.8rem",
                                        border: "1px solid var(--border)",
                                        fontWeight: rIdx === 0 ? 700 : "normal",
                                      }}
                                    >
                                      {c}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    return null;
                  })
                ) : (
                  <div className="muted">المستند فارغ أو لم يُعثر على نصوص بداخله.</div>
                )}
              </div>
            )}

            {/* 2.5 عارض عروض PowerPoint (.pptx) */}
            {kind === "slides" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  background: "var(--card)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                {/* شريط أدوات الشرائح */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.8rem 1.2rem",
                    background: "var(--card-2)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div className="row" style={{ gap: "0.8rem" }}>
                    <span style={{ fontSize: "1.3rem" }}>📽️</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>عرض تقديمي PowerPoint</div>
                      <div className="small muted">
                        الشريحة {activeSlideIndex + 1} من {pData?.slide_count || 1}
                      </div>
                    </div>
                  </div>

                  <div className="row" style={{ gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={activeSlideIndex <= 0}
                      onClick={() => setActiveSlideIndex((i) => Math.max(0, i - 1))}
                    >
                      ▶️ الشريحة السابقة
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!pData?.slides || activeSlideIndex >= pData.slides.length - 1}
                      onClick={() => setActiveSlideIndex((i) => Math.min((pData?.slides?.length || 1) - 1, i + 1))}
                    >
                      الشريحة التالية ◀️
                    </button>
                  </div>
                </div>

                {/* لوحة الشريحة المعروضة */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2rem",
                    background: "#080d1a",
                    overflow: "auto",
                  }}
                >
                  {(() => {
                    const slide = pData?.slides?.[activeSlideIndex];
                    if (!slide) return <div className="empty">لا توجد شرائح</div>;
                    return (
                      <div
                        style={{
                          width: "100%",
                          maxWidth: "800px",
                          minHeight: "450px",
                          background: "var(--card)",
                          border: "2px solid var(--border)",
                          borderRadius: "var(--radius)",
                          padding: "2.5rem 3rem",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                        }}
                      >
                        <div>
                          <div className="small muted" style={{ marginBottom: "0.5rem" }}>
                            شريحة {slide.slide_number}
                          </div>
                          <h2
                            style={{
                              color: "#93c5fd",
                              fontSize: "1.6rem",
                              margin: "0 0 1.5rem",
                              borderBottom: "2px solid var(--primary-soft)",
                              paddingBottom: "0.5rem",
                            }}
                          >
                            {slide.title}
                          </h2>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", fontSize: "1.1rem" }}>
                            {slide.content.map((point, pIdx) => (
                              <div key={pIdx} className="row" style={{ alignItems: "flex-start", gap: "0.6rem" }}>
                                <span style={{ color: "var(--primary)", marginTop: "0.2rem" }}>•</span>
                                <div>{point}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div
                          style={{
                            borderTop: "1px solid var(--border)",
                            paddingTop: "0.6rem",
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.8rem",
                            color: "var(--muted)",
                          }}
                        >
                          <span>{file.filename}</span>
                          <span>{slide.slide_number} / {pData?.slide_count || 1}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 3. قارئ الجداول المتقدمة (Excel & CSV) */}
            {kind === "spreadsheet" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  background: "var(--card)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                {/* شريط الأوراق والبحث */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.8rem",
                    padding: "0.7rem 1rem",
                    background: "var(--card-2)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div className="row" style={{ gap: "0.4rem" }}>
                    {pData?.sheets?.map((s, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: activeSheetIndex === sIdx ? "var(--primary)" : "transparent",
                          borderColor: activeSheetIndex === sIdx ? "var(--primary)" : "var(--border)",
                          color: activeSheetIndex === sIdx ? "#fff" : "var(--muted)",
                          fontWeight: 600,
                        }}
                        onClick={() => {
                          setActiveSheetIndex(sIdx);
                          setTableSearch("");
                        }}
                      >
                        📊 {s.name} ({s.rows.length} صف)
                      </button>
                    ))}
                  </div>

                  <div style={{ width: "240px" }}>
                    <input
                      className="input input-sm"
                      placeholder="🔍 تصفية الخلايا والبيانات..."
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                    />
                  </div>
                </div>

                {/* جدول البيانات المعروض */}
                <div style={{ flex: 1, overflow: "auto", padding: "0.5rem" }}>
                  {(() => {
                    const activeSheet = pData?.sheets?.[activeSheetIndex];
                    if (!activeSheet || activeSheet.rows.length === 0) {
                      return <div className="empty" style={{ margin: "2rem" }}>لا توجد بيانات في هذه الورقة</div>;
                    }

                    const filteredRows = tableSearch
                      ? activeSheet.rows.filter((r) =>
                          r.some((c) => c.toLowerCase().includes(tableSearch.toLowerCase()))
                        )
                      : activeSheet.rows;

                    return (
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "0.85rem",
                          fontFamily: "monospace",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#0e1729", position: "sticky", top: 0, zIndex: 1 }}>
                            <th style={{ padding: "0.5rem", border: "1px solid var(--border)", width: "45px", color: "var(--muted)" }}>
                              #
                            </th>
                            {activeSheet.rows[0]?.map((_, cIdx) => (
                              <th
                                key={cIdx}
                                style={{
                                  padding: "0.5rem 0.8rem",
                                  border: "1px solid var(--border)",
                                  color: "#93c5fd",
                                  textAlign: "start",
                                }}
                              >
                                {String.fromCharCode(65 + (cIdx % 26))}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              style={{
                                background: rIdx % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              <td
                                style={{
                                  padding: "0.4rem 0.6rem",
                                  border: "1px solid var(--border)",
                                  textAlign: "center",
                                  color: "var(--muted)",
                                  userSelect: "none",
                                }}
                              >
                                {rIdx + 1}
                              </td>
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  style={{
                                    padding: "0.45rem 0.8rem",
                                    border: "1px solid var(--border)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 4. قارئ الأكواد والنصوص والبرمجة */}
            {kind === "code" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  background: "#050811",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.5rem 1rem",
                    background: "var(--card-2)",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "0.82rem",
                    color: "var(--muted)",
                  }}
                >
                  <span>لغة الملف: <strong style={{ color: "#93c5fd" }}>{pData?.language || "text"}</strong></span>
                  <span>{pData?.line_count || 0} سطر</span>
                </div>

                <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
                  <pre
                    dir="ltr"
                    style={{
                      margin: 0,
                      fontFamily: "Consolas, 'Cascadia Mono', monospace",
                      fontSize: `${fontSize}px`,
                      lineHeight: 1.6,
                      color: "#e2e8f0",
                      whiteSpace: wrapCode ? "pre-wrap" : "pre",
                      wordBreak: wrapCode ? "break-all" : "normal",
                    }}
                  >
                    {pData?.content}
                  </pre>
                </div>
              </div>
            )}

            {/* 5. متصفح الأرشيف والمحتوى المضغوط (Archive Explorer) */}
            {kind === "archive" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  background: "var(--card)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.8rem",
                    padding: "0.8rem 1.2rem",
                    background: "var(--card-2)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div className="row" style={{ gap: "0.8rem" }}>
                    <span style={{ fontSize: "1.3rem" }}>📦</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>مستعرض محتويات الأرشيف المضغوط</div>
                      <div className="small muted">
                        {pData?.file_count || 0} ملف/مجلد · الحجم بعد فك الضغط: {formatBytes(pData?.total_uncompressed || 0)}
                      </div>
                    </div>
                  </div>

                  <div style={{ width: "240px" }}>
                    <input
                      className="input input-sm"
                      placeholder="🔍 بحث في مسارات الملفات..."
                      value={archiveSearch}
                      onChange={(e) => setArchiveSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ flex: 1, overflow: "auto", padding: "0.5rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                    <thead>
                      <tr style={{ background: "#0e1729", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "0.6rem 0.9rem", textAlign: "start" }}>المسار والملف</th>
                        <th style={{ padding: "0.6rem 0.9rem", textAlign: "start", width: "120px" }}>الحجم الأصلي</th>
                        <th style={{ padding: "0.6rem 0.9rem", textAlign: "start", width: "120px" }}>الحجم المضغوط</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pData?.files
                        ?.filter((f) => !archiveSearch || f.path.toLowerCase().includes(archiveSearch.toLowerCase()))
                        .map((f, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: "1px solid var(--border)",
                              background: idx % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                            }}
                          >
                            <td style={{ padding: "0.5rem 0.9rem", direction: "ltr", textAlign: "left" }}>
                              {f.is_dir ? "📁" : "📄"} {f.path}
                            </td>
                            <td style={{ padding: "0.5rem 0.9rem", color: "var(--muted)" }}>
                              {f.is_dir ? "-" : formatBytes(f.size)}
                            </td>
                            <td style={{ padding: "0.5rem 0.9rem", color: "var(--muted)" }}>
                              {f.compress_size ? formatBytes(f.compress_size) : "-"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. مشغل الوسائط المتقدم (فيديو وصوت) */}
            {kind === "media" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "1.5rem",
                }}
              >
                {pData?.media_type === "video" ? (
                  <video
                    src={file.view_url}
                    controls
                    autoPlay
                    style={{
                      maxHeight: "75vh",
                      maxWidth: "90%",
                      borderRadius: "var(--radius)",
                      boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      background: "var(--card)",
                      padding: "3rem 4rem",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border)",
                      textAlign: "center",
                      boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎵</div>
                    <div style={{ fontWeight: 700, fontSize: "1.3rem", marginBottom: "1.5rem" }}>
                      {file.filename}
                    </div>
                    <audio src={file.view_url} controls autoPlay style={{ width: "320px" }} />
                  </div>
                )}

                {/* أزرار سرعة التشغيل */}
                <div className="row" style={{ gap: "0.4rem", background: "var(--card)", padding: "0.4rem 0.8rem", borderRadius: "10px", border: "1px solid var(--border)" }}>
                  <span className="small muted">سرعة التشغيل:</span>
                  {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      className="btn btn-sm"
                      style={{
                        padding: "0.2rem 0.5rem",
                        fontSize: "0.78rem",
                        background: playbackSpeed === spd ? "var(--primary)" : "transparent",
                        borderColor: playbackSpeed === spd ? "var(--primary)" : "var(--border)",
                      }}
                      onClick={() => {
                        setPlaybackSpeed(spd);
                        const mediaEl = document.querySelector("video, audio") as HTMLMediaElement | null;
                        if (mediaEl) mediaEl.playbackRate = spd;
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 7. مستعرض الصور */}
            {kind === "image" && (
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  height: "100%",
                }}
              >
                <img
                  src={file.view_url}
                  alt={file.filename}
                  style={{
                    maxWidth: "90%",
                    maxHeight: "80vh",
                    objectFit: "contain",
                    borderRadius: "10px",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                  }}
                />
              </div>
            )}

            {/* 8. مستعرض قواعد البيانات SQLite */}
            {kind === "database" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  background: "var(--card)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    padding: "0.7rem 1.2rem",
                    background: "var(--card-2)",
                    borderBottom: "1px solid var(--border)",
                    gap: "0.5rem",
                  }}
                >
                  {pData?.tables?.map((tbl, tIdx) => (
                    <button
                      key={tIdx}
                      type="button"
                      className="btn btn-sm"
                      style={{
                        background: activeTableIndex === tIdx ? "var(--primary)" : "transparent",
                        borderColor: activeTableIndex === tIdx ? "var(--primary)" : "var(--border)",
                      }}
                      onClick={() => setActiveTableIndex(tIdx)}
                    >
                      🗄️ {tbl.name} ({tbl.row_count} سجل)
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
                  {(() => {
                    const activeTbl = pData?.tables?.[activeTableIndex];
                    if (!activeTbl) return <div className="empty">لا توجد جداول</div>;
                    return (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ background: "#0e1729", borderBottom: "1px solid var(--border)" }}>
                            {activeTbl.columns.map((c, idx) => (
                              <th key={idx} style={{ padding: "0.5rem 0.8rem", textAlign: "start", color: "#93c5fd" }}>
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeTbl.sample.map((row, rIdx) => (
                            <tr key={rIdx} style={{ borderBottom: "1px solid var(--border)" }}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} style={{ padding: "0.5rem 0.8rem" }}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 9. فاحص الملفات الثنائية (Binary & Hex Dump) */}
            {kind === "binary" && (
              <div
                style={{
                  maxWidth: "850px",
                  margin: "0 auto",
                  width: "100%",
                  background: "var(--card)",
                  padding: "2rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>⚙️</div>
                  <h2 style={{ margin: "0 0 0.4rem" }}>{file.filename}</h2>
                  <div className="small muted">
                    صيغة ثنائية ({file.ext || "بدون امتداد"}) — {file.mime} — {formatBytes(file.size)}
                  </div>
                </div>

                {pData?.hex_dump && pData.hex_dump.length > 0 && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <div className="small muted" style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
                      معاينة ترويسة البايتات (Hex Dump):
                    </div>
                    <pre
                      dir="ltr"
                      style={{
                        background: "#050811",
                        padding: "1rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        fontSize: "0.82rem",
                        color: "#6ee7b7",
                        overflowX: "auto",
                      }}
                    >
                      {pData.hex_dump.map((hex, i) => `${hex.padEnd(48, " ")} | ${pData.ascii_dump?.[i] || ""}\n`)}
                    </pre>
                  </div>
                )}

                <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
                  <a href={file.download_url} download className="btn btn-primary">
                    تحميل الملف بالكامل ({formatBytes(file.size)}) ⬇️
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* درج الملاحظات الجانبي */}
      {notesOpen && (
        <aside
          style={{
            position: "absolute",
            top: "60px",
            bottom: 0,
            left: 0,
            width: "360px",
            maxWidth: "90vw",
            background: "var(--card)",
            borderRight: "1px solid var(--border)",
            padding: "1.2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            boxShadow: "5px 0 25px rgba(0,0,0,0.5)",
            zIndex: 10,
          }}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>📝 ملاحظات وشروحات الملف</div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setNotesOpen(false)}
            >
              ✕
            </button>
          </div>

          <p className="small muted" style={{ margin: 0 }}>
            يمكنك تدوين ملاحظات دراسية وشروحات حول هذا الملف لحفظها داخل الخزينة:
          </p>

          <textarea
            className="input"
            rows={10}
            style={{ flex: 1, resize: "none" }}
            value={fileNotes}
            onChange={(e) => setFileNotes(e.target.value)}
            placeholder="اكتب ملاحظاتك وتلخيصك لهذا الملف هنا..."
          />

          <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
            <div>
              {notesFeedback && <span className="small" style={{ color: "var(--green)" }}>تم الحفظ بنجاح ✓</span>}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={savingNotes}
              onClick={handleSaveNotes}
            >
              {savingNotes ? <span className="spinner" /> : "حفظ الملاحظة"}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
