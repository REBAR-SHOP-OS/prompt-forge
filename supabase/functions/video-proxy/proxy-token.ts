export const VIDEO_PROXY_TOKEN_TTL_SECONDS = 2 * 60 * 60;

type ProxyPayload = {
  target: string;
  expiresAt: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("video proxy signing secret is not configured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signVideoProxyTarget(
  target: string,
  secret: string,
  nowMs = Date.now(),
  ttlSeconds = VIDEO_PROXY_TOKEN_TTL_SECONDS,
): Promise<string> {
  const payload: ProxyPayload = {
    target,
    expiresAt: Math.floor(nowMs / 1_000) + Math.max(1, Math.floor(ttlSeconds)),
  };
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyVideoProxyToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): Promise<string | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra !== undefined) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importKey(secret),
      base64UrlToBytes(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as Partial<ProxyPayload>;
    if (typeof payload.target !== "string" || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt <= Math.floor(nowMs / 1_000)) return null;
    return payload.target;
  } catch {
    return null;
  }
}
