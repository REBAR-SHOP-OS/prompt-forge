// Shared core: auth context + provider. Domain modules consume `useAuth()`.
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { request } from "@/core/api/client";
import type { Me } from "@/core/api/types";

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Me | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

declare global {
  // Keeps AuthProvider/useAuth on the same context object across Vite HMR updates.
  // Without this, a stale Provider can briefly wrap a fresh useAuth hook and return undefined.
  // eslint-disable-next-line no-var
  var __AURA_CLIP_AUTH_CONTEXT__: ReturnType<typeof createContext<AuthState | undefined>> | undefined;
}

const AuthContext =
  globalThis.__AURA_CLIP_AUTH_CONTEXT__ ??
  (globalThis.__AURA_CLIP_AUTH_CONTEXT__ = createContext<AuthState | undefined>(undefined));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      const me = await request<Me>("/me");
      setProfile(me);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => { refreshProfile(); }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        refreshProfile().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const value = useMemo(
    () => ({ session, user, profile, loading, refreshProfile, signOut }),
    [session, user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
