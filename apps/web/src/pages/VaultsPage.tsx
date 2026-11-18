import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Vault, VaultDetail, VaultFile } from "../lib/types";
import { VaultCreateModal } from "../components/VaultCreateModal";
import { VaultImportUrlModal } from "../components/VaultImportUrlModal";
import { VaultUploadModal } from "../components/VaultUploadModal";
import { VaultPreviewModal } from "../components/VaultPreviewModal";
import { VaultReaderModal } from "../components/VaultReaderModal";
import { Modal } from "../components/Modal";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 بايت";
  const k = 1024;
  const sizes = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

const CATEGORIES = [
  { id: "all", label: "جميع الصيغ" },
  { id: "document", label: "📄 مستندات" },
  { id: "archive", label: "📦 مضغوط وأرشيف" },
  { id: "media", label: "🎬 وسائط وصوت" },
  { id: "image", label: "🖼️ صور وتصاميم" },
  { id: "code", label: "💻 كود وبرمجة" },
  { id: "binary", label: "⚙️ برمجيات وحزم" },
];

function getCategoryColor(ext: string): { bg: string; color: string; icon: string } {
  const e = ext.toLowerCase();
  if ([".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso"].includes(e)) {
    return { bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", icon: "📦" };
  }
  if ([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".csv", ".epub"].includes(e)) {
    return { bg: "rgba(59, 130, 246, 0.15)", color: "#93c5fd", icon: "📄" };
  }
  if ([".mp4", ".webm", ".mkv", ".mov", ".mp3", ".wav", ".m4a", ".ogg"].includes(e)) {
    return { bg: "rgba(168, 85, 247, 0.15)", color: "#c084fc", icon: "🎬" };
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".psd", ".ai", ".blend"].includes(e)) {
    return { bg: "rgba(236, 72, 153, 0.15)", color: "#f472b6", icon: "🖼️" };
  }
  if ([".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".xml", ".sql", ".sh", ".ps1"].includes(e)) {
    return { bg: "rgba(16, 185, 129, 0.15)", color: "#6ee7b7", icon: "💻" };
  }
  if ([".exe", ".msi", ".apk", ".dmg", ".edupkg", ".bin"].includes(e)) {
    return { bg: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", icon: "⚙️" };
  }
  return { bg: "rgba(148, 163, 184, 0.15)", color: "#cbd5e1", icon: "📁" };
}

export default function VaultsPage() {
  const { vaultId } = useParams();
  const navigate = useNavigate();

  const [vaults, setVaults] = useState<Vault[] | null>(null);
  const [activeVault, setActiveVault] = useState<VaultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);
  const [importUrlModalOpen, setImportUrlModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<VaultFile | null>(null);
  const [readingFile, setReadingFile] = useState<VaultFile | null>(null);
  const [editingFile, setEditingFile] = useState<VaultFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [descValue, setDescValue] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function loadVaults() {
    try {
      setLoading(true);
      setError(null);
      const list = await api.vaults.list();
      setVaults(list);

      if (vaultId) {
        await loadVaultDetail(vaultId);
      } else if (list.length > 0 && !activeVault) {
        // إذا كنا على الصفحة الرئيسية للخزن، لا نلزم بالاختيار التلقائي لتوفير نظرة عامة
      }
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "تعذر تحميل الخزن");
    } finally {
      setLoading(false);
    }
  }

  async function loadVaultDetail(id: string, q = searchQuery, cat = selectedCategory) {
    try {
      const detail = await api.vaults.get(id, { q: q || undefined, category: cat || undefined });
      setActiveVault(detail);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "تعذر فتح الخزينة");
    }
  }

  useEffect(() => {
    loadVaults();
  }, [vaultId]);

  useEffect(() => {
    if (activeVault) {
      loadVaultDetail(activeVault.id, searchQuery, selectedCategory);
    }
  }, [searchQuery, selectedCategory]);

  function openVault(id: string) {
    navigate(`/vaults/${id}`);
    loadVaultDetail(id);
  }

  function backToOverview() {
    navigate("/vaults");
    setActiveVault(null);
  }

  async function handleSaveVault(data: { name: string; description: string; icon: string }) {
    if (editingVault) {
      const updated = await api.vaults.update(editingVault.id, data);
      setVaults((prev) => (prev ? prev.map((v) => (v.id === updated.id ? updated : v)) : null));
      if (activeVault?.id === updated.id) {
        setActiveVault((prev) => (prev ? { ...prev, ...updated } : null));
      }
    } else {
      const created = await api.vaults.create(data);
      setVaults((prev) => (prev ? [created, ...prev] : [created]));
      openVault(created.id);
    }
  }

  async function handleDeleteVault(id: string) {
    if (!window.confirm("هل أنت متأكد من رغبتك بحذف هذه الخزينة مع كافة ملفاتها ومحتوياتها؟")) {
      return;
    }
    try {
      await api.vaults.delete(id);
      setVaults((prev) => (prev ? prev.filter((v) => v.id !== id) : null));
      if (activeVault?.id === id) {
        backToOverview();
      }
    } catch {
      alert("تعذر حذف الخزينة");
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!activeVault) return;
    if (!window.confirm("هل أنت متأكد من حذف هذا الملف نهائياً من الخزينة؟")) return;
    try {
      await api.vaults.deleteFile(activeVault.id, fileId);
      setActiveVault((prev) =>
        prev
          ? {
              ...prev,
              file_count: Math.max(0, prev.file_count - 1),
              files: prev.files.filter((f) => f.id !== fileId),
            }
          : null
      );
      // تحديث قائمة الخزن العامة أيضاً
      setVaults((prev) =>
        prev
          ? prev.map((v) =>
              v.id === activeVault.id
                ? { ...v, file_count: Math.max(0, v.file_count - 1) }
                : v
            )
          : null
      );
    } catch {
      alert("تعذر حذف الملف");
    }
  }

  async function handleUpdateFileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeVault || !editingFile) return;
    try {
      const updated = await api.vaults.updateFile(activeVault.id, editingFile.id, {
        filename: renameValue.trim() || undefined,
        description: descValue.trim() || undefined,
      });
      setActiveVault((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) => (f.id === updated.id ? updated : f)),
            }
          : null
      );
      setEditingFile(null);
    } catch {
      alert("تعذر تحديث بيانات الملف");
    }
  }

  function copyFileUrl(downloadUrl: string, fileId: string) {
    const full = window.location.origin + downloadUrl;
    navigator.clipboard.writeText(full);
    setCopyFeedback(fileId);
    setTimeout(() => setCopyFeedback(null), 2000);
  }

  // حساب الإحصائيات الشاملة
  const totalVaultsCount = vaults?.length || 0;
  const totalFilesCount = vaults?.reduce((acc, v) => acc + v.file_count, 0) || 0;
  const totalStorageSize = vaults?.reduce((acc, v) => acc + v.total_size, 0) || 0;

  return (
    <div className="container" style={{ paddingBottom: "4rem" }}>
      {/* الشريط العلوي العام */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          margin: "1.5rem 0 1rem",
        }}
      >
        <div>
          <div className="row" style={{ gap: "0.5rem" }}>
            <span style={{ fontSize: "1.8rem" }}>🗄️</span>
            <h1 style={{ margin: 0, fontSize: "1.6rem" }}>
              خزائن الملفات والمستودعات الخارجية
            </h1>
          </div>
          <p className="muted" style={{ margin: "0.3rem 0 0" }}>
            حفظ وتنظيم الملفات المستوردة من جهات خارجية بجميع الصيغ دون قيود (مستندات، مضغوط، كود، وسائط، برمجيات).
          </p>
        </div>

        <div className="row" style={{ gap: "0.5rem" }}>
          {activeVault && (
            <button className="btn btn-ghost" onClick={backToOverview}>
              🔙 جميع الخزن
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingVault(null);
              setCreateModalOpen(true);
            }}
          >
            ➕ خزينة جديدة
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}

      {/* شريط الإحصائيات السريع */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "0.8rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          className="card"
          style={{
            padding: "0.9rem 1.2rem",
            background: "var(--card-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <div className="small muted">إجمالي الخزن المتاحة</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>
            {totalVaultsCount} خزينة
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "0.9rem 1.2rem",
            background: "var(--card-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <div className="small muted">الملفات المحفوظة المستوردة</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--green)" }}>
            {totalFilesCount} ملف (جميع الصيغ)
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "0.9rem 1.2rem",
            background: "var(--card-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <div className="small muted">المساحة المستهلكة</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--amber)" }}>
            {formatBytes(totalStorageSize)}
          </div>
        </div>
      </div>

      {/* الحالة 1: عرض نظرة عامة على الخزن (Overview) */}
      {!activeVault && (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.8rem" }}>
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>خزائني النشطة</h2>
            <span className="small muted">اختر خزينة لإدارة ملفاتها أو استيراد مواد جديدة</span>
          </div>

          {loading && !vaults ? (
            <div style={{ textAlign: "center", padding: "3rem" }}>
              <span className="spinner" /> جاري تحميل الخزن...
            </div>
          ) : vaults && vaults.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              {vaults.map((v) => (
                <div
                  key={v.id}
                  className="card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "1.2rem",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    transition: "transform 0.15s, border-color 0.15s",
                    cursor: "pointer",
                  }}
                  onClick={() => openVault(v.id)}
                >
                  <div>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.6rem" }}>
                      <span style={{ fontSize: "2rem" }}>{v.icon}</span>
                      <div className="row" style={{ gap: "0.3rem" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-btn"
                          title="تعديل"
                          onClick={() => {
                            setEditingVault(v);
                            setCreateModalOpen(true);
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-btn"
                          title="حذف الخزينة"
                          onClick={() => handleDeleteVault(v.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.3rem" }}>
                      {v.name}
                    </div>

                    <p
                      className="small muted"
                      style={{
                        margin: 0,
                        minHeight: "2.4em",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {v.description || "لا يوجد وصف مدخل لهذه الخزينة."}
                    </p>
                  </div>

                  <div
                    style={{
                      marginTop: "1.2rem",
                      paddingTop: "0.8rem",
                      borderTop: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span className="badge" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#bfdbfe" }}>
                      📁 {v.file_count} ملف
                    </span>
                    <span className="muted">{formatBytes(v.total_size)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: "3rem 1rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "0.8rem" }}>🗄️</div>
              <h3>لا توجد خزن ملفات حالياً</h3>
              <p className="muted" style={{ maxWidth: "450px", margin: "0.5rem auto 1.5rem" }}>
                أنشئ خزينة جديدة لتتمكن من استيراد وحفظ الملفات من جهات خارجية بجميع الصيغ دون أي قيود.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingVault(null);
                  setCreateModalOpen(true);
                }}
              >
                ➕ إنشاء أول خزينة الآن
              </button>
            </div>
          )}
        </>
      )}

      {/* الحالة 2: عرض تفاصيل خزينة محددة (Vault Detail View) */}
      {activeVault && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {/* ترويسة الخزينة الفعالة */}
          <div
            className="card"
            style={{
              padding: "1.4rem",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <div className="row" style={{ gap: "0.6rem" }}>
                  <span style={{ fontSize: "2rem" }}>{activeVault.icon}</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.4rem" }}>{activeVault.name}</h2>
                    <div className="row" style={{ gap: "0.8rem", marginTop: "0.2rem" }}>
                      <span className="small muted">
                        {activeVault.file_count} ملف محفوظة
                      </span>
                      <span className="small muted">·</span>
                      <span className="small muted">
                        السعة الإجمالية: {formatBytes(activeVault.total_size)}
                      </span>
                    </div>
                  </div>
                </div>
                {activeVault.description && (
                  <p className="muted" style={{ margin: "0.7rem 0 0", fontSize: "0.92rem" }}>
                    {activeVault.description}
                  </p>
                )}
              </div>

              {/* أزرار الاستيراد والرفع */}
              <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setImportUrlModalOpen(true)}
                  title="استيراد ملف من رابط ويب خارجي"
                >
                  🌐 استيراد من رابط خارجي
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: "var(--green)", borderColor: "var(--green)" }}
                  onClick={() => setUploadModalOpen(true)}
                  title="رفع ملفات بأي صيغة"
                >
                  📤 رفع واستيراد ملفات
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingVault(activeVault);
                    setCreateModalOpen(true);
                  }}
                >
                  ✏️ تعديل
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: "var(--danger)" }}
                  onClick={() => handleDeleteVault(activeVault.id)}
                >
                  🗑️
                </button>
              </div>
            </div>

            {/* شريط البحث وتصفية الصيغ */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.8rem",
                marginTop: "1.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div className="row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    className="btn btn-sm"
                    style={{
                      background: selectedCategory === cat.id ? "var(--primary-soft)" : "transparent",
                      borderColor: selectedCategory === cat.id ? "var(--primary)" : "var(--border)",
                      color: selectedCategory === cat.id ? "#93c5fd" : "var(--muted)",
                    }}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div style={{ minWidth: "220px" }}>
                <input
                  className="input input-sm"
                  placeholder="🔍 بحث في أسماء الملفات أو الوصف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* قائمة الملفات */}
          {activeVault.files.length === 0 ? (
            <div className="empty" style={{ padding: "3rem 1rem" }}>
              <div style={{ fontSize: "2.8rem", marginBottom: "0.5rem" }}>📂</div>
              <h3>لا توجد ملفات تطابق البحث أو الخزينة فارغة</h3>
              <p className="muted" style={{ maxWidth: "460px", margin: "0.5rem auto 1.5rem" }}>
                يمكنك استيراد ملفات من روابط خارجية مباشرة أو رفع ملفات بأي صيغة كانت (PDF, ZIP, DOCX, MP4, PY, EXE, ...).
              </p>
              <div className="row" style={{ justifyContent: "center", gap: "0.6rem" }}>
                <button className="btn btn-primary" onClick={() => setImportUrlModalOpen(true)}>
                  🌐 استيراد من رابط خارجي
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: "var(--green)", borderColor: "var(--green)" }}
                  onClick={() => setUploadModalOpen(true)}
                >
                  📤 رفع ملفات مباشرة
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
                gap: "0.9rem",
              }}
            >
              {activeVault.files.map((file) => {
                const badge = getCategoryColor(file.ext);
                return (
                  <div
                    key={file.id}
                    className="card"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "1rem",
                      background: "var(--card-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div>
                      {/* رأس بطاقة الملف */}
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}>
                        <span
                          className="badge"
                          style={{
                            background: badge.bg,
                            color: badge.color,
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <span>{badge.icon}</span>
                          <span>{file.ext ? file.ext.toUpperCase() : "ملف"}</span>
                        </span>

                        <div className="row" style={{ gap: "0.3rem" }}>
                          {file.source_type === "external_url" ? (
                            <span
                              className="badge"
                              title={`مستورد من: ${file.source_url || ""}`}
                              style={{
                                background: "rgba(59, 130, 246, 0.12)",
                                color: "#93c5fd",
                                fontSize: "0.75rem",
                              }}
                            >
                              🌐 خارجي
                            </span>
                          ) : (
                            <span
                              className="badge"
                              style={{
                                background: "rgba(16, 185, 129, 0.12)",
                                color: "#6ee7b7",
                                fontSize: "0.75rem",
                              }}
                            >
                              💻 رفع
                            </span>
                          )}
                        </div>
                      </div>

                      {/* اسم الملف — ينقر لفتح القارئ والمعاينة المباشرة */}
                      <div
                        onClick={() => setReadingFile(file)}
                        style={{
                          fontWeight: 600,
                          fontSize: "0.98rem",
                          lineHeight: 1.4,
                          marginBottom: "0.4rem",
                          wordBreak: "break-all",
                          cursor: "pointer",
                          color: "#bfdbfe",
                          transition: "color 0.15s",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--primary)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#bfdbfe")}
                        title="انقر لفتح الملف وقراءته من داخل الخزينة"
                      >
                        {file.filename}
                      </div>

                      {file.description && (
                        <div
                          className="small muted"
                          style={{
                            marginBottom: "0.5rem",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {file.description}
                        </div>
                      )}

                      <div className="row" style={{ gap: "0.8rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                        <span>{formatBytes(file.size)}</span>
                        <span>·</span>
                        <span>{new Date(file.created_at).toLocaleDateString("ar-SA")}</span>
                      </div>
                    </div>

                    {/* أزرار الإجراءات على الملف */}
                    <div
                      style={{
                        marginTop: "1rem",
                        paddingTop: "0.7rem",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div className="row" style={{ gap: "0.3rem" }}>
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ padding: "0.3rem 0.65rem", fontSize: "0.8rem" }}
                          title="فتح وقراءة الملف بصيغته الأصلية"
                          onClick={() => setReadingFile(file)}
                        >
                          📖 فتح وقراءة
                        </button>
                        <button
                          className="icon-btn"
                          title="بيانات وتفاصيل الملف"
                          onClick={() => setPreviewFile(file)}
                        >
                          ℹ️
                        </button>
                        <a
                          href={file.download_url}
                          download
                          className="icon-btn"
                          title="تحميل الملف"
                        >
                          ⬇️
                        </a>
                      </div>

                      <div className="row" style={{ gap: "0.3rem" }}>
                        <button
                          className="icon-btn"
                          title="نسخ رابط التحميل المباشر"
                          onClick={() => copyFileUrl(file.download_url, file.id)}
                        >
                          {copyFeedback === file.id ? "✓" : "📋"}
                        </button>
                        <button
                          className="icon-btn"
                          title="تعديل الاسم والملاحظات"
                          onClick={() => {
                            setEditingFile(file);
                            setRenameValue(file.filename);
                            setDescValue(file.description || "");
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-btn"
                          title="حذف الملف"
                          onClick={() => handleDeleteFile(file.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* نوافذ الحوار (Modals) */}
      {createModalOpen && (
        <VaultCreateModal
          vault={editingVault}
          onClose={() => setCreateModalOpen(false)}
          onSave={handleSaveVault}
        />
      )}

      {importUrlModalOpen && activeVault && (
        <VaultImportUrlModal
          vaultId={activeVault.id}
          vaultName={activeVault.name}
          onClose={() => setImportUrlModalOpen(false)}
          onSuccess={(newFile) => {
            setActiveVault((prev) =>
              prev
                ? {
                    ...prev,
                    file_count: prev.file_count + 1,
                    total_size: prev.total_size + newFile.size,
                    files: [newFile, ...prev.files],
                  }
                : null
            );
            setVaults((prev) =>
              prev
                ? prev.map((v) =>
                    v.id === activeVault.id
                      ? {
                          ...v,
                          file_count: v.file_count + 1,
                          total_size: v.total_size + newFile.size,
                        }
                      : v
                  )
                : null
            );
          }}
        />
      )}

      {uploadModalOpen && activeVault && (
        <VaultUploadModal
          vaultId={activeVault.id}
          vaultName={activeVault.name}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={(uploadedList) => {
            const addedSize = uploadedList.reduce((acc, f) => acc + f.size, 0);
            setActiveVault((prev) =>
              prev
                ? {
                    ...prev,
                    file_count: prev.file_count + uploadedList.length,
                    total_size: prev.total_size + addedSize,
                    files: [...uploadedList, ...prev.files],
                  }
                : null
            );
            setVaults((prev) =>
              prev
                ? prev.map((v) =>
                    v.id === activeVault.id
                      ? {
                          ...v,
                          file_count: v.file_count + uploadedList.length,
                          total_size: v.total_size + addedSize,
                        }
                      : v
                  )
                : null
            );
          }}
        />
      )}

      {readingFile && activeVault && (
        <VaultReaderModal
          file={readingFile}
          vaultId={activeVault.id}
          onClose={() => setReadingFile(null)}
        />
      )}

      {previewFile && (
        <VaultPreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {editingFile && (
        <Modal title="تعديل بيانات الملف" onClose={() => setEditingFile(null)}>
          <form onSubmit={handleUpdateFileSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label className="label">اسم الملف *</label>
              <input
                className="input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">الوصف أو الملاحظات</label>
              <textarea
                className="input"
                rows={3}
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                placeholder="ملاحظات حول مصدر الملف واستخدامه..."
              />
            </div>

            <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditingFile(null)}>
                إلغاء
              </button>
              <button type="submit" className="btn btn-primary">
                حفظ التعديلات
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
