// Backwards-compatible shim. New code should import from ./core/* and
// ./modules/<domain>/contract directly.
export { corsHeaders, jsonResponse, errorResponse, newRequestId } from "./core/http.ts";
export { getEnv } from "./core/env.ts";
export { getServiceClient, getUserScopedClient } from "./core/supabase.ts";
export type { SupabaseClient } from "./core/supabase.ts";
export { authenticate } from "./core/auth.ts";
export type { AuthContext } from "./core/auth.ts";
export { logInfo, logError, writeApiRequestLog } from "./core/observability.ts";
export type { RequestLogInput } from "./core/observability.ts";
export { writeAuditLog } from "./core/audit.ts";
export type { AuditLogInput } from "./core/audit.ts";
export { rateLimit } from "./core/ratelimit.ts";
