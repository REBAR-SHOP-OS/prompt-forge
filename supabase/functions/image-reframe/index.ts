// Image Reframe edge function: takes an image URL + a target aspect ratio
// (9:16, 1:1, 16:9) and uses Nano Banana (google/gemini-2.5-flash-image)
// to outpaint/extend the image to that aspect ratio. The result is uploaded
// to the user-images bucket and a public URL is returned.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";

const ALLOWED_RATIOS = new Set(["9:16", "1:1", "16:9"]);

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
  } catch {
    return false;
  }
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio.trim() : "";

    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      return new Response(JSON.stringify({ error: "valid imageUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_RATIOS.has(aspectRatio)) {
      return new Response(JSON.stringify({ error: "aspectRatio must be one of 9:16, 1:1, 16:9" }), {
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

    const instruction = [
      `Reframe the attached image to a strict ${aspectRatio} aspect ratio.`,
      `Outpaint and extend the background naturally to fill the new canvas.`,
      `Do NOT crop, distort, or move the main subject — keep it intact and well-composed within the new frame.`,
      `Preserve the original style, lighting, color palette, and texture.`,
      `No letterboxing, no black bars, no borders, no added text or watermarks.`,
      `Output only the final reframed image.`,
    ].join(" ");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

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
      console.error("image-reframe gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const dataUrl: string = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) {
      console.error("image-reframe: no image returned", JSON.stringify(data).slice(0, 400));
      return new Response(JSON.stringify({ error: "Model did not return an image" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mimeType = m[1];
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const bytes = decodeBase64(m[2]);

    const svc = getServiceClient();
    const path = `${auth.userId}/reframed-${Date.now()}-${aspectRatio.replace(":", "x")}.${ext}`;
    const { error: upErr } = await svc.storage.from("user-images").upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (upErr) {
      console.error("image-reframe upload failed", upErr.message);
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: pub } = svc.storage.from("user-images").getPublicUrl(path);

    return new Response(JSON.stringify({ publicUrl: pub.publicUrl, path, aspectRatio }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("image-reframe unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
