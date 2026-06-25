// Describe Character edge function: takes an image URL (a character photo or
// character sheet living in user-images) and returns a concise, vivid textual
// description of the character's appearance. The description is injected into
// the video prompt so the character is used as a *descriptive reference*
// (no start-frame locking).
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

function isAllowedImageUrl(u: string): boolean {
  try {
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const allowed = [supabaseHost, ".supabase.co", ".supabase.in"].filter(Boolean);
    const p = new URL(u);
    if (p.protocol !== "https:") return false;
    const h = p.hostname.toLowerCase();
    return allowed.some((s) => (s.startsWith(".") ? h.endsWith(s) : h === s));
  } catch { return false; }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

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
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      return new Response(JSON.stringify({ error: "valid imageUrl is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const srcResp = await fetch(imageUrl);
    if (!srcResp.ok) {
      return new Response(JSON.stringify({ error: "Could not fetch source image" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const srcBytes = new Uint8Array(await srcResp.arrayBuffer());
    let srcMime = srcResp.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!/^image\/(png|jpe?g|webp)$/i.test(srcMime)) srcMime = "image/png";
    const srcDataUrl = `data:${srcMime};base64,${bytesToBase64(srcBytes)}`;

    const instruction = [
      "Describe the main character in this image as a concise visual reference for a video generator.",
      "Focus only on stable, identity-defining visual traits: approximate age, gender presentation, body type, skin tone,",
      "hair (color, length, style), facial features, and clothing/outfit (colors, materials, notable accessories).",
      "Do NOT describe the background, pose, camera angle, lighting, or art style.",
      "Write a single dense paragraph of 40-70 words, no preamble, no markdown, no quotes.",
    ].join(" ");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: srcDataUrl } },
            ],
          },
        ],
      }),
    });

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
      console.error("describe-character gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const description: string = ((data as any)?.choices?.[0]?.message?.content ?? "").toString().trim();
    if (!description) {
      return new Response(JSON.stringify({ error: "No description returned" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ description: description.slice(0, 800) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("describe-character unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
