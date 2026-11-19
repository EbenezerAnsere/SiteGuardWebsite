import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, type User } from "./api";
import { Spinner } from "./components/ui";

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>("/auth/me")).data.user;
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
  });

  const signIn = useMutation({
    mutationFn: async ({ mode, email, password }: { mode: "login" | "register"; email: string; password: string }) =>
      (await api.post<{ user: User }>(`/auth/${mode}`, { email, password })).data.user,
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });

  // Mark the user signed out and drop every cached page of their data. The "me" query is
  // updated in place (not removed) so this provider's observer sees the change immediately.
  const signOutLocally = useCallback(() => {
    qc.setQueryData(["me"], null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  }, [qc]);

  // If the session expires (any API call answers 401), sign the UI out too.
  useEffect(() => {
    const id = api.interceptors.response.use(undefined, (err) => {
      if (err instanceof AxiosError && err.response?.status === 401 && !err.config?.url?.startsWith("/auth/")) {
        signOutLocally();
      }
      return Promise.reject(err);
    });
    return () => api.interceptors.response.eject(id);
  }, [signOutLocally]);

  const value: AuthValue = {
    user: me.data ?? null,
    loading: me.isLoading,
    login: async (email, password) => void (await signIn.mutateAsync({ mode: "login", email, password })),
    register: async (email, password) => void (await signIn.mutateAsync({ mode: "register", email, password })),
    logout: async () => {
      try {
        await api.post("/auth/logout");
      } finally {
        // Even if the request fails (e.g. server down), don't leave the user stuck signed in.
        signOutLocally();
      }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
