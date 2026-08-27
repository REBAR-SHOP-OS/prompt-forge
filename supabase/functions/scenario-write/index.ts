// scenario-write edge function: turns an idea + target duration into a single
// cohesive English video scenario/treatment via Lovable AI Gateway.
// For 45s, returns three sequential 15s scene prompts.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";

import { buildSystemPrompt, expectedSceneCount, type ProductAdOpts, type CharacterSheetOpts } from "./prompt.ts";

async function callGateway(
  apiKey: string,
  duration: number,
  idea: string,
  imageUrl?: string,
  productAd?: ProductAdOpts,
  autoFromImage?: boolean,
  characterSheet?: CharacterSheetOpts,
  businessInfo?: string,
  outputLanguage = "en",
  narration = true,
): Promise<Response> {
  const refText = characterSheet
    ? `Brief: ${idea}\nThe attached image IS the lead character — match their exact face, hair, wardrobe, body, and overall look in every shot, and keep them perfectly consistent throughout the film.`
    : productAd
      ? `Brief: ${idea}\nThe attached image is the actual product — match its exact look, color, shape, and branding in every shot.`
      : autoFromImage
        ? `No written idea was provided. Analyze the attached image and write the scenario entirely based on what you observe in it.`
        : `Idea: ${idea}\nBase the scenario on the attached reference image (subjects, setting, mood, props, style).`;
  const characterImageUrl = productAd?.characterImageUrl;
  const contentBlocks: unknown[] = imageUrl
    ? [
        { type: "text", text: refText },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : [];
  if (imageUrl && characterImageUrl) {
    contentBlocks.push({ type: "text", text: "The image below is the recurring human character to feature in the commercial — match their exact face, hair, wardrobe, and body in every shot." });
    contentBlocks.push({ type: "image_url", image_url: { url: characterImageUrl } });
  }
  const userContent: unknown = imageUrl
    ? contentBlocks
    : (productAd || characterSheet) ? `Brief: ${idea}` : `Idea: ${idea}`;

  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: buildSystemPrompt(duration, productAd, autoFromImage, characterSheet, businessInfo, outputLanguage, narration) },
        { role: "user", content: userContent },
      ],
    }),
  });
}

