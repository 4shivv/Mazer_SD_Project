import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Auth from "../lib/auth";

type AuthState = {
  user: Auth.MeResponse["user"] | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: Auth.MeResponse["user"] | null) => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Auth.MeResponse["user"] | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await Auth.me();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, setUser }), [user, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
