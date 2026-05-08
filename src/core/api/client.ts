// Shared core: low-level API client. Attaches JWT and normalizes errors.
// Module-specific calls live in src/modules/<domain>/api.ts and use this client.
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = "sacxoanuyetjfrfllkzx";
export const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const buildHeaders = async (): Promise<Record<string, string>> => ({
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) ?? {}),
  });

  const doFetch = async () =>
    fetch(`${FUNCTIONS_BASE}${path}`, { ...init, headers: await buildHeaders() });

  let res = await doFetch();

  // On 401, try refreshing the session once and retry; if still 401, sign out locally.
  if (res.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session?.access_token) {
      res = await doFetch();
    }
    if (res.status === 401) {
      // Local-only signOut avoids the 403 round-trip when the server session is already gone.
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
    }
  }

  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep as text */ }

  if (!res.ok) {
    const code = body?.error?.code ?? `HTTP_${res.status}`;
    const msg = body?.error?.message ?? res.statusText ?? "Request failed";
    throw new ApiError(res.status, code, msg, body?.requestId);
  }
  return body as T;
}
