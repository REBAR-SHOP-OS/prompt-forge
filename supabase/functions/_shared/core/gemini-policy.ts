/** Central policy for direct Gemini Generate Content calls. */
export const GEMINI_GENERATE_CONTENT_MODEL = "gemini-3.8-flash";

const SUPPORTED_DIRECT_MODELS = new Set([GEMINI_GENERATE_CONTENT_MODEL]);

export function geminiGenerateContentUrl(apiKey: string, model = GEMINI_GENERATE_CONTENT_MODEL): string {
  if (!SUPPORTED_DIRECT_MODELS.has(model)) {
    throw new Error(`unsupported direct Gemini model: ${model}`);
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}
