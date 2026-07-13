import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readJsonSafe, readJsonLoose, previewBody } from "../../supabase/functions/_shared/core/safe-json.ts";

// Regression coverage for the "Edge function returned 500: Unexpected token '<', "<html>..."
// runtime error. An upstream gateway/proxy/tunnel can answer HTTP 200 with an HTML
// error page; res.json() throws on that and surfaces as an opaque 500.

const htmlPage = '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body></body>\r\n</html>';

function res(body: string, init: { status?: number; contentType?: string } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "application/json" },
  });
}

describe("readJsonSafe", () => {
  it("parses a valid JSON object", async () => {
    const r = await readJsonSafe<{ a: number }>(res('{"a":1}'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.a).toBe(1);
  });

  it("parses a valid JSON array", async () => {
    const r = await readJsonSafe<number[]>(res("[1,2]"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([1, 2]);
  });

  it("does NOT throw on an HTML body returned with status 200", async () => {
    const r = await readJsonSafe(res(htmlPage, { contentType: "text/html" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.raw).toContain("<html>");
      expect(r.contentType).toContain("text/html");
    }
  });

  it("does not throw on an empty body", async () => {
    const r = await readJsonSafe(res(""));
    expect(r.ok).toBe(false);
  });

  it("does not throw on malformed JSON", async () => {
    const r = await readJsonSafe(res('{"a":'));
    expect(r.ok).toBe(false);
  });
});

describe("readJsonLoose", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("returns parsed data on valid JSON", async () => {
    const data = await readJsonLoose<{ choices: unknown[] }>(res('{"choices":[]}'), "test");
    expect(data).toEqual({ choices: [] });
  });

  it("returns null (never throws) when the upstream sends an HTML page", async () => {
    const data = await readJsonLoose(res(htmlPage, { contentType: "text/html" }), "test");
    expect(data).toBeNull();
  });

  it("logs the failure with a truncated body preview", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await readJsonLoose(res(htmlPage, { contentType: "text/html" }), "enhance-prompt");
    expect(spy).toHaveBeenCalledWith(
      "enhance-prompt: non-JSON response",
      expect.objectContaining({ status: 200, contentType: expect.stringContaining("text/html") }),
    );
  });

  it("lets call sites degrade gracefully via optional chaining", async () => {
    // This mirrors the real call sites, e.g. enhance-prompt:
    //   const data = await readJsonLoose(resp, "enhance-prompt");
    //   const enhanced = (data?.choices?.[0]?.message?.content ?? "").trim();
    // With null, `enhanced` becomes "" and the function returns a clean 502
    // instead of crashing with a 500.
    const data = await readJsonLoose<{ choices?: { message?: { content?: string } }[] }>(
      res(htmlPage, { contentType: "text/html" }),
      "enhance-prompt",
    );
    const enhanced = (data?.choices?.[0]?.message?.content ?? "").trim();
    expect(enhanced).toBe("");
  });
});

describe("previewBody", () => {
  it("collapses whitespace and truncates long bodies", () => {
    expect(previewBody("a\n\n  b")).toBe("a b");
    expect(previewBody("x".repeat(300)).length).toBeLessThanOrEqual(201);
  });
});
