// Edits an image (data URL or https URL) using Lovable AI Gateway (Nano Banana).
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const maskUrl = typeof body?.maskUrl === "string" ? body.maskUrl.trim() : "";
    const aspectRatio = typeof body?.aspectRatio === "string" && ["1:1","9:16","16:9"].includes(body.aspectRatio)
      ? body.aspectRatio as "1:1" | "9:16" | "16:9"
      : null;

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (prompt.length > 4000) {
      return new Response(JSON.stringify({ error: "prompt too long" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Allow data: URLs (from a freshly generated image) or https URLs from our supabase host.
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const isDataUrl = imageUrl.startsWith("data:image/");
    let isAllowedHttps = false;
    try {
      const u = new URL(imageUrl);
      isAllowedHttps = u.protocol === "https:" && (
        u.hostname === supabaseHost ||
        u.hostname.endsWith(".supabase.co") ||
        u.hostname.endsWith(".supabase.in")
      );
    } catch { /* ignore */ }
    if (!isDataUrl && !isAllowedHttps) {
      return new Response(JSON.stringify({ error: "imageUrl must be a data URL or supabase https URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (imageUrl.length > 15_000_000) {
      return new Response(JSON.stringify({ error: "imageUrl too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (maskUrl) {
      if (!maskUrl.startsWith("data:image/")) {
        return new Response(JSON.stringify({ error: "maskUrl must be a data:image/* URL" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (maskUrl.length > 15_000_000) {
        return new Response(JSON.stringify({ error: "maskUrl too large" }), {
          status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageContent = maskUrl
      ? [
          { type: "text", text: `You will receive two images. Image 1 is the ORIGINAL. Image 2 is a strict edit MASK (transparent background; opaque/white pixels mark the editable region). Only the white/opaque pixels of the mask define the editable region — DO NOT alter pixels where the mask is transparent. Keep every pixel outside the mask absolutely identical (same composition, colors, lighting, subject, pose, background). The user instruction (which may be in any language, including Persian/Farsi/Arabic) describes what to put inside the masked region: ${prompt}.${aspectRatio ? ` Output MUST keep a strict ${aspectRatio} aspect ratio.` : ""} Respond with ONLY the edited image — no text.` },
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "image_url", image_url: { url: maskUrl } },
        ]
      : [
          { type: "text", text: `Edit the provided image as follows: ${prompt}.${aspectRatio ? ` The output image MUST keep a strict ${aspectRatio} aspect ratio.` : " Preserve the overall composition and aspect ratio of the original image unless the instruction explicitly requires otherwise."} Respond with ONLY the edited image — no text, captions, or explanations.` },
          { type: "image_url", image_url: { url: imageUrl } },
        ];

    const callModel = async (model: string) => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: messageContent }],
          modalities: ["image", "text"],
          ...(aspectRatio ? { image_config: { aspect_ratio: aspectRatio } } : {}),
        }),
      });
    };

    // deno-lint-ignore no-explicit-any
    const extractImage = (data: any): string | undefined =>
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

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
      console.error("ai-image-edit gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data = await resp.json();
    let dataUrl = extractImage(data);

    if (!dataUrl) {
      console.warn("ai-image-edit primary returned no image, retrying with fallback model");
      resp = await callModel(FALLBACK);
      if (resp.ok) {
        data = await resp.json();
        dataUrl = extractImage(data);
      } else {
        const text = await resp.text().catch(() => "");
        console.error("ai-image-edit fallback gateway error", resp.status, text);
      }
    }

    if (!dataUrl) {
      console.error("ai-image-edit empty image after fallback", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({
        error: "The AI returned text instead of an edited image. Try a more visual instruction.",
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ dataUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-image-edit unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
