// Shared core: CORS + JSON response helpers + request id.
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

export interface RequestContext {
  requestId: string;
  startedAt: number;
  route: string;
  method: string;
}

export function startRequest(req: Request, route: string): RequestContext {
  return {
    requestId: req.headers.get("x-request-id") ?? newRequestId(),
    startedAt: Date.now(),
    route,
    method: req.method,
  };
}
