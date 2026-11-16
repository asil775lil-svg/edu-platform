import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { useAuth } from "./lib/auth";
import AuthPage from "./pages/AuthPage";
import CourseEditorPage from "./pages/CourseEditorPage";
import LibraryPage from "./pages/LibraryPage";
import ReaderPage from "./pages/ReaderPage";
import StudioPage from "./pages/StudioPage";
import type { ReactNode } from "react";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="auth-wrap">
        <span className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? null : user ? <Navigate to="/studio" replace /> : <AuthPage />}
      />
      <Route
        path="/"
        element={<Navigate to={user ? "/studio" : "/login"} replace />}
      />
      <Route
        path="/studio"
        element={
          <Protected>
            <StudioPage />
          </Protected>
        }
      />
      <Route
        path="/studio/:courseId"
        element={
          <Protected>
            <CourseEditorPage />
          </Protected>
        }
      />
      <Route
        path="/library"
        element={
          <Protected>
            <LibraryPage />
          </Protected>
        }
      />
      <Route
        path="/library/:courseId"
        element={
          <Protected>
            <ReaderPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
