// Image Reframe edge function: takes an image URL + a target aspect ratio
// (9:16, 1:1, 16:9), pre-composes a padded canvas at the exact target ratio
// with the original centered, and asks Nano Banana to outpaint only the
// padded regions. The result is uploaded to user-images and a public URL
// is returned.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
// deno-lint-ignore-file no-explicit-any
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const ALLOWED_RATIOS: Record<string, [number, number]> = {
  "9:16": [9, 16],
  "1:1": [1, 1],
  "16:9": [16, 9],
};

const MAX_LONG_SIDE = 1536;

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

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/**
 * Compose a canvas at the target aspect ratio with the original image
 * fitted (contain) and centered. Padding is filled with mid-gray so
 * Nano Banana clearly sees what to extend.
 */
async function composePaddedCanvas(
  inputBytes: Uint8Array,
  targetRatio: [number, number],
): Promise<{ png: Uint8Array; width: number; height: number }> {
  const decoded: any = await decode(inputBytes);
  // imagescript may return a GIF; take first frame.
  const src: any = decoded?.frames?.[0] ?? decoded;
  const sw = src.width as number;
  const sh = src.height as number;

  const [rw, rh] = targetRatio;
  // Target canvas large enough to contain the original at native size.
  let cw = Math.max(sw, Math.round((sh * rw) / rh));
  let ch = Math.max(sh, Math.round((cw * rh) / rw));
  // Recompute width to keep exact ratio in case ch was bumped.
  cw = Math.round((ch * rw) / rh);

  // Clamp longest side.
  const longest = Math.max(cw, ch);
  if (longest > MAX_LONG_SIDE) {
    const k = MAX_LONG_SIDE / longest;
    cw = Math.round(cw * k);
    ch = Math.round(ch * k);
  }

  // Fit the original inside the canvas (contain).
  const scale = Math.min(cw / sw, ch / sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const resized = scale === 1 ? src : src.clone().resize(dw, dh);
  // Mid-gray background — clearly distinguishable from real content.
  const bgColor = 0x7f7f7fff;
  const canvas = new Image(cw, ch).fill(bgColor);
  const dx = Math.floor((cw - dw) / 2);
  const dy = Math.floor((ch - dh) / 2);
  canvas.composite(resized, dx, dy);

  const png = await canvas.encode();
  return { png, width: cw, height: ch };
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
    if (!ALLOWED_RATIOS[aspectRatio]) {
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

    // 1) Fetch original image bytes.
    const srcResp = await fetch(imageUrl);
    if (!srcResp.ok) {
      return new Response(JSON.stringify({ error: "Could not fetch source image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const srcBytes = new Uint8Array(await srcResp.arrayBuffer());

    // 2) Compose padded canvas at the exact target ratio.
    let composed: { png: Uint8Array; width: number; height: number };
    try {
      composed = await composePaddedCanvas(srcBytes, ALLOWED_RATIOS[aspectRatio]);
    } catch (e) {
      console.error("image-reframe compose failed", (e as Error).message);
      return new Response(JSON.stringify({ error: "Could not process image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrlIn = `data:image/png;base64,${bytesToBase64(composed.png)}`;

    // 3) Ask Nano Banana to fill only the gray padded regions.
    const instruction = [
      `The attached image already has the correct ${aspectRatio} canvas (${composed.width}x${composed.height}).`,
      `The original subject is centered. The mid-gray (#7f7f7f) padded regions are EMPTY space that must be filled.`,
      `Outpaint ONLY the gray padded areas by naturally extending the existing background, lighting, gradients, particles, and texture from the centered subject.`,
      `Do NOT move, scale, recolor, crop, or alter the centered subject in any way — leave every non-gray pixel exactly as it is.`,
      `Match the original art style seamlessly. No letterboxing, no borders, no added text or watermarks.`,
      `Return the full canvas at the same ${composed.width}x${composed.height} dimensions.`,
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
              { type: "image_url", image_url: { url: dataUrlIn } },
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

    return new Response(
      JSON.stringify({
        publicUrl: pub.publicUrl,
        path,
        aspectRatio,
        width: composed.width,
        height: composed.height,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("image-reframe unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
