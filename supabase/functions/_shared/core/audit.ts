// Shared core: domain audit log writer.
import type { SupabaseClient } from "./supabase.ts";
import { logError } from "./observability.ts";

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
