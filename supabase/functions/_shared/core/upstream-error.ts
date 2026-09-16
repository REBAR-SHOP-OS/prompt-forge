export const MAX_UPSTREAM_ERROR_LOG_CHARS = 512;

function replaceControlCharacters(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    sanitized += code <= 0x1f || code === 0x7f ? " " : character;
  }
  return sanitized;
}

export function sanitizeUpstreamErrorBody(
  value: unknown,
  maxChars = MAX_UPSTREAM_ERROR_LOG_CHARS,
): string {
  const boundedMax = Math.max(32, Math.min(2_048, Math.floor(maxChars)));
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");

  text = replaceControlCharacters(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+\x2f-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/(["']?(?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/[^\s?"']+)\?[^\s"']+/gi, "$1?[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= boundedMax) return text;
  return `${text.slice(0, boundedMax - 1)}…`;
}
