import {
  signVideoProxyTarget,
  verifyVideoProxyToken,
} from "./proxy-token.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const secret = "test-only-video-proxy-signing-secret";
const now = Date.parse("2026-09-16T20:00:00Z");
const target = "https://dashscope-oss.aliyuncs.com/output/video.mp4?provider_signature=sensitive";

Deno.test("video proxy token authorizes the exact target without transporting a JWT", async () => {
  const token = await signVideoProxyTarget(target, secret, now, 60);
  assert(!token.includes(target), "raw upstream target leaked into proxy token");
  assert(!token.includes("provider_signature"), "upstream signature leaked into proxy token");
  assert(await verifyVideoProxyToken(token, secret, now + 30_000) === target, "valid proxy token rejected");
});

Deno.test("video proxy token rejects tampering and expiry", async () => {
  const token = await signVideoProxyTarget(target, secret, now, 60);
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert(await verifyVideoProxyToken(tampered, secret, now + 30_000) === null, "tampered token accepted");
  assert(await verifyVideoProxyToken(token, secret, now + 61_000) === null, "expired token accepted");
  assert(await verifyVideoProxyToken(token, "wrong-secret", now + 30_000) === null, "wrong signing key accepted");
});
