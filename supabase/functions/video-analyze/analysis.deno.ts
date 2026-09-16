import { parseVideoAnalysis } from "./analysis.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("video analysis parses structured output", () => {
  assert(parseVideoAnalysis('{"summary":"ok"}').summary === "ok", "JSON parse failed");
});

Deno.test("video analysis safely wraps malformed output", () => {
  assert(parseVideoAnalysis("plain text").summary === "plain text", "fallback failed");
});
