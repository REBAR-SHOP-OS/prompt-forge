// Short-lived, purpose-limited HMAC token for the video-proxy.
//
// Goals:
//   - Do NOT pass Supabase JWT access tokens in <video src=...> URLs.
//   - Bind each token to: user id, exact upstream URL, expiry, purpose.
//   - Server-only signing key (derived from SUPABASE_SERVICE_ROLE_KEY so we
//     don't need to provision a new secret; the service role key never
//     leaves the edge runtime). Optional override via VIDEO_PROXY_HMAC_SECRET.
//
// Token wire format (URL-safe):
//   v1.<payloadB64Url>.<sigB64Url>
//
// payload JSON:
//   { u: <userId>, h: <sha256(url) hex>, e: <unix seconds expiry>, p: "video_proxy" }

const PURPOSE = "video_proxy";
const VERSION = "v1";
export const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

interface TokenPayload {
  u: string;   // user id
  h: string;   // sha256(targetUrl) hex
  e: number;   // expiry unix seconds
  p: string;   // purpose tag
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let cachedKey: CryptoKey | null = null;

async function getSigningKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const override = Deno.env.get("VIDEO_PROXY_HMAC_SECRET");
  const base = override && override.length >= 16
    ? override
    : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base) throw new Error("missing_proxy_signing_key");
  // Domain-separate the derived key so it can never collide with another use.
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`video-proxy/v1|${base}`),
  );
  cachedKey = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

export async function hashTargetUrl(url: string): Promise<string> {
  return sha256Hex(url);
}

export async function mintProxyToken(
  userId: string,
  targetUrl: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<{ token: string; expiresAt: number }> {
  const exp = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(ttlSeconds, 60 * 60 * 2));
  const payload: TokenPayload = {
    u: userId,
    h: await hashTargetUrl(targetUrl),
    e: exp,
    p: PURPOSE,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = b64urlEncode(payloadBytes);
  const key = await getSigningKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)),
  );
  const token = `${VERSION}.${payloadB64}.${b64urlEncode(sig)}`;
  return { token, expiresAt: exp };
}

export interface VerifiedToken {
  userId: string;
  expiresAt: number;
}

export async function verifyProxyToken(
  token: string,
  targetUrl: string,
): Promise<VerifiedToken | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== VERSION) return null;
    const [, payloadB64, sigB64] = parts;
    const key = await getSigningKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64),
      new TextEncoder().encode(payloadB64),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as TokenPayload;
    if (payload.p !== PURPOSE) return null;
    if (!payload.u || typeof payload.e !== "number") return null;
    if (Math.floor(Date.now() / 1000) >= payload.e) return null;
    const expectedHash = await hashTargetUrl(targetUrl);
    // constant-time-ish compare
    if (payload.h.length !== expectedHash.length) return null;
    let diff = 0;
    for (let i = 0; i < payload.h.length; i++) {
      diff |= payload.h.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    if (diff !== 0) return null;
    return { userId: payload.u, expiresAt: payload.e };
  } catch {
    return null;
  }
}
