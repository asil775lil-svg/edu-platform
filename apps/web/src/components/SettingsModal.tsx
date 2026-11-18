import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AdminUser } from "../lib/types";
import { Modal } from "./Modal";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();

  const isEngineer = Boolean(
    user?.is_admin ||
      user?.role === "admin" ||
      user?.email?.toLowerCase() === "ze775co@gmail.com" ||
      ["زيكو", "zeco", "ze775co", "المهندس", "مدير المنصة", "أصيل 775"].includes(
        user?.name?.trim() || "",
      ),
  );

  type TabKey = "account" | "password" | "language" | "theme" | "users";
  const [activeTab, setActiveTab] = useState<TabKey>("account");

  // بيانات الحساب
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // تفضيلات اللغة والمظهر
  const [selectedLang, setSelectedLang] = useState(
    () => localStorage.getItem("edu_lang") || "ar",
  );
  const [selectedTheme, setSelectedTheme] = useState(
    () => localStorage.getItem("edu_theme") || "navy",
  );

  // بيانات إدارة المستخدمين (خاص بالمدير)
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  function fetchAdminUsers() {
    setLoadingUsers(true);
    setError(null);
    api.admin
      .getUsers()
      .then((res) => {
        setAdminUsers(res);
      })
      .catch((err) => {
        const msg =
          err instanceof ApiError && err.status === 404
            ? "خادم Render السحابي قيد اكتمال النشر. اضغط على 'Manual Deploy' في لوحة Render ثم أعد المحاولة."
            : err instanceof Error
            ? err.message
            : "تعذّر جلب قائمة المستخدمين";
        setError(msg);
      })
      .finally(() => setLoadingUsers(false));
  }

  // جلب المستخدمين عند فتح تبويب الإدارة
  useEffect(() => {
    if (activeTab === "users" && isEngineer && adminUsers.length === 0) {
      fetchAdminUsers();
    }
  }, [activeTab, isEngineer, adminUsers.length]);

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    setBusy(true);
    try {
      await updateProfile({
        name: name.trim() !== user?.name ? name.trim() : undefined,
        email:
          email.trim().toLowerCase() !== user?.email
            ? email.trim().toLowerCase()
            : undefined,
      });

      setNotice("تم تحديث بيانات الحساب بنجاح.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل تحديث البيانات");
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!currentPassword) {
      setError("يرجى إدخال كلمة المرور الحالية لتتمكن من تغييرها.");
      return;
    }
    if (newPassword.length < 8) {
      setError("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمة المرور الجديدة غير متطابقة مع التأكيد.");
      return;
    }

    setBusy(true);
    try {
      await updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setNotice("تم تغيير كلمة المرور بنجاح.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل تغيير كلمة المرور");
    } finally {
      setBusy(false);
    }
  }

  function handleSaveLanguage(lang: string) {
    setSelectedLang(lang);
    localStorage.setItem("edu_lang", lang);
    setNotice(
      lang === "ar"
        ? "تم حفظ اللغة: العربية 🇾🇪 (اللغة المفعلة)."
        : "تم حفظ اختيار اللغة الإنجليزية 🇺🇸 (سيتم تطبيق الترجمة الكاملة في التحديث القادم).",
    );
  }

  function handleSaveTheme(theme: string) {
    setSelectedTheme(theme);
    localStorage.setItem("edu_theme", theme);
    setNotice("تم حفظ خيار المظهر وسيقوم النظام بتطبيقه كتفضيل شخصي.");
  }

  function copyPublicKey() {
    if (user?.public_key) {
      navigator.clipboard.writeText(user.public_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  }

  const fallbackUsers: AdminUser[] = user
    ? [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: "admin",
          created_at: new Date().toISOString(),
          courses_count: 0,
          vaults_count: 0,
          is_engineer: true,
        },
      ]
    : [];

  const effectiveUsers = adminUsers.length > 0 ? adminUsers : fallbackUsers;

  const filteredUsers = effectiveUsers.filter((u) => {
    if (!usersSearch.trim()) return true;
    const q = usersSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <Modal title="⚙️ إعدادات المنصة والحساب" onClose={onClose}>
      <div className="stack" style={{ gap: "1rem" }}>
        {notice && <div className="alert alert-success">{notice}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {/* شريط التبويبات العلوي */}
        <div
          className="row"
          style={{
            gap: "0.4rem",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "0.6rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "account" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setActiveTab("account");
              setNotice(null);
              setError(null);
            }}
          >
            👤 بيانات الحساب
          </button>

          <button
            type="button"
            className={`btn btn-sm ${activeTab === "password" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setActiveTab("password");
              setNotice(null);
              setError(null);
            }}
          >
            🔒 كلمة المرور
          </button>

          <button
            type="button"
            className={`btn btn-sm ${activeTab === "language" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setActiveTab("language");
              setNotice(null);
              setError(null);
            }}
          >
            🌐 اللغة
          </button>

          <button
            type="button"
            className={`btn btn-sm ${activeTab === "theme" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setActiveTab("theme");
              setNotice(null);
              setError(null);
            }}
          >
            🎨 مظهر الشاشة
          </button>

          {isEngineer && (
            <button
              type="button"
              className={`btn btn-sm ${activeTab === "users" ? "btn-primary" : "btn-outline"}`}
              style={{
                borderColor: "#f59e0b",
                color: activeTab === "users" ? "#fff" : "#fbbf24",
                background:
                  activeTab === "users" ? "#d97706" : "rgba(245, 158, 11, 0.1)",
                fontWeight: 700,
              }}
              onClick={() => {
                setActiveTab("users");
                setNotice(null);
                setError(null);
              }}
              title="لوحة تحكم خاصة بالمهندس ومدير المنصة لمشاهدة جميع المستخدمين"
            >
              👑 إدارة المستخدمين
            </button>
          )}
        </div>

        {/* 1. تبويب بيانات الحساب */}
        {activeTab === "account" && (
          <form onSubmit={handleSaveAccount} className="stack" style={{ gap: "0.9rem" }}>
            <div className="between" style={{ padding: "0.4rem 0" }}>
              <span className="small muted">نوع الصلاحية</span>
              {isEngineer ? (
                <span
                  className="badge"
                  style={{
                    background: "linear-gradient(135deg, #d97706, #b45309)",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  👑 المهندس / مدير المنصة
                </span>
              ) : (
                <span className="badge badge-green">
                  {user?.role === "teacher" ? "معلّم / صانع محتوى" : "طالب"}
                </span>
              )}
            </div>

            <div>
              <label className="label" htmlFor="set-name">
                اسم المستخدم / الاسم المعروض
              </label>
              <input
                id="set-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
              />
            </div>

            <div>
              <label className="label" htmlFor="set-email">
                البريد الإلكتروني
              </label>
              <input
                id="set-email"
                className="input input-ltr"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {user?.public_key && (
              <div style={{ marginTop: "0.4rem" }}>
                <div className="between">
                  <span className="small muted">مفتاح التوقيع الرقمي الموثوق (Ed25519)</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={copyPublicKey}
                    style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                  >
                    {copiedKey ? "تم النسخ ✓" : "نسخ المفتاح"}
                  </button>
                </div>
                <code
                  dir="ltr"
                  className="bidi-ltr"
                  style={{
                    display: "block",
                    padding: "0.4rem 0.6rem",
                    fontSize: "0.72rem",
                    wordBreak: "break-all",
                    background: "var(--card-2)",
                    borderRadius: "6px",
                    marginTop: "0.25rem",
                  }}
                >
                  {user.public_key}
                </code>
              </div>
            )}

            <div className="row" style={{ marginTop: "0.6rem" }}>
              <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
                {busy && <span className="spinner" />}
                حفظ التعديلات
              </button>
            </div>
          </form>
        )}

        {/* 2. تبويب تغيير كلمة المرور */}
        {activeTab === "password" && (
          <form onSubmit={handleSavePassword} className="stack" style={{ gap: "0.9rem" }}>
            <p className="small muted">
              يمكنك تعيين كلمة مرور جديدة لحسابك. تأكد من إدخال كلمة المرور الحالية أولاً للتحقق من هويتك.
            </p>

            <div>
              <label className="label" htmlFor="cur-pw">
                كلمة المرور الحالية
              </label>
              <input
                id="cur-pw"
                className="input input-ltr"
                type="password"
                dir="ltr"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="أدخل كلمة مرورك الحالية"
              />
            </div>

            <div>
              <label className="label" htmlFor="new-pw">
                كلمة المرور الجديدة
              </label>
              <input
                id="new-pw"
                className="input input-ltr"
                type="password"
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="8 أحرف أو أرقام على الأقل"
              />
            </div>

            <div>
              <label className="label" htmlFor="conf-pw">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                id="conf-pw"
                className="input input-ltr"
                type="password"
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="أعد إدخال كلمة المرور للتأكيد"
              />
            </div>

            <div className="row" style={{ marginTop: "0.6rem" }}>
              <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
                {busy && <span className="spinner" />}
                تحديث كلمة المرور الآن
              </button>
            </div>
          </form>
        )}

        {/* 3. تبويب تغيير اللغة */}
        {activeTab === "language" && (
          <div className="stack" style={{ gap: "1rem" }}>
            <p className="small muted">
              اختر اللغة المفضلة لواجهة المنصة. الواجهة تدعم حالياً اللغة العربية بالكامل، مع خيار تجهيزي للغات الأخرى:
            </p>

            <div className="stack" style={{ gap: "0.6rem" }}>
              <label
                className="card card-flat row"
                style={{
                  cursor: "pointer",
                  padding: "0.8rem 1rem",
                  border: selectedLang === "ar" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  alignItems: "center",
                  gap: "0.8rem",
                }}
              >
                <input
                  type="radio"
                  name="app-lang"
                  checked={selectedLang === "ar"}
                  onChange={() => handleSaveLanguage("ar")}
                />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "0.95rem" }}>العربية (Arabic) 🇾🇪</strong>
                  <div className="small muted">اللغة الأساسية للمنصة — مفعّلة ونشطة بالكامل</div>
                </div>
                <span className="badge badge-green">مفعل</span>
              </label>

              <label
                className="card card-flat row"
                style={{
                  cursor: "pointer",
                  padding: "0.8rem 1rem",
                  border: selectedLang === "en" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  alignItems: "center",
                  gap: "0.8rem",
                  opacity: 0.85,
                }}
              >
                <input
                  type="radio"
                  name="app-lang"
                  checked={selectedLang === "en"}
                  onChange={() => handleSaveLanguage("en")}
                />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: "0.95rem" }}>English (الإنجليزية) 🇺🇸</strong>
                  <div className="small muted">واجهة مترجمة للمنهاج الدولي — (قيد التجهيز)</div>
                </div>
                <span className="badge badge-amber">قيد التفعيل</span>
              </label>
            </div>

            <div
              className="card card-flat"
              style={{
                background: "rgba(14, 165, 233, 0.08)",
                border: "1px dashed #0284c7",
                fontSize: "0.85rem",
                lineHeight: 1.6,
              }}
            >
              💡 <strong>تنبيه:</strong> تم حفظ اختيارك. سيتم تطبيق الترجمة الشاملة لكافة الأزرار والقوائم في التحديث التالي لتمكين التبديل الفوري بنقرة واحدة.
            </div>
          </div>
        )}

        {/* 4. تبويب تغيير لون الشاشة / المظهر */}
        {activeTab === "theme" && (
          <div className="stack" style={{ gap: "1rem" }}>
            <p className="small muted">
              اختر المظهر والسمة اللونية المناسبة لك (داكن مريح للعين، أسود ليلي، أو ألوان مخصصة):
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.7rem",
              }}
            >
              {[
                { id: "navy", name: "🌌 كحلي ليلي (الافتراضي)", desc: "الأزرق الداكن الكلاسيكي للمنصة", color: "#0f172a" },
                { id: "black", name: "🌑 أسود فاخر (OLED)", desc: "أسود فاحم عميق لتوفير البطارية", color: "#000000" },
                { id: "emerald", name: "🌿 أخضر زمردي", desc: "أجواء علمية مريحة للعين", color: "#064e3b" },
                { id: "purple", name: "🔮 أرجواني ملكي", desc: "تصميم أنيق متدرج", color: "#3b0764" },
              ].map((thm) => (
                <div
                  key={thm.id}
                  onClick={() => handleSaveTheme(thm.id)}
                  style={{
                    padding: "0.8rem",
                    borderRadius: "8px",
                    border: selectedTheme === thm.id ? "2px solid #38bdf8" : "1px solid var(--border)",
                    background: thm.color,
                    cursor: "pointer",
                    color: "#fff",
                    position: "relative",
                  }}
                >
                  <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>
                    {thm.name}
                  </strong>
                  <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>{thm.desc}</span>
                  {selectedTheme === thm.id && (
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        background: "#38bdf8",
                        color: "#000",
                        borderRadius: "50%",
                        width: 18,
                        height: 18,
                        fontSize: "0.7rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div
              className="card card-flat"
              style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px dashed #9333ea",
                fontSize: "0.85rem",
                lineHeight: 1.6,
              }}
            >
              🎨 <strong>تفضيل المظهر:</strong> تم تسجيل اختيارك للمظهر بنجاح، ويتم حفظه في المتصفح ليتم تفعيله وتطبيقه على كافة أرجاء المنصة.
            </div>
          </div>
        )}

        {/* 5. تبويب إدارة المستخدمين (خاص بالمهندس / مدير المنصة) */}
        {activeTab === "users" && isEngineer && (
          <div className="stack" style={{ gap: "0.9rem" }}>
            <div className="between" style={{ alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <strong style={{ fontSize: "1.05rem", color: "#fbbf24" }}>
                  👑 لوحة المهندس — سجل مستخدمي المنصة
                </strong>
                <div className="small muted">
                  عرض تفصيلي لجميع الحسابات التي قامت بالتسجيل واستخدام المنصة التعليمية
                </div>
              </div>

              <div className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={fetchAdminUsers}
                  disabled={loadingUsers}
                  style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                  title="إعادة جلب القائمة من السيرفر"
                >
                  🔄 تحديث
                </button>
                <span className="badge" style={{ background: "#d97706", color: "#fff", fontWeight: 700 }}>
                  إجمالي المسجلين: {effectiveUsers.length} مستخدم
                </span>
              </div>
            </div>

            <input
              className="input input-sm"
              placeholder="🔍 بحث بالاسم أو البريد الإلكتروني..."
              value={usersSearch}
              onChange={(e) => setUsersSearch(e.target.value)}
            />

            {loadingUsers ? (
              <div style={{ textAlign: "center", padding: "1.5rem" }}>
                <span className="spinner" />
                <div className="small muted" style={{ marginTop: "0.4rem" }}>
                  جارٍ تحميل بيانات المستخدمين من السحابة...
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="small muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                لا توجد نتائج مطابقة للبحث.
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "var(--card-2)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "right" }}>المستخدم</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "right" }}>البريد الإلكتروني</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "center" }}>نوع الصلاحية</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "center" }}>المواد / الخزن</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "center" }}>تاريخ الانضمام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const isTargetEng =
                        u.is_engineer ||
                        u.email.toLowerCase() === "ze775co@gmail.com" ||
                        ["زيكو", "zeco", "ze775co"].includes(u.name.toLowerCase());

                      return (
                        <tr
                          key={u.id}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: isTargetEng ? "rgba(245, 158, 11, 0.08)" : "transparent",
                          }}
                        >
                          <td style={{ padding: "0.5rem 0.7rem", fontWeight: 600 }}>
                            {u.name}
                            {isTargetEng && (
                              <span
                                style={{
                                  marginInlineStart: "0.3rem",
                                  fontSize: "0.7rem",
                                  color: "#fbbf24",
                                }}
                              >
                                (المهندس 🛠️)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem 0.7rem" }} dir="ltr" className="bidi-ltr">
                            {u.email}
                          </td>
                          <td style={{ padding: "0.5rem 0.7rem", textAlign: "center" }}>
                            {isTargetEng ? (
                              <span className="badge" style={{ background: "#d97706", color: "#fff" }}>
                                مدير / مهندس
                              </span>
                            ) : u.role === "teacher" ? (
                              <span className="badge badge-green">معلّم</span>
                            ) : (
                              <span className="badge badge-blue">طالب</span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem 0.7rem", textAlign: "center" }}>
                            📚 {u.courses_count} مادة | 🗄️ {u.vaults_count}
                          </td>
                          <td style={{ padding: "0.5rem 0.7rem", textAlign: "center", opacity: 0.75 }}>
                            {new Date(u.created_at).toLocaleDateString("ar-EG", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: "0.5rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}
