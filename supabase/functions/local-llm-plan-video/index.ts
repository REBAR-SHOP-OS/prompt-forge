import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

const ALLOWED_MODELS = new Set(["gpt-oss:20b", "qwen3.5:27b", "qwen3:14b"]);
const DEFAULT_MODEL = "gpt-oss:20b";
const MAX_PROMPT_CHARS = 8000;
const TIMEOUT_MS = 45_000;

type PlannerConfig =
  | { ok: true; baseUrl: string; apiKey: string | null }
  | { ok: false; error: string; status: number };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.endsWith(".localhost")
  );
}

function readPlannerConfig(): PlannerConfig {
  const rawBaseUrl = (
    Deno.env.get("LOCAL_LLM_BASE_URL") ??
    Deno.env.get("LOCAL_AI_ROUTER_BASE_URL") ??
    Deno.env.get("LOCAL_IMAGE_BASE_URL") ??
    ""
  ).trim();

  if (!rawBaseUrl) {
    return {
      ok: false,
      status: 500,
      error: "Local LLM planner is not configured. Set LOCAL_LLM_BASE_URL to your HTTPS router /v1 URL.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    return { ok: false, status: 500, error: "LOCAL_LLM_BASE_URL is not a valid URL." };
  }

  if (isLoopbackHost(parsed.hostname) && Deno.env.get("ALLOW_LOCAL_LLM_LOOPBACK") !== "true") {
    return {
      ok: false,
      status: 500,
      error: "LOCAL_LLM_BASE_URL must be public HTTPS for deployed edge functions, not localhost.",
    };
  }

  if (parsed.protocol !== "https:" && Deno.env.get("ALLOW_LOCAL_LLM_HTTP") !== "true") {
    return { ok: false, status: 500, error: "LOCAL_LLM_BASE_URL must use HTTPS." };
  }

  const withoutTrailingSlash = parsed.toString().replace(/\/+$/, "");
  const baseUrl = withoutTrailingSlash.endsWith("/v1")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/v1`;
  const apiKey = (
    Deno.env.get("LOCAL_LLM_API_KEY") ??
    Deno.env.get("LOCAL_AI_ROUTER_TOKEN") ??
    Deno.env.get("LOCAL_IMAGE_API_KEY") ??
    ""
  ).trim();

  return { ok: true, baseUrl, apiKey: apiKey || null };
}

function normalizeModel(value: unknown): string | null {
  const requested = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_MODEL;
  return ALLOWED_MODELS.has(requested) ? requested : null;
}

function cleanPlannerOutput(text: string): string {
  let cleaned = text.trim();
  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) cleaned = fenced[1].trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.prompt === "string") cleaned = parsed.prompt.trim();
  } catch {
    // Plain text is acceptable if the local model ignored the JSON instruction.
  }

  return cleaned.replace(/^["'`]+|["'`]+$/g, "").trim();
}

function textFromChatCompletion(data: unknown): string {
  const maybe = data as {
    choices?: Array<{
      message?: { content?: unknown };
      text?: unknown;
    }>;
  };
  const content = maybe.choices?.[0]?.message?.content ?? maybe.choices?.[0]?.text ?? "";
  return typeof content === "string" ? content : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 3) return jsonResponse({ error: "prompt is required (min 3 chars)" }, 400);
    if (prompt.length > MAX_PROMPT_CHARS) return jsonResponse({ error: "prompt too long" }, 400);

    const model = normalizeModel(body?.model);
    if (!model) return jsonResponse({ error: "Unsupported local planner model" }, 400);

    const config = readPlannerConfig();
    if (!config.ok) return jsonResponse({ error: config.error }, config.status);

    const mode =
      body?.mode === "image-to-video" || body?.mode === "text-to-video"
        ? body.mode
        : "text-to-video";
    const videoModel = typeof body?.videoModel === "string" ? body.videoModel.trim() : "selected video model";
    const durationSeconds = typeof body?.durationSeconds === "number" ? body.durationSeconds : null;
    const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio.trim() : "";
    const frameCount = Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter((url: unknown) => typeof url === "string" && url.trim().length > 0).length
      : 0;

    const systemPrompt = [
      "You are REBAR SHOP AI VIDEO's local video prompt planner.",
      "Return JSON only in this exact shape: {\"prompt\":\"...\"}.",
      "Rewrite the user's idea into one production-ready AI video prompt.",
      "Keep the user's language, brand names, product facts, and technical constraints.",
      "Add concrete subject, action, environment, camera motion, lighting, pacing, and continuity.",
      "For image-to-video, preserve the provided frame identity and describe motion from that frame.",
      "Do not invent prices, addresses, phone numbers, certifications, or legal claims.",
      "Keep the prompt under 120 words.",
    ].join(" ");

    const userPrompt = [
      `Mode: ${mode}`,
      `Video model: ${videoModel}`,
      durationSeconds ? `Duration: ${durationSeconds}s` : null,
      aspectRatio ? `Aspect ratio: ${aspectRatio}` : null,
      frameCount > 0 ? `Attached frame count: ${frameCount}` : null,
      "",
      "User prompt:",
      `"""${prompt}"""`,
    ].filter(Boolean).join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.35,
          max_tokens: 500,
          stream: false,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("local-llm-plan-video upstream error", resp.status, text.slice(0, 500));
      return jsonResponse({ error: "Local LLM planner error" }, 502);
    }

    const data = await resp.json().catch(() => null);
    const plannedPrompt = cleanPlannerOutput(textFromChatCompletion(data));
    if (plannedPrompt.length < 3) return jsonResponse({ error: "Empty local planner response" }, 502);

    return jsonResponse({
      plannedPrompt,
      model,
      provider: "local-llm-router",
    });
  } catch (error) {
    console.error("local-llm-plan-video unhandled error", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
