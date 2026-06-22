// Generate Character Sheet edge function: takes a single character photo and a
// chosen model, then asks Lovable AI to produce ONE combined character sheet
// image — a top row of multi-angle body turnaround views and a bottom row of
// facial expressions — keeping the same character identity. The result is
// stored in the private user-images bucket with category 'character' and
// returned as a signed URL.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
// deno-lint-ignore-file no-explicit-any

const USER_IMAGES_BUCKET = "user-images";

// Map the UI model choice to an image-capable Lovable AI model.
const MODEL_MAP: Record<string, string> = {
  fast: "google/gemini-3.1-flash-image-preview",
  quality: "google/gemini-3-pro-image",
  detailed: "google/gemini-2.5-flash-image",
};

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const modelKey = typeof body?.model === "string" ? body.model.trim() : "fast";
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
    const logoUrl = typeof body?.logoUrl === "string" ? body.logoUrl.trim() : "";
    const applyLogo = body?.applyLogo === true && !!logoUrl && isAllowedImageUrl(logoUrl);

    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      return new Response(JSON.stringify({ error: "valid imageUrl is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const model = MODEL_MAP[modelKey];
    if (!model) {
      return new Response(JSON.stringify({ error: "model must be one of fast, quality, detailed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Source image -> data URL
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
      "Create a single, clean character sheet (turnaround sheet) of the SAME character shown in the provided image.",
      "Preserve the exact identity: same face, hairstyle, skin tone, body type, and outfit across every view.",
      "Compose ONE image on a plain neutral light-gray studio background, arranged in two rows:",
      "TOP ROW = full-body turnaround views of the character: front, 3/4 view, side profile, and back.",
      "BOTTOM ROW = head-and-shoulders close-ups showing several facial expressions: neutral, happy/smiling, angry, surprised, and sad.",
      "Keep consistent lighting and proportions, evenly spaced, all figures the same scale within their row.",
      "Do NOT add any text, labels, captions, watermarks, logos, or borders. Output ONLY the rendered image.",
    ].join(" ");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        responseFormat: { image: { aspectRatio: "16:9", imageSize: "1K" } },
        response_format: { image: { aspect_ratio: "16:9", image_size: "1K" } },
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
      console.error("generate-character-sheet gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: `AI gateway error (${resp.status})` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const outDataUrl: string = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
    const m = outDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) {
      console.error("generate-character-sheet: no image returned", JSON.stringify(data).slice(0, 400));
      return new Response(JSON.stringify({ error: "The model did not return an image. Please try another model." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const outMime = m[1];
    const outBytes = decodeBase64(m[2]);
    const ext = outMime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";

    // 2) Upload to private user-images bucket.
    const svc = getServiceClient();
    const path = `${auth.userId}/character-sheet-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await svc.storage.from(USER_IMAGES_BUCKET).upload(path, outBytes, {
      contentType: outMime, upsert: false,
    });
    if (upErr) {
      console.error("generate-character-sheet upload failed", upErr.message);
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: pub } = svc.storage.from(USER_IMAGES_BUCKET).getPublicUrl(path);

    // 3) Insert a character row.
    const { data: row, error: insErr } = await svc
      .from("generator_user_images")
      .insert({
        user_id: auth.userId,
        storage_path: pub.publicUrl,
        size_bytes: outBytes.byteLength,
        mime_type: outMime,
        category: "character",
        title: (title ? `${title} — sheet` : "Character sheet").slice(0, 100),
      })
      .select("id, storage_path, created_at, title")
      .single();
    if (insErr) {
      console.error("generate-character-sheet insert failed", insErr.message);
      return new Response(JSON.stringify({ error: "Failed to save character sheet" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Signed URL for immediate display (bucket is private).
    let signedUrl = pub.publicUrl;
    try {
      const { data: signed } = await svc.storage
        .from(USER_IMAGES_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) signedUrl = signed.signedUrl;
    } catch { /* fall back to public url */ }

    return new Response(
      JSON.stringify({ id: (row as any)?.id, storage_path: signedUrl, title: (row as any)?.title, created_at: (row as any)?.created_at }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-character-sheet unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
