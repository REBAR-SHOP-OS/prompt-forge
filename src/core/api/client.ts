// Shared core: low-level API client. Attaches JWT and normalizes errors.
// Module-specific calls live in src/modules/<domain>/api.ts and use this client.
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep as text */ }

  if (!res.ok) {
    const code = body?.error?.code ?? `HTTP_${res.status}`;
    const msg = body?.error?.message ?? res.statusText ?? "Request failed";
    if (res.status === 401) {
      // Session likely expired — sign out so guards redirect to login.
      await supabase.auth.signOut();
    }
    throw new ApiError(res.status, code, msg, body?.requestId);
  }
  return body as T;
}
