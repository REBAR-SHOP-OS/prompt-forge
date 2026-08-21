// scenario-write edge function: turns an idea + target duration into a single
// cohesive English video scenario/treatment via Lovable AI Gateway.
// For 45s, returns three sequential 15s scene prompts.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";
import {
  getScenarioDurationPolicy,
  getPlanDurationPolicy,
  runScenarioQualityPass,
  runPlanQualityPass,
  SCENE_DELIMITER,
} from "./scenario-policy.ts";

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
    bits.push(`Use this genre/atmosphere ONLY as creative INSPIRATION: ${opts.genre}. Borrow its mood, energy, lighting feel, and color sensibility, then reinterpret and adapt it tastefully so it fits THIS specific ${heroLabel} and a believable advertising context. Do NOT literally recreate that genre's world, setting, or clichés — the ${heroLabel} and its real selling points stay the clear focus.`);
  }
  if (opts.scene) {
    bits.push(`Draw INSPIRATION from this environment/location: ${opts.scene}. Adapt its setting, lighting, textures, and atmosphere to suit the ${heroLabel} and the ad, rather than copying the location exactly, while keeping the ${heroLabel} the clear hero of the film.`);
  }

  return bits.join(" ");
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fa: "Persian (Farsi)",
  ar: "Arabic",
  tr: "Turkish",
  es: "Spanish",
  fr: "French",
};

const NARRATION_LABELS: Record<string, string> = {
  en: "Narration",
  fa: "نریشن",
  ar: "التعليق الصوتي",
  tr: "Anlatım",
  es: "Narración",
  fr: "Narration",
};

/**
 * Build the system prompt for scenario generation.
 *
 * When unit === "plan", the scenario is written as a sequence of 5-second
 * plans/shots instead of 15-second scenes/cards. The key changes:
 * - duration maps to duration/5 plans
 * - each plan is one 5-second beat
 * - narration is written for the whole film and divided across plans
 * - camera coverage cycles wide/medium/close per card
 */
