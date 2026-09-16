export function parseVideoAnalysis(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* fall through */ }
  return { summary: text.slice(0, 2000) };
}
