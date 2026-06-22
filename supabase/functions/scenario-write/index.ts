// scenario-write edge function: turns an idea + target duration into a single
// cohesive English video scenario/treatment via Lovable AI Gateway.
// For 45s, returns three sequential 15s scene prompts.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

const WORD_CAPS: Record<number, number> = { 5: 40, 10: 70, 15: 100, 30: 180, 45: 270, 135: 810 };
const BEAT_GUIDE: Record<number, string> = {
  5: "5s = 1 beat (one decisive shot)",
  10: "10s = 2 beats",
  15: "15s = 3 beats",
  30: "30s = two sequential 15s scenes",
  45: "45s = three sequential 15s scenes",
  135: "135s = nine sequential 15s scenes",
};

const SCENE_DELIM = "===SCENE===";

function expectedSceneCount(duration: number): number {
  if (duration === 135) return 9;
  if (duration === 45) return 3;
  if (duration === 30) return 2;
  return 1;
}

interface ProductAdOpts {
  productName?: string;
  productDescription?: string;
  cameraStyle?: string;
  cameraMovement?: string;
  genre?: string;
  scene?: string;
  characterImageUrl?: string;
  characterDescription?: string;
}

interface CharacterSheetOpts {
  characterName?: string;
  characterDescription?: string;
  cameraStyle?: string;
  cameraMovement?: string;
  genre?: string;
  scene?: string;
}

function cameraGuidance(opts: ProductAdOpts | CharacterSheetOpts, heroLabel = "product"): string {
  const bits: string[] = [];
  if (opts.cameraStyle) {
    bits.push(`Use a "${opts.cameraStyle}" camera style as the dominant cinematic technique throughout, and explicitly name this camera move in the shot descriptions.`);
  }
  if (opts.cameraMovement) {
    bits.push(`Honor these specific camera-movement notes from the user: ${opts.cameraMovement}.`);
  }
  if (opts.genre) {
    bits.push(`Direct the entire scenario in this genre/atmosphere: ${opts.genre}. Apply its mood, lighting, color palette, and visual style consistently across every shot while keeping the ${heroLabel} the clear hero of the film.`);
  }
  if (opts.scene) {
    bits.push(`Set the entire scenario in this environment/location: ${opts.scene}. Use its setting, lighting, textures, and atmosphere consistently across every shot while keeping the ${heroLabel} the clear hero of the film.`);
  }
  return bits.join(" ");
}

