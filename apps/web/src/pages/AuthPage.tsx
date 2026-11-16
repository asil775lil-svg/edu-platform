import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("teacher");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
