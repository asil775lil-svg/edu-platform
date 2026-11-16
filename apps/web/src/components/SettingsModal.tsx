import { useState } from "react";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Modal } from "./Modal";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (newPassword) {
      if (newPassword.length < 8) {
        setError("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("كلمة المرور الجديدة غير متطابقة مع التأكيد.");
        return;
      }
      if (!currentPassword) {
        setError("يرجى إدخال كلمة المرور الحالية لتتمكن من تغييرها.");
        return;
      }
    }

    setBusy(true);
    try {
      await updateProfile({
        name: name.trim() !== user?.name ? name.trim() : undefined,
        email: email.trim().toLowerCase() !== user?.email ? email.trim().toLowerCase() : undefined,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });

      setNotice("تم حفظ الإعدادات وتحديث بيانات الحساب بنجاح.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل تحديث البيانات");
    } finally {
      setBusy(false);
    }
  }

  function copyPublicKey() {
    if (user?.public_key) {
      navigator.clipboard.writeText(user.public_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  }

  return (
    <Modal title="إعدادات الحساب" onClose={onClose}>
      <form onSubmit={handleSave} className="stack" style={{ gap: "1.1rem" }}>
        {notice && <div className="alert alert-success">{notice}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.8rem", color: "var(--muted)" }}>
            البيانات الأساسية
          </h3>
          <div className="stack" style={{ gap: "0.8rem" }}>
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

            <div className="between" style={{ padding: "0.4rem 0" }}>
              <span className="small muted">نوع الحساب</span>
              <span className="badge badge-green">
                {user?.role === "teacher" ? "معلّم / صانع محتوى" : "طالب"}
              </span>
            </div>

            {user?.public_key && (
              <div>
                <div className="between">
                  <span className="small muted">مفتاح التوقيع العام (Ed25519)</span>
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
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem" }}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.8rem", color: "var(--muted)" }}>
            تغيير كلمة المرور (اختياري)
          </h3>
          <div className="stack" style={{ gap: "0.8rem" }}>
            <div>
              <label className="label" htmlFor="current-pw">
                كلمة المرور الحالية
              </label>
              <input
                id="current-pw"
                className="input input-ltr"
                type="password"
                dir="ltr"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="أدخلها فقط إذا أردت تعيين كلمة مرور جديدة"
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
                placeholder="8 أحرف على الأقل"
                minLength={newPassword ? 8 : 0}
              />
            </div>

            {newPassword && (
              <div>
                <label className="label" htmlFor="confirm-pw">
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  id="confirm-pw"
                  className="input input-ltr"
                  type="password"
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور الجديدة"
                />
              </div>
            )}
          </div>
        </div>

        <div className="row" style={{ marginTop: "0.5rem" }}>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
            {busy && <span className="spinner" />}
            حفظ التغييرات
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}
