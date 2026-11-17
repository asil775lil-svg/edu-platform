import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { useAuth } from "./lib/auth";

const AuthPage = lazy(() => import("./pages/AuthPage"));
const StudioPage = lazy(() => import("./pages/StudioPage"));
const CourseEditorPage = lazy(() => import("./pages/CourseEditorPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));
const VaultsPage = lazy(() => import("./pages/VaultsPage"));

function PageLoading() {
  return (
    <div className="auth-wrap" style={{ minHeight: "60vh" }}>
      <span className="spinner" />
    </div>
  );
}

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
    <Suspense fallback={<PageLoading />}>
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
          path="/vaults"
          element={
            <Protected>
              <VaultsPage />
            </Protected>
          }
        />
        <Route
          path="/vaults/:vaultId"
          element={
            <Protected>
              <VaultsPage />
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
    </Suspense>
  );
}
