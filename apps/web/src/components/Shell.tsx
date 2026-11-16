import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";

export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <header className="topbar">
        <div className="brand" onClick={() => navigate("/studio")} style={{ cursor: "pointer" }}>
          <div className="brand-mark">🎓</div>
          <div>
            <div style={{ lineHeight: 1.2 }}>منظومة التعليم الذكية</div>
            <div className="small muted" style={{ fontWeight: 500, lineHeight: 1.2 }}>
              استوديو · حقيبة
            </div>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/studio" className={({ isActive }) => (isActive ? "active" : "")}>
            الاستوديو
          </NavLink>
          <NavLink to="/library" className={({ isActive }) => (isActive ? "active" : "")}>
            حقيبتي
          </NavLink>
        </nav>

        <div className="row">
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{user?.name}</div>
            <div className="small muted">
              {user?.role === "teacher" ? "معلّم / صانع محتوى" : "طالب"}
            </div>
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            خروج
          </button>
        </div>
      </header>
      {children}
    </>
  );
}
