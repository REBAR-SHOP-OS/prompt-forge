// Shared utilities for edge functions: CORS, auth, logging, audit, request context.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(code: string, message: string, status: number, requestId?: string) {
  return jsonResponse({ error: { code, message }, requestId }, status);
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function getEnv(name: string, required = true): string {
  const v = Deno.env.get(name);
  if (required && !v) throw new Error(`Missing env var: ${name}`);
  return v ?? "";
}

export function getServiceClient(): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getUserScopedClient(authHeader: string): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthContext {
  userId: string;
  email: string | null;
  authHeader: string;
}

/** Verify Supabase JWT via getClaims. Returns auth context or null on failure. */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const client = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"));
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    authHeader,
  };
}

export function logInfo(msg: string, meta: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level: "info", msg, ...meta, ts: new Date().toISOString() }));
}
export function logError(msg: string, meta: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ level: "error", msg, ...meta, ts: new Date().toISOString() }));
}

export interface RequestLogInput {
  requestId: string;
  userId?: string | null;
  route: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  providerKey?: string | null;
  modelKey?: string | null;
  estimatedCost?: number;
  errorCode?: string | null;
}

export async function writeApiRequestLog(svc: SupabaseClient, input: RequestLogInput) {
  const { error } = await svc.from("audit_api_request_logs").insert({
    request_id: input.requestId,
    user_id: input.userId ?? null,
    route: input.route,
    method: input.method,
    status_code: input.statusCode,
    latency_ms: input.latencyMs,
    provider_key: input.providerKey ?? null,
    model_key: input.modelKey ?? null,
    estimated_cost: input.estimatedCost ?? 0,
    error_code: input.errorCode ?? null,
  });
  if (error) logError("writeApiRequestLog failed", { error: error.message });
}

export interface AuditLogInput {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(svc: SupabaseClient, input: AuditLogInput) {
  const { error } = await svc.from("audit_audit_logs").insert({
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    request_id: input.requestId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) logError("writeAuditLog failed", { error: error.message });
}

// Naive in-memory rate limiter (per function instance).
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now > b.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
