// Generates an image from a text prompt using Lovable AI Gateway (Nano Banana).
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

const ALLOWED_RATIOS = new Set(["1:1", "9:16", "16:9"]);

function ratioGuidance(ratio: string): string {
  switch (ratio) {
    case "1:1":
      return "The output image MUST be a perfect square with a 1:1 aspect ratio.";
    case "9:16":
      return "The output image MUST be vertical/portrait with a strict 9:16 aspect ratio (mobile reel format).";
    case "16:9":
      return "The output image MUST be horizontal/landscape with a strict 16:9 aspect ratio (widescreen).";
    default:
      return "";
  }
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
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "";

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (prompt.length > 4000) {
      return new Response(JSON.stringify({ error: "prompt too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_RATIOS.has(aspectRatio)) {
      return new Response(JSON.stringify({ error: "aspectRatio must be one of 1:1, 9:16, 16:9" }), {
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

    const fullPrompt = `Create a single high-quality photographic image that visually depicts the following subject. Do NOT respond with text, explanations, captions, or descriptions — output ONLY the rendered image. The user's subject may be in any language (including Persian/Farsi/Arabic); interpret it as the visual subject of the image.\n\nSubject: ${prompt}\n\n${ratioGuidance(aspectRatio)}`;

    const callModel = async (model: string) => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
          image_config: { aspect_ratio: aspectRatio },
        }),
      });
    };

    const extractImage = (data: unknown): string | undefined => {
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any)?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    };

    const PRIMARY = "google/gemini-3.1-flash-image-preview";
    const FALLBACK = "google/gemini-2.5-flash-image";

    let resp = await callModel(PRIMARY);

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("ai-image-generate gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data = await resp.json();
    let dataUrl = extractImage(data);

    if (!dataUrl) {
      console.warn("ai-image-generate primary returned no image, retrying with fallback model");
      resp = await callModel(FALLBACK);
      if (resp.ok) {
        data = await resp.json();
        dataUrl = extractImage(data);
      } else {
        const text = await resp.text().catch(() => "");
        console.error("ai-image-generate fallback gateway error", resp.status, text);
      }
    }

    if (!dataUrl) {
      console.error("ai-image-generate empty image after fallback", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({
        error: "The AI returned text instead of an image. Try a more visual prompt — describe the scene, subject, lighting, and style.",
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ dataUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-image-generate unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
