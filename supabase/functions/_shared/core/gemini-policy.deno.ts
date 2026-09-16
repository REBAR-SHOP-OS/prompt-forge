import { GEMINI_GENERATE_CONTENT_MODEL, geminiGenerateContentUrl } from "./gemini-policy.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("direct Gemini policy uses the current supported model", () => {
  assert(GEMINI_GENERATE_CONTENT_MODEL === "gemini-3.8-flash", "unexpected Gemini model");
  const url = geminiGenerateContentUrl("key with spaces");
  assert(url.includes("/models/gemini-3.8-flash:generateContent"), "current model missing");
  assert(url.endsWith("key=key%20with%20spaces"), "API key must be encoded");
});

Deno.test("direct Gemini policy rejects retired identifiers", () => {
  for (const retired of ["gemini-2.5-flash", "gemini-2.5-pro"]) {
    let rejected = false;
    try { geminiGenerateContentUrl("key", retired); } catch { rejected = true; }
    assert(rejected, `${retired} was not rejected`);
  }
});
