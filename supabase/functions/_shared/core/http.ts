// Shared core: CORS + JSON response helpers + request id.
import { getEnv } from "./env.ts";

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function configuredOrigins(): string[] {
  const many = getEnv("CORS_ALLOW_ORIGINS", false)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (many.length > 0) return [...new Set(many)];

  const single = getEnv("CORS_ALLOW_ORIGIN", false).trim();
  if (single) return [single];

  return DEFAULT_DEV_ORIGINS;
}

// Origins from Lovable's preview/published infrastructure are always
// allow-listed so the deployed app (and its preview iframe) can reach the
// backend without per-project CORS configuration. Custom origins can still be
// added via CORS_ALLOW_ORIGINS / CORS_ALLOW_ORIGIN env vars.
const LOVABLE_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https?:\/\/([a-z0-9-]+\.)*lovable\.dev$/i,
  /^https?:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https?:\/\/([a-z0-9-]+\.)*sandbox\.lovable\.dev$/i,
];

function isLovableOrigin(origin: string): boolean {
  return LOVABLE_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function allowedOrigin(req?: Request): string | null {
  const origins = configuredOrigins();
  const origin = req?.headers.get("origin")?.trim();
  if (!origin) {
    return origins.length === 1 ? origins[0] : null;
  }
  if (origins.includes(origin)) return origin;
  if (isLovableOrigin(origin)) return origin;
  return null;
}

function baseSecurityHeaders(): Record<string, string> {
  return {
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export function corsHeaders(
  req?: Request,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, HEAD, OPTIONS",
    "Vary": "Origin",
    ...baseSecurityHeaders(),
    ...extraHeaders,
  };
}

export function preflightResponse(
  req: Request,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response("ok", {
    headers: corsHeaders(req, {
      "Access-Control-Max-Age": "600",
      ...extraHeaders,
    }),
  });
}

export function jsonResponse(
  req: Request | undefined,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  const requestId =
    typeof body === "object" && body !== null && "requestId" in body &&
      typeof (body as { requestId?: unknown }).requestId === "string"
      ? (body as { requestId: string }).requestId
      : undefined;

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  req: Request | undefined,
  code: string,
  message: string,
  status: number,
  requestId?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(req, { error: { code, message }, requestId }, status, extraHeaders);
}

export function methodNotAllowed(
  req: Request,
  allowed: string[],
  requestId?: string,
): Response {
  return errorResponse(
    req,
    "METHOD_NOT_ALLOWED",
    `Use ${allowed.join(" or ")}`,
    405,
    requestId,
    { "Allow": allowed.join(", ") },
  );
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
