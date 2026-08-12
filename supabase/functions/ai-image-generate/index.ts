// Generates an image from a text prompt using Lovable AI Gateway (Nano Banana).
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";

const ALLOWED_RATIOS = new Set(["1:1", "9:16", "16:9"]);

// Reference (product / character) images come from the user's own image buckets
// (e.g. user-images / generator assets). Accept HTTPS URLs that are either hosted
// on our own Supabase storage origin under the caller's own user folder, or an
// explicitly allowlisted public host. This mirrors the job-orchestrator gateway's
// isAllowedReferenceUrl and prevents SSRF to arbitrary URLs.
function isAllowedReferenceUrl(url: string, userId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  let storageOrigin = "";
  try {
    storageOrigin = new URL(supabaseUrl).origin;
  } catch {
    storageOrigin = "";
  }
  if (storageOrigin && parsed.origin === storageOrigin) {
    return parsed.pathname.startsWith("/storage/v1/object/") &&
      parsed.pathname.includes(`/${userId}/`);
  }
  const extraHosts = (Deno.env.get("ALLOWED_PUBLIC_FRAME_HOSTS") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return extraHosts.includes(parsed.hostname.toLowerCase());
}

// The AI gateway fetches image URLs itself, but our storage buckets are private,
// so a public object URL returns 400. Download the object server-side with the
// service role and inline it as a base64 data URL (same approach as scenario-write).
async function resolveImageForGateway(url: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const marker = "/storage/v1/object/";
    const idx = url.indexOf(marker);
    if (!idx || idx < 0 || !supabaseUrl || !serviceKey) return url;

    let objectPath = url.slice(idx + marker.length);
    if (objectPath.startsWith("public/")) objectPath = objectPath.slice("public/".length);
    const authUrl = `${supabaseUrl}/storage/v1/object/${objectPath}`;

    const res = await fetch(authUrl, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!res.ok) {
      console.error("resolveImageForGateway fetch failed", res.status, authUrl);
      return url;
    }
    const contentType = res.headers.get("content-type") || "image/png";
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    return `data:${contentType};base64,${b64}`;
  } catch (e) {
    console.error("resolveImageForGateway error", e);
    return url;
  }
}

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
    const referenceImageUrls = Array.isArray(body?.referenceImageUrls)
      ? (body.referenceImageUrls as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];
    // Cap the number of reference images and validate each against the same
    // security rules as the job orchestrator (own storage under user folder or
    // allowlisted host). Never accept arbitrary insecure URLs server-side.
    const MAX_REFERENCE_IMAGES = 3;
    const safeReferenceUrls = referenceImageUrls
      .slice(0, MAX_REFERENCE_IMAGES)
      .filter((u) => u.length <= 2048 && isAllowedReferenceUrl(u, auth.userId));

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

    // Build the multimodal user content. Reference images (product, character,
    // and optionally the previous scene for continuity) are attached as real
    // image blocks so the model can preserve their identity, not just read their
    // URLs as text. Private-bucket URLs are inlined as data URLs first.
    const userContent: unknown[] = [{ type: "text", text: fullPrompt }];
    if (safeReferenceUrls.length > 0) {
      for (const refUrl of safeReferenceUrls) {
        const resolved = await resolveImageForGateway(refUrl);
        userContent.push({ type: "image_url", image_url: { url: resolved } });
      }
    }

    const callModel = async (model: string) => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: userContent }],
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

    let data = await readJsonLoose(resp, "ai-image-generate");
    let dataUrl = extractImage(data);

    if (!dataUrl) {
      console.warn("ai-image-generate primary returned no image, retrying with fallback model");
      resp = await callModel(FALLBACK);
      if (resp.ok) {
        data = await readJsonLoose(resp, "ai-image-generate");
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
