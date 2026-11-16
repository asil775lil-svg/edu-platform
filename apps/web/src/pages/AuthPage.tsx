import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AuthPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("teacher");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleGoogleLogin() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(role);
      navigate("/studio", { replace: true });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "auth/popup-closed-by-user") {
        return;
      }
      setError(err instanceof ApiError ? err.message : (e?.message || "تعذّر تسجيل الدخول عبر Google"));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await signIn(email, password);
      else await signUp(email, password, name, role);
      navigate("/studio", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-logo">🎓</div>
        <h1 style={{ fontSize: "1.35rem", margin: "0 0 0.2rem" }}>منظومة التعليم الذكية</h1>
        <p className="muted small" style={{ marginTop: 0, marginBottom: "1.2rem" }}>
          ابنِ منهجك مرة واحدة، وصدّره حاويةً مستقلة موقّعة.
        </p>

        <button
          type="button"
          className="btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
            marginBottom: "1rem",
            width: "100%",
            border: "1px solid var(--border)",
            background: "var(--card-bg, #fff)",
            cursor: "pointer",
            fontWeight: 500,
          }}
          onClick={handleGoogleLogin}
          disabled={busy}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          الدخول السريع بحساب Google
        </button>

        <div style={{ display: "flex", alignItems: "center", margin: "0.25rem 0 1rem", gap: "0.5rem", color: "var(--muted)" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          <span style={{ fontSize: "0.8rem" }}>أو بالبريد الإلكتروني</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </div>

        <div className="nav" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className={`btn btn-sm btn-ghost ${mode === "login" ? "btn-primary" : ""}`}
            style={{ flex: 1 }}
            onClick={() => setMode("login")}
          >
            دخول
          </button>
          <button
            type="button"
            className={`btn btn-sm btn-ghost ${mode === "register" ? "btn-primary" : ""}`}
            style={{ flex: 1 }}
            onClick={() => setMode("register")}
          >
            حساب جديد
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === "register" && (
            <>
              <div>
                <label className="label" htmlFor="name">
                  الاسم
                </label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={1}
                />
              </div>
              <div>
                <label className="label" htmlFor="role">
                  نوع الحساب
                </label>
                <select
                  id="role"
                  className="select"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                >
                  <option value="teacher">معلّم / صانع محتوى</option>
                  <option value="student">طالب</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="label" htmlFor="email">
              {mode === "login" ? "اسم المستخدم أو البريد الإلكتروني" : "البريد الإلكتروني"}
            </label>
            <input
              id="email"
              className={mode === "login" ? "input" : "input input-ltr"}
              type={mode === "login" ? "text" : "email"}
              dir={mode === "login" ? "auto" : "ltr"}
              placeholder={
                mode === "login"
                  ? "مثال: أ. محمد أو teacher@example.com"
                  : "name@example.com"
              }
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              كلمة المرور
            </label>
            <input
              id="password"
              className="input input-ltr"
              type="password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy && <span className="spinner" />}
            {mode === "login" ? "دخول" : "إنشاء الحساب"}
          </button>
        </form>
      </div>
    </div>
  );
}
