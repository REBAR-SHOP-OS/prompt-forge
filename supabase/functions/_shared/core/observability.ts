// Shared core: structured logs + api request log writer.
import type { SupabaseClient } from "./supabase.ts";

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
