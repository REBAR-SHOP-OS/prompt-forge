// Shared core: auth context + provider. Domain modules consume `useAuth()`.
import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { request } from "@/core/api/client";
import type { Me } from "@/core/api/types";
import { AuthContext } from "@/core/auth/auth-context";

const LOADING_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const profileRequestRef = useRef<AbortController | null>(null);
  const profileGenerationRef = useRef(0);
  const authRevisionRef = useRef(0);
  const mountedRef = useRef(false);

  const applySession = useCallback((nextSession: Session | null) => {
    const previousUserId = sessionRef.current?.user.id ?? null;
    const nextUserId = nextSession?.user.id ?? null;
    sessionRef.current = nextSession;
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    if (previousUserId !== nextUserId) setProfile(null);
  }, []);

  const loadProfile = useCallback(async (expectedSession: Session | null) => {
    const expectedUserId = expectedSession?.user.id ?? null;
    profileRequestRef.current?.abort();
    const generation = ++profileGenerationRef.current;
    if (!expectedUserId) {
      if (mountedRef.current) setProfile(null);
      return;
    }

    const controller = new AbortController();
    profileRequestRef.current = controller;
    try {
      const me = await request<Me>("/me", { signal: controller.signal });
      if (
        mountedRef.current &&
        !controller.signal.aborted &&
        profileGenerationRef.current === generation &&
        sessionRef.current?.user.id === expectedUserId &&
        me.id === expectedUserId
      ) {
        setProfile(me);
      }
    } catch {
      if (
        mountedRef.current &&
        !controller.signal.aborted &&
        profileGenerationRef.current === generation &&
        sessionRef.current?.user.id === expectedUserId
      ) {
        setProfile(null);
      }
    } finally {
      if (profileRequestRef.current === controller) profileRequestRef.current = null;
    }
  }, []);

  const refreshProfile = useCallback(
    () => loadProfile(sessionRef.current),
    [loadProfile],
  );

  useEffect(() => {
    mountedRef.current = true;
    // Safety: never let the loading screen hang forever (slow network / cold edge).
    const timeoutId = window.setTimeout(() => setLoading(false), LOADING_TIMEOUT_MS);
    const finishLoading = () => {
      if (!mountedRef.current) return;
      window.clearTimeout(timeoutId);
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      authRevisionRef.current += 1;
      applySession(sess);
      if (sess?.user) {
        if (event === 'SIGNED_IN') {
          try {
            window.localStorage.setItem(`pending-fresh-start:${sess.user.id}`, '1');
            window.localStorage.setItem(`pending-occasions-popup:${sess.user.id}`, '1');
          } catch { /* ignore */ }
        }
      }
      void loadProfile(sess).finally(finishLoading);
    });

    const revisionAtStart = authRevisionRef.current;
    supabase.auth.getSession().then(({ data }) => {
      if (!mountedRef.current || authRevisionRef.current !== revisionAtStart) return;
      applySession(data.session);
      void loadProfile(data.session).finally(finishLoading);
    }).catch(() => {
      finishLoading();
    });

    return () => {
      mountedRef.current = false;
      profileGenerationRef.current += 1;
      profileRequestRef.current?.abort();
      profileRequestRef.current = null;
      window.clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, [applySession, loadProfile]);

  const signOut = useCallback(async () => {
    profileRequestRef.current?.abort();
    await supabase.auth.signOut();
    if (mountedRef.current) setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ session, user, profile, loading, refreshProfile, signOut }),
    [session, user, profile, loading, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
