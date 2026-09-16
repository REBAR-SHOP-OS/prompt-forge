import {
  MAX_UPSTREAM_ERROR_LOG_CHARS,
  sanitizeUpstreamErrorBody,
} from "./upstream-error.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("upstream error logs redact credentials and signed URL queries", () => {
  const raw = 'Bearer abc.def.ghi token=private-token api_key="private-key" https://provider.test/file?signature=private';
  const safe = sanitizeUpstreamErrorBody(raw);
  assert(!safe.includes("abc.def.ghi"), "bearer token leaked");
  assert(!safe.includes("private-token"), "token field leaked");
  assert(!safe.includes("private-key"), "API key leaked");
  assert(!safe.includes("signature=private"), "signed URL query leaked");
  assert(safe.includes("[REDACTED]"), "redaction marker missing");
});

Deno.test("upstream error logs collapse controls and enforce the maximum", () => {
  const safe = sanitizeUpstreamErrorBody(`first\nsecond\t${"x".repeat(2_000)}`);
  assert(!safe.includes("\n") && !safe.includes("\t"), "control characters remained");
  assert(safe.length <= MAX_UPSTREAM_ERROR_LOG_CHARS, "upstream body was not truncated");
  assert(safe.endsWith("…"), "truncation marker missing");
});
