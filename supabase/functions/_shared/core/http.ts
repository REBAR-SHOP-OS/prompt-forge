// Shared core: CORS + JSON response helpers + request id.
//
// CORS hardening:
// - The legacy `corsHeaders` export remains a static object with `*` for
//   backwards-compat (auth here is Bearer in Authorization header, which the
//   browser cannot send cross-origin without explicit CORS approval — so `*`
//   alone is not a CSRF vector).
// - Prefer `getCorsHeaders(req)` which echoes the request Origin only when it
//   is on the allowlist (env `ALLOWED_APP_ORIGINS`, comma-separated, plus a
//   built-in safety list of lovable.app/lovableproject.com + localhost).
const DEFAULT_JSON_BODY_MAX_BYTES = 32_768;

const BASE_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

const BUILTIN_ORIGIN_SUFFIXES = [".lovable.app", ".lovableproject.com", ".sandbox.lovable.dev"];
const BUILTIN_ORIGIN_EXACT = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"];

function envAllowedOrigins(): string[] {
  try {
    const raw = Deno.env.get("ALLOWED_APP_ORIGINS") ?? "";
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (BUILTIN_ORIGIN_EXACT.includes(origin)) return true;
  if (envAllowedOrigins().includes(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (BUILTIN_ORIGIN_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) return true;
  } catch { /* ignore */ }
  return false;
}

export function getCorsHeaders(req?: Request, opts?: { exposeHeaders?: string; methods?: string }): Record<string, string> {
  const origin = req?.headers.get("origin") ?? null;
  const allowOrigin = isAllowedOrigin(origin) ? (origin as string) : "*";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": BASE_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": opts?.methods ?? "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
  if (opts?.exposeHeaders) headers["Access-Control-Expose-Headers"] = opts.exposeHeaders;
  return headers;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": BASE_ALLOWED_HEADERS,
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
