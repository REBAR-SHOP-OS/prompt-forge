// Shared core: low-level API client. Attaches JWT and normalizes errors.
// Module-specific calls live in src/modules/<domain>/api.ts and use this client.
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = "sacxoanuyetjfrfllkzx";
export const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;
const PUBLIC_FUNCTIONS = new Set(["/health"]);

let sessionRecoveryPromise: Promise<string | null> | null = null;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
  }
}

async function validAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const { error } = await supabase.auth.getUser(token);
  if (!error) return token;

  if (!sessionRecoveryPromise) {
    sessionRecoveryPromise = (async () => {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      const refreshedToken = refreshed.session?.access_token;
      if (!refreshError && refreshedToken) {
        const { error: verifyError } = await supabase.auth.getUser(refreshedToken);
        if (!verifyError) return refreshedToken;
      }

      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* noop */ }
      return null;
    })().finally(() => {
      sessionRecoveryPromise = null;
    });
  }

  return sessionRecoveryPromise;
}

async function authHeader(path: string): Promise<Record<string, string>> {
  const token = await validAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  if (PUBLIC_FUNCTIONS.has(path)) return {};
  throw new ApiError(401, "SESSION_EXPIRED", "Please sign in again.");
}

export type RequestInitWithTimeout = RequestInit & {
  /**
   * Abort the request after this many milliseconds. Without it a hung backend
   * call (e.g. a slow synchronous provider start in jobs-create) would leave a
   * fetch pending forever and freeze the UI's loading state. Omit to keep the
   * legacy no-timeout behavior.
   */
  timeoutMs?: number;
};

export async function request<T>(path: string, init: RequestInitWithTimeout = {}): Promise<T> {
  const { timeoutMs, ...fetchInit } = init;

  const buildHeaders = async (): Promise<Record<string, string>> => ({
    "Content-Type": "application/json",
    ...(await authHeader(path)),
    ...((fetchInit.headers as Record<string, string>) ?? {}),
  });

  // Each attempt (initial + post-refresh retry) gets its own controller/timer so
  // a timeout on one attempt never aborts the other.
  const doFetch = async () => {
    const headers = await buildHeaders();
    if (timeoutMs === undefined) {
      return fetch(`${FUNCTIONS_BASE}${path}`, { ...fetchInit, headers });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${FUNCTIONS_BASE}${path}`, {
        ...fetchInit,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError(408, "TIMEOUT", "The request took too long. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

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
  type ResponseBody = { error?: { code?: string; message?: string; details?: unknown }; requestId?: string } | null;
  let body: ResponseBody = null;
  try { body = text ? (JSON.parse(text) as ResponseBody) : null; } catch { /* keep as text */ }

  if (!res.ok) {
    const code = body?.error?.code ?? `HTTP_${res.status}`;
    const details = body?.error?.details;
    const detailText = details && typeof details === "object"
      ? Object.entries(details as Record<string, unknown>)
        .flatMap(([field, messages]) => Array.isArray(messages)
          ? messages.map((message) => `${field}: ${String(message)}`)
          : [`${field}: ${String(messages)}`])
        .join("; ")
      : null;
    const msg = body?.error?.message ?? detailText ?? res.statusText ?? "Request failed";
    throw new ApiError(res.status, code, msg, body?.requestId);
  }
  return body as T;
}
