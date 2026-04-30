// Centralized backend API layer. Attaches JWT to all calls and handles 401/403.
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, { ...init, headers });
  const text = await res.text();
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

export interface Me {
  id: string;
  email: string;
  role: "user" | "admin";
  credits_balance: number;
  created_at: string;
  requestId?: string;
}

export const api = {
  health: () => request<{ status: string; version: string; timestamp: string }>("/health"),
  me: () => request<Me>("/me"),
  credits: () => request<{ credits_balance: number; requestId?: string }>("/usage-credits"),
  routePreview: (input: { providerKey: "flow" | "wan"; requestedModel?: string; prompt: string }) =>
    request<{ providerKey: string; resolvedModel: string; estimatedCost: number; requestId: string }>(
      "/ai-gateway-route-preview",
      { method: "POST", body: JSON.stringify(input) },
    ),
};
