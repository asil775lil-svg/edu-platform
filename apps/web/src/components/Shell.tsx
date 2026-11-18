import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { SettingsModal } from "./SettingsModal";

export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isEngineer = Boolean(
    user?.is_admin ||
      user?.role === "admin" ||
      user?.email?.toLowerCase() === "ze775co@gmail.com" ||
      ["زيكو", "zeco", "ze775co", "المهندس", "مدير المنصة", "أصيل 775"].includes(
        user?.name?.trim() || "",
      ),
  );

  return (
    <>
      <header className="topbar">
        <div className="brand" onClick={() => navigate("/studio")} style={{ cursor: "pointer" }}>
          <div className="brand-mark">🎓</div>
          <div>
            <div style={{ lineHeight: 1.2 }}>منظومة التعليم الذكية</div>
            <div className="small muted" style={{ fontWeight: 500, lineHeight: 1.2 }}>
              استوديو · خزائن · حقيبة
            </div>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/studio" className={({ isActive }) => (isActive ? "active" : "")}>
            الاستوديو
          </NavLink>
          <NavLink to="/vaults" className={({ isActive }) => (isActive ? "active" : "")}>
            🗄️ الخزائن
          </NavLink>
          <NavLink to="/library" className={({ isActive }) => (isActive ? "active" : "")}>
            حقيبتي
          </NavLink>
        </nav>

        <div className="row" style={{ gap: "0.4rem" }}>
          <div style={{ textAlign: "left", marginInlineEnd: "0.3rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{user?.name}</div>
            <div className="small muted">
              {isEngineer ? (
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                  👑 المهندس / مدير المنصة
                </span>
              ) : user?.role === "teacher" ? (
                "معلّم / صانع محتوى"
              ) : (
                "طالب"
              )}
            </div>
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setSettingsOpen(true)}
            title="إعدادات الحساب وتغيير كلمة المرور"
          >
            ⚙️ الإعدادات
          </button>
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {children}
    </>
  );
}
