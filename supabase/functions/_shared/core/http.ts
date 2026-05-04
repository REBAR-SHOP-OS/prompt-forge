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

function allowedOrigin(req?: Request): string | null {
  const origins = configuredOrigins();
  const origin = req?.headers.get("origin")?.trim();
  if (!origin) {
    return origins.length === 1 ? origins[0] : null;
  }
  return origins.includes(origin) ? origin : null;
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
    ...extraHeaders,
  };
}

export function preflightResponse(
  req: Request,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response("ok", { headers: corsHeaders(req, extraHeaders) });
}

export function jsonResponse(
  req: Request | undefined,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
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
): Response {
  return jsonResponse(req, { error: { code, message }, requestId }, status);
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
