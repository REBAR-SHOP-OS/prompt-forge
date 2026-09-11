// Pure prompt-building logic for the scenario-write edge function.
// Kept free of Deno-specific imports so it can be unit-tested under vitest.

import { getScenarioDurationPolicy, getPlanDurationPolicy, SCENE_DELIMITER } from "./scenario-policy.ts";

export interface ProductAdOpts {
  productName?: string;
  productDescription?: string;
  cameraStyle?: string;
  cameraMovement?: string;
  genre?: string;
  scene?: string;
  characterImageUrl?: string;
  characterDescription?: string;
}

export interface CharacterSheetOpts {
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
            : "This commercial ALSO features a recurring human character provided as a SECOND attached image. Carefully analyze that second image and feature this exact character on screen interacting with the product, keeping their face, hairstyle, wardrobe, and body type perfectly consistent and recognizable across every shot, while the product remains the clear hero. This character must remain SILENT — no spoken words, no dialogue, no voiceover. Convey the product's appeal purely through the character's on-screen actions, expressions, and visual interaction with the product."
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
