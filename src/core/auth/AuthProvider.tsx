// Shared core: auth context + provider. Domain modules consume `useAuth()`.
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
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

const AuthContext = createContext<AuthState | undefined>(undefined);

const LOADING_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = useRef(false);

  const refreshProfile = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const me = await request<Me>("/me");
      setProfile(me);
    } catch {
      setProfile(null);
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    // Safety: never let the loading screen hang forever (slow network / cold edge).
    const timeoutId = window.setTimeout(() => setLoading(false), LOADING_TIMEOUT_MS);

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        if (event === 'SIGNED_IN') {
          try {
            window.localStorage.setItem(`pending-fresh-start:${sess.user.id}`, '1');
            window.localStorage.setItem(`pending-occasions-popup:${sess.user.id}`, '1');
          } catch { /* ignore */ }
        }
        setTimeout(() => { refreshProfile(); }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        refreshProfile().finally(() => {
          window.clearTimeout(timeoutId);
          setLoading(false);
        });
      } else {
        window.clearTimeout(timeoutId);
        setLoading(false);
      }
    }).catch(() => {
      window.clearTimeout(timeoutId);
      setLoading(false);
    });

    return () => {
      window.clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
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
