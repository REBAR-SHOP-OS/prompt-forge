// Shared core: CORS + JSON response helpers + request id.
const DEFAULT_JSON_BODY_MAX_BYTES = 32_768;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function contentLength(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hasJsonContentType(req: Request): boolean {
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType) return false;
  return contentType === "application/json" || contentType.endsWith("+json");
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(code: string, message: string, status: number, requestId?: string) {
  return jsonResponse({ error: { code, message }, requestId }, status);
}

export async function readJsonBody<T>(
  req: Request,
  requestId?: string,
  maxBytes = DEFAULT_JSON_BODY_MAX_BYTES,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  if (!hasJsonContentType(req)) {
    return {
      ok: false,
      response: errorResponse(
        "UNSUPPORTED_MEDIA_TYPE",
        "Request body must be application/json",
        415,
        requestId,
      ),
    };
  }

  const declaredLength = contentLength(req);
  if (declaredLength !== null && declaredLength > maxBytes) {
    return {
      ok: false,
      response: errorResponse(
        "PAYLOAD_TOO_LARGE",
        `JSON body must be <= ${maxBytes} bytes`,
        413,
        requestId,
      ),
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return {
      ok: false,
      response: errorResponse("INVALID_JSON", "Invalid JSON body", 400, requestId),
    };
  }

  if (!raw.trim()) {
    return {
      ok: false,
      response: errorResponse("INVALID_JSON", "JSON body required", 400, requestId),
    };
  }

  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return {
      ok: false,
      response: errorResponse(
        "PAYLOAD_TOO_LARGE",
        `JSON body must be <= ${maxBytes} bytes`,
        413,
        requestId,
      ),
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      response: errorResponse("INVALID_JSON", "Invalid JSON body", 400, requestId),
    };
  }
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
