// scenario-write edge function: turns an idea + target duration into a single
// cohesive English video scenario/treatment via Lovable AI Gateway.
// For 45s, returns three sequential 15s scene prompts.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

const WORD_CAPS: Record<number, number> = { 5: 40, 10: 70, 15: 100, 45: 270, 135: 810 };
const BEAT_GUIDE: Record<number, string> = {
  5: "5s = 1 beat (one decisive shot)",
  10: "10s = 2 beats",
  15: "15s = 3 beats",
  45: "45s = three sequential 15s scenes",
  135: "135s = nine sequential 15s scenes",
};

const SCENE_DELIM = "===SCENE===";

function expectedSceneCount(duration: number): number {
  if (duration === 135) return 9;
  if (duration === 45) return 3;
  return 1;
}

function buildSystemPrompt(duration: number): string {
  const sceneCount = expectedSceneCount(duration);
  if (sceneCount > 1) {
    const numWord = sceneCount === 3 ? "THREE" : sceneCount === 9 ? "NINE" : String(sceneCount);
    return [
      "You are a professional short-form video scenario writer.",
      `Given the user's idea, write a CONTINUOUS narrative scenario in ENGLISH for a ${duration}-second cinematic video,`,
      `structured as ${numWord} sequential 15-second scenes that flow into each other.`,
      `Output EXACTLY ${sceneCount} scene blocks separated by the literal delimiter "${SCENE_DELIM}" on its own line.`,
      "Do not number the scenes, do not add headings or labels, no markdown, no preamble, no quotes.",
      "Each scene must be 70-90 words and self-contained as a video prompt (include subject, action, camera move, lighting),",
      "while clearly continuing the story from the previous scene.",
    ].join(" ");
  }
  const cap = WORD_CAPS[duration];
  const beat = BEAT_GUIDE[duration];
  return [
    "You are a professional short-form video scenario writer.",
    "Given the user's idea, write a single cohesive scenario/treatment in ENGLISH",
    `suitable for a ${duration}-second cinematic video — regardless of the input language.`,
    "Include opening visual hook, beat-by-beat action, camera/lighting cues, and a clear ending.",
    `Match pacing realistically to the duration: ${beat}.`,
    "Output prose only — no markdown headings, no bullet lists, no preamble, no quotes.",
    `Keep it under ${cap} words.`,
  ].join(" ");
}

async function callGateway(
  apiKey: string,
  duration: number,
  idea: string,
  imageUrl?: string,
): Promise<Response> {
  const userContent: unknown = imageUrl
    ? [
        {
          type: "text",
          text: `Idea: ${idea}\nBase the scenario on the attached reference image (subjects, setting, mood, props, style).`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : `Idea: ${idea}`;

  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: buildSystemPrompt(duration) },
        { role: "user", content: userContent },
      ],
    }),
  });
}

function stripQuotes(s: string): string {
  return s.replace(/^["'`]+|["'`]+$/g, "").trim();
}

function parseScenes(raw: string, duration: number): string[] {
  const cleaned = stripQuotes(raw);
  const expected = expectedSceneCount(duration);
  if (expected <= 1) return [cleaned];

  const parts = cleaned
    .split(/\r?\n?\s*===SCENE===\s*\r?\n?/i)
    .map((s) => stripQuotes(s))
    .filter((s) => s.length > 0);
  if (parts.length === expected) return parts;

  // Fallback: try splitting on blank-line paragraphs.
  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((s) => stripQuotes(s))
    .filter((s) => s.length > 0);
  if (paragraphs.length === expected) return paragraphs;

  return []; // signal "needs retry"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
    const durationRaw = Number(body?.durationSeconds);
    const duration = [5, 10, 15, 45, 135].includes(durationRaw) ? durationRaw : 0;
    const imageUrlRaw = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const imageUrl =
      imageUrlRaw && /^https?:\/\//i.test(imageUrlRaw) && imageUrlRaw.length <= 2048
        ? imageUrlRaw
        : undefined;

    if (!idea && !imageUrl) {
      return new Response(JSON.stringify({ error: "idea or imageUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (idea.length > 1500) {
      return new Response(JSON.stringify({ error: "idea too long (max 1500 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!duration) {
      return new Response(JSON.stringify({ error: "durationSeconds must be 5, 10, 15, 45, or 135" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const effectiveIdea = idea || "Generate a scenario based on the attached reference image.";
    let resp = await callGateway(apiKey, duration, effectiveIdea, imageUrl);

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("scenario-write gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data = await resp.json();
    let raw: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    let scenes = parseScenes(raw, duration);

    // One retry for 45s if we didn't get exactly three scenes.
    if (duration === 45 && scenes.length === 0) {
      resp = await callGateway(apiKey, duration, effectiveIdea, imageUrl);
      if (resp.ok) {
        data = await resp.json();
        raw = (data?.choices?.[0]?.message?.content ?? "").trim();
        scenes = parseScenes(raw, duration);
      }
    }

    if (scenes.length === 0) {
      // Final fallback: return the raw text as a single block so the UI still has something.
      if (duration === 45) {
        const fallback = stripQuotes(raw);
        if (!fallback) {
          return new Response(JSON.stringify({ error: "Empty AI response" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ scenario: fallback, scenes: [fallback], warning: "Could not split into 3 scenes" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scenario = scenes.join("\n\n");

    return new Response(JSON.stringify({ scenario, scenes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scenario-write unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
