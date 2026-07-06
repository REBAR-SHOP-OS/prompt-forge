// Routed at /.lovable/oauth/consent — the Supabase OAuth 2.1 authorization-server
// consent screen. Because the app uses HashRouter, App.tsx renders this component
// directly when window.location.pathname matches, bypassing the normal Gate.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/AuthProvider";
import AuthForm from "@/components/auth/AuthForm";
import LoadingScreen from "@/core/ui/LoadingScreen";

// `supabase.auth.oauth` is a beta namespace not yet in the typed client.
type AuthorizationDetails = {
  client?: { name?: string };
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export default function OAuthConsent() {
  const { session, loading: authLoading } = useAuth();
  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      if (authLoading || !session) return;
      const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, session, authLoading]);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("No redirect returned by the authorization server.");
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">Authorization error</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
      </main>
    );
  }

  if (authLoading) return <LoadingScreen />;

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in to continue</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to authorize this app to connect to your account.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card/40 p-6 shadow-2xl backdrop-blur-xl">
          <AuthForm mode="login" />
        </div>
      </main>
    );
  }

  if (!details) return <LoadingScreen />;

  const clientName = details.client?.name ?? "an application";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div className="rounded-2xl border border-white/10 bg-card/40 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Connect {clientName}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This lets <strong>{clientName}</strong> access Prompt Forge as you — reading your
          generation jobs, videos, and credit balance.
        </p>
        <div className="mt-8 flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/5 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