// The AI gateway fetches image URLs itself, but our storage buckets (e.g.
// wan-frames) are private, so a public object URL returns 400. Download the
// object server-side with the service role and inline it as a base64 data URL.
async function resolveImageForGateway(url: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const marker = "/storage/v1/object/";
    const idx = url.indexOf(marker);
    if (!idx || idx < 0 || !supabaseUrl || !serviceKey) return url;

    // Strip a leading "public/" segment so we hit the authenticated endpoint.
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
    const businessInfo = typeof body?.businessInfo === "string" ? body.businessInfo.trim().slice(0, 2000) : "";
    const ALLOWED_LANGS = ["en"];
    const outputLanguage = ALLOWED_LANGS.includes(body?.outputLanguage) ? body.outputLanguage : "en";
    // narration (canonical) or withNarration (Make Film Wizard alias).
    const narration =
      typeof body?.narration === "boolean"
        ? body.narration
        : typeof body?.withNarration === "boolean"
          ? body.withNarration
          : true;
    const durationRaw = Number(body?.durationSeconds);
    const duration = [5, 10, 15, 30, 45, 60, 90, 135].includes(durationRaw) ? durationRaw : 0;
    // Accept both the canonical field name (imageUrl) and the Make Film Wizard
    // alias (productUrl) so the frontend and backend stay compatible.
    const imageUrlRaw =
      (typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "") ||
      (typeof body?.productUrl === "string" ? body.productUrl.trim() : "");
    const autoFromImageReq = body?.autoFromImage === true;
    // The Make Film Wizard does not send `mode`; it sends productUrl/productName
    // and characterUrl/characterName directly. Treat the presence of a product
    // as a product-ad scenario, and a character without a product as a
    // character-sheet scenario, so the frontend and backend agree.
    const hasProductFields =
      typeof body?.productUrl === "string" && body.productUrl.trim().length > 0
        ? true
        : typeof body?.productName === "string" && body.productName.trim().length > 0;
    const hasCharacterFields =
      typeof body?.characterUrl === "string" && body.characterUrl.trim().length > 0
        ? true
        : typeof body?.characterName === "string" && body.characterName.trim().length > 0;
    const isProductAd = body?.mode === "product-ad" || hasProductFields;
    const isCharacterSheet = body?.mode === "character-sheet" || (hasCharacterFields && !hasProductFields);
    const clip = (v: unknown, max: number): string | undefined => {
      const s = typeof v === "string" ? v.trim() : "";
      return s ? s.slice(0, max) : undefined;
    };
    const productAd: ProductAdOpts | undefined = isProductAd
      ? {
          productName: clip(body?.productName, 200),
          productDescription: clip(body?.productDescription, 2000),
          cameraStyle: clip(body?.cameraStyle, 100),
          cameraMovement: clip(body?.cameraMovement, 1000),
          genre: clip(body?.genre, 300),
          scene: clip(body?.scene, 300),
          characterDescription: clip(body?.characterDescription, 2000),
        }
      : undefined;
    const characterSheet: CharacterSheetOpts | undefined = isCharacterSheet
      ? {
          characterName: clip(body?.characterName, 200),
          characterDescription: clip(body?.characterDescription, 2000),
          cameraStyle: clip(body?.cameraStyle, 100),
          cameraMovement: clip(body?.cameraMovement, 1000),
          genre: clip(body?.genre, 300),
          scene: clip(body?.scene, 300),
        }
      : undefined;
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const ALLOWED_HOST_SUFFIXES = [supabaseHost, ".supabase.co", ".supabase.in"].filter(Boolean);
    const isAllowedImageUrl = (u: string): boolean => {
      try {
        const p = new URL(u);
        if (p.protocol !== "https:") return false;
        const h = p.hostname.toLowerCase();
        return ALLOWED_HOST_SUFFIXES.some((s) => s.startsWith(".") ? h.endsWith(s) : h === s);
      } catch { return false; }
    };
    const imageUrl =
      imageUrlRaw && imageUrlRaw.length <= 2048 && isAllowedImageUrl(imageUrlRaw)
        ? imageUrlRaw
        : undefined;

    // Attach an optional character reference image (product-ad mode only).
    // Only used when a product image is present, since prompts reference it as
    // the "second attached image".
    if (productAd && imageUrl) {
      const charRaw =
        (typeof body?.characterImageUrl === "string" ? body.characterImageUrl.trim() : "") ||
        (typeof body?.characterUrl === "string" ? body.characterUrl.trim() : "");
      if (charRaw && charRaw.length <= 2048 && isAllowedImageUrl(charRaw)) {
        productAd.characterImageUrl = charRaw;
      }
    }

    if (isCharacterSheet && !imageUrl) {
      return new Response(JSON.stringify({ error: "A character image is required for Character Sheet mode." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!idea && !imageUrl && !productAd?.productName && !characterSheet?.characterName) {
      return new Response(JSON.stringify({ error: "idea or imageUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (idea.length > 16000) {
      return new Response(JSON.stringify({ error: "idea too long (max 16000 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!duration) {
      return new Response(JSON.stringify({ error: "durationSeconds must be 5, 10, 15, 30, 45, 60, 90, or 135" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!businessInfo) {
      return new Response(JSON.stringify({ error: "Business information is required to write a scenario." }), {
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

    const autoFromImage = autoFromImageReq && Boolean(imageUrl) && !productAd && !characterSheet;
    const effectiveIdea = idea
      || (productAd?.productName ? `Create an advertisement for ${productAd.productName}.` : "")
      || (characterSheet?.characterName ? `Create a film built around the character "${characterSheet.characterName}".` : "")
      || (characterSheet ? "Create a film built around the character in the attached image." : "Generate a scenario based on the attached reference image.");
    // Inline private-bucket images as data URLs so the gateway can read them.
    const resolvedImageUrl = imageUrl ? await resolveImageForGateway(imageUrl) : imageUrl;
    if (productAd?.characterImageUrl) {
      productAd.characterImageUrl = await resolveImageForGateway(productAd.characterImageUrl);
    }
    let resp = await callGateway(apiKey, duration, effectiveIdea, resolvedImageUrl, productAd, autoFromImage, characterSheet, businessInfo, outputLanguage, narration);

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

    let data = await readJsonLoose(resp, "scenario-write");
    let raw: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    let scenes = parseScenes(raw, duration);

    // One retry for multi-scene durations if we didn't get the expected count.
    const expected = expectedSceneCount(duration);
    if (expected > 1 && scenes.length === 0) {
      resp = await callGateway(apiKey, duration, effectiveIdea, resolvedImageUrl, productAd, autoFromImage, characterSheet, businessInfo, outputLanguage, narration);
      if (resp.ok) {
        data = await readJsonLoose(resp, "scenario-write");
        raw = (data?.choices?.[0]?.message?.content ?? "").trim();
        scenes = parseScenes(raw, duration);
      }
    }

    if (scenes.length === 0) {
      // Final fallback: return the raw text as a single block so the UI still has something.
      if (expected > 1) {
        const fallback = stripQuotes(raw);
        if (!fallback) {
          return new Response(JSON.stringify({ error: "Empty AI response" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ scenario: fallback, scenes: [fallback], warning: `Could not split into ${expected} scenes` }),
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