function buildSystemPrompt(
  duration: number,
  productAd?: ProductAdOpts,
  autoFromImage?: boolean,
  characterSheet?: CharacterSheetOpts,
  businessInfo?: string,
): string {
  const businessLine = businessInfo
    ? `Business context (provided by the user): ${businessInfo}. Every narration line, every spoken word, and the entire scenario MUST stay tightly relevant to this business and promote the user's selected product/subject. Do not drift into unrelated topics, products, or themes.`
    : "";
  const sceneCount = expectedSceneCount(duration);
  const isAd = Boolean(productAd);
  const isCharacter = Boolean(characterSheet);
  const autoLine = autoFromImage
    ? "You are a world-class advertising creative director writing a persuasive, commercial-style scenario. The user provided ONLY a reference image and no written idea. First, carefully analyze the attached image — identify the main subject, setting, mood, colors, lighting, props, and overall style — then invent a compelling advertising scenario that is faithful to and inspired by what you see in the image, built to promote and sell that subject."
    : "";
  const productLine = isAd
    ? [
        "You are a world-class advertising creative director writing a high-energy PRODUCT COMMERCIAL scenario.",
        productAd?.productName ? `The hero product is "${productAd.productName}".` : "Center the scenario on the product in the user's brief.",
        productAd?.productDescription ? `Product details: ${productAd.productDescription}.` : "",
        "Make the product the unmistakable hero of every shot: show it prominently, highlight its look, texture, and key selling points, and build desire.",
        productAd?.characterImageUrl
          ? "This commercial ALSO features a recurring human character provided as a SECOND attached image. Carefully analyze that second image and feature this exact character on screen interacting with the product, keeping their face, hairstyle, wardrobe, and body type perfectly consistent and recognizable across every shot, while the product remains the clear hero. This character is the on-screen SPOKESPERSON/PRESENTER who SPEAKS directly to the viewer: they must talk and verbally promote the product. Include the character's spoken lines (narration/dialogue) that pitch the product's key benefits in a natural, confident, persuasive tone, ending on a strong call-to-action. Keep spoken lines short and realistically timed to the duration."
          : "",
        productAd?.characterDescription ? `Character notes: ${productAd.characterDescription}.` : "",
        cameraGuidance(productAd ?? {}),
      ].filter(Boolean).join(" ")
    : "";
  const characterLine = isCharacter
    ? [
        "You are a world-class film director writing a cinematic film scenario built entirely around a single LEAD CHARACTER.",
        "The attached image IS this lead character — carefully analyze it first: identify the character's appearance, gender, approximate age, face, hairstyle, wardrobe/costume, body type, distinctive features, expression, and overall vibe.",
        characterSheet?.characterName ? `The character's name is "${characterSheet.characterName}".` : "",
        characterSheet?.characterDescription ? `Additional character notes: ${characterSheet.characterDescription}.` : "",
        "Make this exact character the protagonist of every shot and keep their look (face, hair, wardrobe, body) perfectly consistent and recognizable across the whole film. Describe the character in concrete visual detail in each shot so the look never drifts.",
        "Build a compelling story that revolves around this character, with clear actions and emotions driven by them.",
        cameraGuidance(characterSheet ?? {}, "character"),
      ].filter(Boolean).join(" ")
    : "";
  const persona = isCharacter
    ? characterLine
    : isAd
      ? productLine
      : (autoFromImage ? autoLine : "You are a world-class advertising creative director who writes persuasive, commercial-style video scenarios designed to promote and sell the subject.");

  const adWithCharacter = isAd && Boolean(productAd?.characterImageUrl);
  const narrationMulti = adWithCharacter
    ? `In EVERY scene, weave in the character's spoken dialogue as narration that promotes the product, formatted inline as Character says: "...". The spoken lines count toward the scene word count.`
    : "";
  const narrationSingle = adWithCharacter
    ? `Weave in the character's spoken dialogue as narration that promotes the product, formatted inline as Character says: "...". The spoken lines count toward the word limit.`
    : "";

  if (sceneCount > 1) {
    const numWord = sceneCount === 2 ? "TWO" : sceneCount === 3 ? "THREE" : sceneCount === 9 ? "NINE" : String(sceneCount);
    const longForm = isCharacter ? "character-driven film" : isAd ? "product advertisement" : "commercial";
    return [
      persona,
      businessLine,
      `Given the user's brief, write a CONTINUOUS narrative scenario in ENGLISH for a ${duration}-second cinematic ${longForm},`,
      `structured as ${numWord} sequential 15-second scenes that flow into each other.`,
      "The scenario MUST follow a clear story arc across the whole sequence: the opening scene is an attention-grabbing hook that establishes the subject and setting, the middle scenes develop the story and build interest and desire, and the final scene delivers a defined payoff/resolution that ends on a strong, memorable note.",
      `Output EXACTLY ${sceneCount} scene blocks separated by the literal delimiter "${SCENE_DELIM}" on its own line.`,
      "Do not number the scenes, do not add headings or labels, no markdown, no preamble, no quotes.",
      "Each scene must be 70-90 words and self-contained as a video prompt (include subject, action, camera move, lighting),",
      "while clearly continuing the story from the previous scene.",
      narrationMulti,
    ].filter(Boolean).join(" ");
  }
  const cap = WORD_CAPS[duration];
  const beat = BEAT_GUIDE[duration];
  const singleForm = isCharacter ? "character-driven film scenario" : isAd ? "product advertisement" : "advertising scenario/treatment";
  return [
    persona,
    businessLine,
    `Given the user's brief, write a single cohesive ${singleForm} in ENGLISH`,
    `suitable for a ${duration}-second cinematic video — regardless of the input language.`,
    "It MUST follow a clear narrative arc with a defined beginning, middle, and end: an attention-grabbing opening hook that establishes the subject and setting, a middle that develops the story, and a clear payoff/resolution that ends on a strong, memorable note.",
    "Include opening visual hook, beat-by-beat action, camera/lighting cues, and a clear ending.",
    `Match pacing realistically to the duration: ${beat}.`,
    "Output prose only — no markdown headings, no bullet lists, no preamble, no quotes.",
    `Keep it under ${cap} words.`,
    narrationSingle,
  ].filter(Boolean).join(" ");
}

async function callGateway(
  apiKey: string,
  duration: number,
  idea: string,
  imageUrl?: string,
  productAd?: ProductAdOpts,
  autoFromImage?: boolean,
  characterSheet?: CharacterSheetOpts,
  businessInfo?: string,
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
        { role: "system", content: buildSystemPrompt(duration, productAd, autoFromImage, characterSheet, businessInfo) },
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
    const durationRaw = Number(body?.durationSeconds);
    const duration = [5, 10, 15, 30, 45, 135].includes(durationRaw) ? durationRaw : 0;
    const imageUrlRaw = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const autoFromImageReq = body?.autoFromImage === true;
    const isProductAd = body?.mode === "product-ad";
    const isCharacterSheet = body?.mode === "character-sheet";
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
      const charRaw = typeof body?.characterImageUrl === "string" ? body.characterImageUrl.trim() : "";
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
      return new Response(JSON.stringify({ error: "durationSeconds must be 5, 10, 15, 30, 45, or 135" }), {
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
    let resp = await callGateway(apiKey, duration, effectiveIdea, resolvedImageUrl, productAd, autoFromImage, characterSheet, businessInfo);

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

    // One retry for multi-scene durations if we didn't get the expected count.
    const expected = expectedSceneCount(duration);
    if (expected > 1 && scenes.length === 0) {
      resp = await callGateway(apiKey, duration, effectiveIdea, resolvedImageUrl, productAd, autoFromImage, characterSheet, businessInfo);
      if (resp.ok) {
        data = await resp.json();
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
