// Pure prompt-building logic for the scenario-write edge function.
// Kept free of Deno-specific imports so it can be unit-tested under vitest.

const WORD_CAPS: Record<number, number> = { 5: 40, 10: 70, 15: 100, 30: 180, 45: 270, 60: 360, 90: 540, 135: 810 };
const BEAT_GUIDE: Record<number, string> = {
  5: "5s = 1 beat (one decisive shot)",
  10: "10s = 2 beats",
  15: "15s = 3 beats",
  30: "30s = two sequential 15s scenes",
  45: "45s = three sequential 15s scenes",
  60: "60s = four sequential 15s scenes",
  90: "90s = six sequential 15s scenes",
  135: "135s = nine sequential 15s scenes",
};

const SCENE_DELIM = "===SCENE===";

export function expectedSceneCount(duration: number): number {
  if (duration === 135) return 9;
  if (duration === 90) return 6;
  if (duration === 60) return 4;
  if (duration === 45) return 3;
  if (duration === 30) return 2;
  return 1;
}

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

export function buildSystemPrompt(
  duration: number,
  productAd?: ProductAdOpts,
  autoFromImage?: boolean,
  characterSheet?: CharacterSheetOpts,
  businessInfo?: string,
  outputLanguage = "en",
  narration = true,
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
          ? `This commercial ALSO features a recurring human character provided as a SECOND attached image. Carefully analyze that second image and feature this exact character on screen interacting with the product, keeping their face, hairstyle, wardrobe, and body type perfectly consistent and recognizable across every shot, while the product remains the clear hero. ${
              narration
                ? "This character is the on-screen SPOKESPERSON/PRESENTER who SPEAKS directly to the viewer: they must talk and verbally promote the product. Include the character's spoken lines (narration/dialogue) that pitch the product's key benefits in a natural, confident, persuasive tone, ending on a strong call-to-action. Keep spoken lines short and realistically timed to the duration."
                : "This character must remain SILENT — no spoken words, no dialogue, no voiceover. Convey the product's appeal purely through the character's on-screen actions, expressions, and visual interaction with the product."
            }`
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
      `Output EXACTLY ${sceneCount} scene blocks separated by the literal delimiter "${SCENE_DELIM}" on its own line.`,
      `Do not number the scenes, no markdown, no preamble.${labelNote}`,
      "Each scene is a 15-second clip. Break EVERY scene into contiguous, non-overlapping timed beats that sum EXACTLY to 15 seconds: 0-4s, 4-9s, 9-15s.",
      "For each beat, specify the concrete ACTION, the FRAME/CAMERA MOVE, the VISUAL/EMOTIONAL change, and the LIGHTING. Make the beats vivid and specific (subject, gesture, camera push/pull/pan, light shift, mood) so the scene is dense and varied, not a single flat description.",
      "Each scene must be 70-90 words and self-contained as a video prompt (include subject, action, camera move, lighting),",
      "while clearly continuing the story from the previous scene.",
      "Vary the shot, movement, environment and story progress across scenes, but keep the product/character identity and continuity consistent.",
      narrationMulti,
    ].filter(Boolean).join(" ");
  }
  const cap = WORD_CAPS[duration];
  const beat = BEAT_GUIDE[duration];
  const singleForm = isCharacter ? "character-driven film scenario" : isAd ? "product advertisement" : "advertising scenario/treatment";
  return [
    persona,
    businessLine,
    languageLine,
    `Given the user's brief, write a single cohesive ${singleForm}`,
    `suitable for a ${duration}-second cinematic video.`,
    "It MUST follow a clear narrative arc with a defined beginning, middle, and end: an attention-grabbing opening hook that establishes the subject and setting, a middle that develops the story, and a clear payoff/resolution that ends on a strong, memorable note.",
    "Include opening visual hook, beat-by-beat action, camera/lighting cues, and a clear ending.",
    `Match pacing realistically to the duration: ${beat}.`,
    `Output prose only — no markdown headings, no bullet lists, no preamble.${labelNote}`,
    `Keep it under ${cap} words.`,
    narrationSingle,
  ].filter(Boolean).join(" ");
}
