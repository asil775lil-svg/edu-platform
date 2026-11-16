import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import {
  auth,
  googleProvider,
  signInWithPopup,
  firebaseSignOut,
} from "./firebase";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, role: string) => Promise<void>;
  signInWithGoogle: (role?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (body: {
    name?: string;
    email?: string;
    current_password?: string;
    new_password?: string;
  }) => Promise<User>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      signIn: async (identifier, password) => {
        setUser(await api.login({ login: identifier, password }));
      },
      signUp: async (email, password, name, role) => {
        setUser(await api.register({ email, password, name, role }));
      },
      signInWithGoogle: async (role = "teacher") => {
        const result = await signInWithPopup(auth, googleProvider);
        const idToken = await result.user.getIdToken();
        const loggedUser = await api.firebaseLogin({
          id_token: idToken,
          role,
          name: result.user.displayName || undefined,
        });
        setUser(loggedUser);
      },
      signOut: async () => {
        await api.logout();
        try {
          await firebaseSignOut(auth);
        } catch {
          // ignore
        }
        setUser(null);
      },
      updateProfile: async (body) => {
        const updated = await api.updateProfile(body);
        setUser(updated);
        return updated;
      },
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth خارج AuthProvider");
  return context;
}
