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
  githubProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
} from "./firebase";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, role: string) => Promise<void>;
  signInWithGoogle: (role?: string) => Promise<void>;
  signInWithGithub: (role?: string) => Promise<void>;
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
    let mounted = true;

    async function initAuth() {
      try {
        const u = await api.me();
        if (mounted && u) {
          setUser(u);
          setLoading(false);
          return;
        }
      } catch {
        // me() failed, check Firebase
      }

      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (!mounted) return;
        if (fbUser) {
          try {
            const idToken = await fbUser.getIdToken();
            const loggedUser = await api.firebaseLogin({
              id_token: idToken,
              role: "teacher",
              name: fbUser.displayName || undefined,
            });
            if (mounted) setUser(loggedUser);
          } catch {
            if (mounted) setUser(null);
          }
        } else {
          if (mounted) setUser(null);
        }
        if (mounted) setLoading(false);
      });

      return () => unsubscribe();
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      signIn: async (identifier, password) => {
        const isEmail = identifier.includes("@");
        if (isEmail) {
          try {
            const cred = await signInWithEmailAndPassword(auth, identifier.trim().toLowerCase(), password);
            const idToken = await cred.user.getIdToken();
            const loggedUser = await api.firebaseLogin({
              id_token: idToken,
              role: "teacher",
              name: cred.user.displayName || undefined,
            });
            setUser(loggedUser);
            return;
          } catch {
            // fallback to direct server login if Firebase sign-in was not used
          }
        }
        setUser(await api.login({ login: identifier, password }));
      },
      signUp: async (email, password, name, role) => {
        try {
          // تسجيل الحساب مركزياً في Firebase Authentication
          const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
          const idToken = await cred.user.getIdToken();
          const loggedUser = await api.firebaseLogin({
            id_token: idToken,
            role,
            name: name.trim(),
          });
          setUser(loggedUser);
        } catch (fbErr: unknown) {
          // إذا كان مسجلاً مسبقاً في Firebase أو تعذر الاتصال به، نسجل في السيرفر
          setUser(await api.register({ email, password, name, role }));
        }
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
      signInWithGithub: async (role = "teacher") => {
        const result = await signInWithPopup(auth, githubProvider);
        const idToken = await result.user.getIdToken();
        const loggedUser = await api.firebaseLogin({
          id_token: idToken,
          role,
          name: result.user.displayName || result.user.email?.split("@")[0] || undefined,
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