export function buildSystemPrompt(
  duration: number,
  productAd?: ProductAdOpts,
  autoFromImage?: boolean,
  characterSheet?: CharacterSheetOpts,
  businessInfo?: string,
  outputLanguage = "en",
  narration = true,
  unit: "scene" | "plan" = "scene",
): string {
  const langName = LANGUAGE_NAMES[outputLanguage] ?? "English";
  const isEnglish = outputLanguage === "en";
  const languageLine = isEnglish
    ? "Write the entire scenario in ENGLISH, regardless of the input language."
    : `Write the ENTIRE scenario — all narration, all spoken dialogue, and all on-screen action descriptions — in ${langName}, regardless of the input language. Do not output any English. Keep concrete camera-move and lighting terms clear and natural in ${langName}.`;
  const productName = productAd?.productName?.trim();
  const businessLine = businessInfo
    ? [
        `Business context (provided by the user): ${businessInfo}.`,
        productName
          ? `The user's selected product is "${productName}" (it matches the attached product image). Every shot, every beat, every narration line, and every spoken word MUST promote THIS specific product within the context of the above business.`
          : `Every shot, every beat, every narration line, and every spoken word MUST promote the user's selected product/subject within the context of the above business.`,
        "The scenario must stay tightly relevant to this business and product. Do not drift into unrelated topics, products, services, or themes.",
      ].join(" ")
    : "";
  const durationPolicy = getScenarioDurationPolicy(duration);
  const planPolicy = getPlanDurationPolicy(duration);
  const sceneCount = durationPolicy.sceneCount;
  const planCount = planPolicy.planCount;
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
          ? narration
            ? "This commercial ALSO features a recurring human character provided as a SECOND attached image. Carefully analyze that second image and feature this exact character on screen interacting with the product, keeping their face, hairstyle, wardrobe, and body type perfectly consistent and recognizable across every shot, while the product remains the clear hero. This character is the on-screen SPOKESPERSON/PRESENTER who SPEAKS directly to the viewer: they must talk and verbally promote the product. Include the character's spoken lines (narration/dialogue) that pitch the product's key benefits in a natural, confident, persuasive tone, ending on a strong call-to-action. Keep spoken lines short and realistically timed to the duration."
            : "This commercial ALSO features a recurring human character provided as a SECOND attached image. Carefully analyze that second image and feature this exact character on screen interacting silently with the product, keeping their face, hairstyle, wardrobe, and body type perfectly consistent and recognizable across every shot, while the product remains the clear hero. Communicate the product's benefits and call-to-action through visible actions, expressions, staging, and product-focused imagery only."
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
  const narrationLabel = NARRATION_LABELS[outputLanguage] ?? NARRATION_LABELS.en;
  const narrationSpeaker = isCharacter
    ? "the lead character's spoken dialogue"
    : adWithCharacter
      ? "the on-screen character's spoken dialogue that promotes the product"
      : "a persuasive voiceover line that promotes the product";

  // ---------------------------------------------------------------------------
  // Plan-based system prompt (unit === "plan")
  // ---------------------------------------------------------------------------
  if (unit === "plan") {
    const numWord = planCount === 1 ? "ONE" : planCount === 2 ? "TWO" : planCount === 3 ? "THREE"
      : planCount === 6 ? "SIX" : planCount === 9 ? "NINE" : planCount === 12 ? "TWELVE"
      : planCount === 18 ? "EIGHTEEN" : planCount === 27 ? "TWENTY-SEVEN" : String(planCount);
    const longForm = isCharacter ? "character-driven film" : isAd ? "product advertisement" : "commercial";

    const planNarrationFormat = narration
      ? [
          `STRUCTURE THE ENTIRE SCENARIO AS ONE CONTINUOUS NARRATIVE, then split it into ${planCount} sequential 5-second plans.`,
          `Each plan must be a self-contained video prompt (subject, action, camera move, lighting) that continues the story from the previous plan.`,
          ``,
          `NARRATION INSTRUCTIONS: Write narration for the ENTIRE film as one coherent voiceover, then divide it naturally across the ${planCount} plans.`,
          `Keep the total narration within ${planPolicy.maxSpokenWordsPerFilm} naturally speakable words (~2 words per second).`,
          `Start each plan's narration on a NEW line with the exact label "${narrationLabel}:" followed by that plan's spoken lines in quotes.`,
          `The narration text counts toward each plan's word limit. Keep spoken lines short and realistically timed to 5 seconds with natural pauses.`,
        ].join(" ")
      : [
          `Write the VISUAL scenario ONLY — subject, action, camera move, and lighting.`,
          `Do NOT include any narration, voiceover, spoken dialogue, captions, or the "${narrationLabel}:" label. No spoken words at all.`,
        ].join(" ");

    const coverageLine = planCount > 1
      ? `Camera coverage cycles across the film: ${planPolicy.coverage.join(" → ")}. Each plan must explicitly use its assigned coverage (wide = establishing, medium = mid-shot, close = detail/face).`
      : `Use a medium shot for this single plan.`;

    return [
      persona,
      businessLine,
      languageLine,
      `Given the user's brief, write a CONTINUOUS narrative scenario for a ${duration}-second cinematic ${longForm},`,
      `structured as ${numWord} sequential 5-second plans (shots) that flow into each other.`,
      "The scenario MUST follow a clear story arc across the whole sequence: the opening plan is an attention-grabbing hook that establishes the subject and setting, the middle plans develop the story and build interest and desire, and the final plan delivers a defined payoff/resolution that ends on a strong, memorable note.",
      `Output EXACTLY ${planCount} plan blocks separated by the literal delimiter "${SCENE_DELIMITER}" on its own line.`,
      `Do not number the plans, no markdown, no preamble.`,
      `Each plan is a 5-second clip with exactly ONE beat (0-5s).`,
      "For each plan, specify the concrete ACTION, the FRAME/CAMERA MOVE, the LIGHTING or EMOTIONAL change, and clear STORY PROGRESS. Make every plan vivid, specific, exciting, and meaningfully different from the previous plan.",
      `Each plan must be ${planPolicy.minWordsPerPlan}-${planPolicy.maxWordsPerPlan} words and self-contained as a video prompt (include subject, action, camera move, lighting),`,
      "while clearly continuing the story from the previous plan.",
      "Vary the shot, movement, environment and story progress across plans, but keep the product/character identity and continuity consistent.",
      coverageLine,
      planNarrationFormat,
    ].filter(Boolean).join(" ");
  }

  // ---------------------------------------------------------------------------
  // Scene-based system prompt (unit === "scene", legacy/default)
  // ---------------------------------------------------------------------------
  const narrationFormat = narration
    ? [
        `STRUCTURE EACH SCENE IN TWO PARTS, in this exact order:`,
        `(1) First write the VISUAL scenario only — subject, action, camera move, and lighting — with NO spoken words mixed in.`,
        `(2) Then, on a NEW line, write the narration on its own line, starting with the exact label "${narrationLabel}:" followed by ${narrationSpeaker} in quotes.`,
        `The narration text counts toward the word limit. Keep spoken lines short and realistically timed to the duration.`,
      ].join(" ")
    : [
        `Write the VISUAL scenario ONLY — subject, action, camera move, and lighting.`,
        `Do NOT include any narration, voiceover, spoken dialogue, captions, or the "${narrationLabel}:" label. No spoken words at all.`,
      ].join(" ");
  const narrationMulti = narration
    ? [
        narrationFormat,
        `Each scene is 15 seconds. Cap the narration for a scene at ~30 words (about 2 words per second) so it fits the time with natural pauses. Do not exceed the scene's time budget.`,
      ].join(" ")
    : narrationFormat;
  const narrationSingle = narrationFormat;
  const labelNote = narration
    ? ` The only label allowed is the "${narrationLabel}:" line described below.`
    : ` Do not include any labels.`;

  if (sceneCount > 1) {
    const numWord = sceneCount === 2 ? "TWO" : sceneCount === 3 ? "THREE" : sceneCount === 9 ? "NINE" : String(sceneCount);
    const longForm = isCharacter ? "character-driven film" : isAd ? "product advertisement" : "commercial";
    return [
      persona,
      businessLine,
      languageLine,
      `Given the user's brief, write a CONTINUOUS narrative scenario for a ${duration}-second cinematic ${longForm},`,
      `structured as ${numWord} sequential 15-second scenes that flow into each other.`,
      "The scenario MUST follow a clear story arc across the whole sequence: the opening scene is an attention-grabbing hook that establishes the subject and setting, the middle scenes develop the story and build interest and desire, and the final scene delivers a defined payoff/resolution that ends on a strong, memorable note.",
      `Output EXACTLY ${sceneCount} scene blocks separated by the literal delimiter "${SCENE_DELIMITER}" on its own line.`,
      `Do not number the scenes, no markdown, no preamble.${labelNote}`,
      `Each scene is a 15-second clip with exactly ${durationPolicy.beatsPerScene} contiguous, non-overlapping timed beats: ${durationPolicy.timedBeats}.`,
      "For each beat, specify the concrete ACTION, the FRAME/CAMERA MOVE, the LIGHTING or EMOTIONAL change, and clear STORY PROGRESS. Make every beat vivid, specific, exciting, and meaningfully different from the previous beat.",
      `Each scene must be ${durationPolicy.minWordsPerScene}-${durationPolicy.maxWordsPerScene} words and self-contained as a video prompt (include subject, action, camera move, lighting),`,
      "while clearly continuing the story from the previous scene.",
      "Vary the shot, movement, environment and story progress across scenes, but keep the product/character identity and continuity consistent.",
      narrationMulti,
    ].filter(Boolean).join(" ");
  }
  const singleForm = isCharacter ? "character-driven film scenario" : isAd ? "product advertisement" : "advertising scenario/treatment";
  return [
    persona,
    businessLine,
    languageLine,
    `Given the user's brief, write a single cohesive ${singleForm}`,
    `suitable for a ${duration}-second cinematic video.`,
    "It MUST follow a clear narrative arc with a defined beginning, middle, and end: an attention-grabbing opening hook that establishes the subject and setting, a middle that develops the story, and a clear payoff/resolution that ends on a strong, memorable note.",
    `Use exactly ${durationPolicy.beatsPerScene} continuous timed visual beat${durationPolicy.beatsPerScene === 1 ? "" : "s"}: ${durationPolicy.timedBeats}.`,
    "In every beat specify concrete ACTION, FRAME or CAMERA MOVEMENT, a LIGHTING or EMOTIONAL CHANGE, and forward STORY PROGRESS. Keep the writing vivid, exciting, specific, and non-repetitive.",
    `Output prose only — no markdown headings, no bullet lists, no preamble.${labelNote}`,
    `Write ${durationPolicy.minWordsPerScene}-${durationPolicy.maxWordsPerScene} words total.`,
    `Keep narration and dialogue within ${durationPolicy.maxSpokenWordsPerScene} naturally speakable words so it fits the duration with pauses.`,
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
  outputLanguage = "en",
  narration = true,
  correctiveInstruction?: string,
  unit: "scene" | "plan" = "scene",
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
  const baseUserContent: unknown = imageUrl
    ? contentBlocks
    : (productAd || characterSheet) ? `Brief: ${idea}` : `Idea: ${idea}`;
  if (correctiveInstruction && imageUrl) {
    contentBlocks.push({ type: "text", text: correctiveInstruction });
  }
  const userContent: unknown = correctiveInstruction && !imageUrl
    ? `${baseUserContent}\n\n${correctiveInstruction}`
    : baseUserContent;

  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: buildSystemPrompt(duration, productAd, autoFromImage, characterSheet, businessInfo, outputLanguage, narration, unit) },
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

    // Determine unit: "plan" when explicitly requested, otherwise "scene" (legacy).
    const unit: "scene" | "plan" = body?.unit === "plan" ? "plan" : "scene";

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
    const resp = await callGateway(apiKey, duration, effectiveIdea, resolvedImageUrl, productAd, autoFromImage, characterSheet, businessInfo, outputLanguage, narration, undefined, unit);

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

    const data = await readJsonLoose(resp, "scenario-write");
    const raw: string = (data?.choices?.[0]?.message?.content ?? "").trim();

    // Use plan-based quality pass when unit === "plan".
    const quality = unit === "plan"
      ? await runPlanQualityPass(duration, raw, async (correctiveInstruction) => {
        const retryResp = await callGateway(
          apiKey,
          duration,
          effectiveIdea,
          resolvedImageUrl,
          productAd,
          autoFromImage,
          characterSheet,
          businessInfo,
          outputLanguage,
          narration,
          correctiveInstruction,
          unit,
        );
        if (!retryResp.ok) {
          console.error("scenario-write corrective retry error", retryResp.status);
          return null;
        }
        const retryData = await readJsonLoose(retryResp, "scenario-write corrective retry");
        return (retryData?.choices?.[0]?.message?.content ?? "").trim();
      })
      : await runScenarioQualityPass(duration, raw, async (correctiveInstruction) => {
        const retryResp = await callGateway(
          apiKey,
          duration,
          effectiveIdea,
          resolvedImageUrl,
          productAd,
          autoFromImage,
          characterSheet,
          businessInfo,
          outputLanguage,
          narration,
          correctiveInstruction,
          unit,
        );
        if (!retryResp.ok) {
          console.error("scenario-write corrective retry error", retryResp.status);
          return null;
        }
        const retryData = await readJsonLoose(retryResp, "scenario-write corrective retry");
        return (retryData?.choices?.[0]?.message?.content ?? "").trim();
      });

    const scenes = quality.scenes;

    if (scenes.length === 0) {
      // For plan mode, an empty result means the model did not produce the
      // required planCount sections even after the corrective retry. Surface a
      // precise, actionable message (the retry already happened inside the
      // quality pass) rather than a generic "Empty AI response".
      const error =
        unit === "plan"
          ? `The AI did not return the ${getPlanDurationPolicy(duration).planCount} required 5-second plans. Please try again.`
          : "Empty AI response";
      return new Response(JSON.stringify({ error }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scenario = scenes.join("\n\n");

    return new Response(JSON.stringify({ scenario, scenes, ...(quality.warning ? { warning: quality.warning } : {}) }), {
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
