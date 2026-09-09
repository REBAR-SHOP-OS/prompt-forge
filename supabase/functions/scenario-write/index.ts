// scenario-write edge function: turns an idea + target duration into a single
// cohesive English video scenario/treatment via Lovable AI Gateway.
// For 45s, returns three sequential 15s scene prompts.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";

import { buildSystemPrompt, type ProductAdOpts, type CharacterSheetOpts } from "./prompt.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import {
  getScenarioDurationPolicy,
  getPlanDurationPolicy,
  runScenarioQualityPass,
  runPlanQualityPass,
  SCENE_DELIMITER,
} from "./scenario-policy.ts";
import {
  buildScenarioFingerprint,
  buildSemanticJudgePrompt,
  parseSemanticJudgeResult,
  runAntiDuplicatePass,
  type ScenarioHistoryEntry,
} from "./scenario-fingerprint.ts";
import { releaseScenarioLease } from "./scenario-lease.ts";

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
      model: "google/gemini-3-flash-preview",
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

    // -------------------------------------------------------------------------
    // Anti-duplicate (two-stage): reject a scenario that is an exact or
    // near/semantic duplicate of a film this user already made.
    //
    // Stage 1 is a fast structural fingerprint; Stage 2 is an LLM semantic
    // judge (existing Lovable gateway, no new provider) for the ambiguous band.
    // Product/character identity is metadata only — a re-told story with a new
    // identity is still a duplicate.
    //
    // History is persistent, user-scoped, and NOT capped at 20: we read ALL of
    // the user's accepted scenarios (paginated) and compare against every one.
    //
    // Concurrency: a per-user lease serializes generate→check→insert so two
    // simultaneous requests cannot both accept a similar concept. If the lease
    // cannot be acquired, we fail closed (409).
    // -------------------------------------------------------------------------
    const subjectCombo = [
      productAd?.productName ? `product:${productAd.productName}` : "",
      characterSheet?.characterName ? `character:${characterSheet.characterName}` : "",
    ]
      .filter(Boolean)
      .join("|");

    const serviceClient = getServiceClient();

    // Acquire the per-user lease. Fail closed if another request is in flight.
    let leaseToken: string | null = null;
    try {
      const { data: leaseData, error: leaseErr } = await serviceClient.rpc(
        "generator_acquire_scenario_lease",
        { _user_id: auth.userId, _ttl_seconds: 120 },
      );
      if (leaseErr || !leaseData) {
        const busy = String(leaseErr?.message ?? "").includes("scenario_busy");
        return new Response(
          JSON.stringify({
            error: busy
              ? "Another film is already being generated for you. Please wait a moment and try again."
              : "Could not start the film. Please try again.",
          }),
          { status: busy ? 409 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      leaseToken = leaseData as string;
    } catch (leaseAcquireErr) {
      console.error("scenario-write lease acquire error", leaseAcquireErr);
      return new Response(JSON.stringify({ error: "Could not start the film. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      // Load the user's FULL history (paginated). A read failure fails closed:
      // we must not accept a scenario we could not check against history.
      const historyEntries: ScenarioHistoryEntry[] = [];
      const PAGE = 200;
      let from = 0;
      let historyLoadFailed = false;
      while (true) {
        const { data: pageRows, error: pageErr } = await serviceClient
          .from("generator_scenario_history")
          .select("fingerprint, scenario_text")
          .eq("user_id", auth.userId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (pageErr) {
          console.error("scenario-write history load error", pageErr.message);
          historyLoadFailed = true;
          break;
        }
        const rows = pageRows ?? [];
        for (const r of rows) {
          const fp = r?.fingerprint;
          const text = typeof r?.scenario_text === "string" ? r.scenario_text : "";
          if (fp && typeof fp === "object" && text) {
            historyEntries.push({ fingerprint: fp as ScenarioHistoryEntry["fingerprint"], scenarioText: text });
          }
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      if (historyLoadFailed) {
        return new Response(
          JSON.stringify({ error: "Could not verify this film against your history. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Stage-2 semantic judge via the existing Lovable gateway.
      const judge = async (candidateText: string, historyText: string): Promise<boolean> => {
        const judgeResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "user", content: buildSemanticJudgePrompt(candidateText, historyText) },
            ],
          }),
        });
        if (!judgeResp.ok) {
          // Fail closed: an unreadable judge result must not let a duplicate through.
          throw new Error(`semantic judge error ${judgeResp.status}`);
        }
        const judgeData = await readJsonLoose(judgeResp, "scenario-write semantic judge");
        const judgeRaw = (judgeData?.choices?.[0]?.message?.content ?? "").trim();
        const verdict = parseSemanticJudgeResult(judgeRaw);
        if (verdict === null) {
          throw new Error("semantic judge returned an unparseable verdict");
        }
        return verdict;
      };

      const antiDup = await runAntiDuplicatePass(
        scenes,
        historyEntries,
        async (instruction) => {
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
            instruction,
            unit,
          );
          if (!retryResp.ok) {
            console.error("scenario-write anti-duplicate retry error", retryResp.status);
            return null;
          }
          const retryData = await readJsonLoose(retryResp, "scenario-write anti-duplicate retry");
          const retryRaw = (retryData?.choices?.[0]?.message?.content ?? "").trim();
          if (!retryRaw) return null;
          const retryQuality = unit === "plan"
            ? await runPlanQualityPass(duration, retryRaw, async () => null)
            : await runScenarioQualityPass(duration, retryRaw, async () => null);
          return retryQuality.scenes.length > 0 ? retryQuality.scenes : null;
        },
        judge,
        3,
      );

      if (!antiDup.accepted) {
        const msg =
          antiDup.reason === "judge-error"
            ? "Could not verify this film against your history. Please try again."
            : "This film is too similar to one you already made. Please change the story concept, opening, action, camera flow, or ending and try again.";
        return new Response(JSON.stringify({ error: msg }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const finalScenes = antiDup.scenes;
      const scenario = finalScenes.join("\n\n");

      // Persist the accepted fingerprint + full text so future films for this
      // user are compared against it. A write failure fails closed: we must not
      // accept a scenario we could not record for future duplicate checks.
      const acceptedFingerprint = buildScenarioFingerprint(finalScenes, subjectCombo);
      const { error: insertErr } = await serviceClient
        .from("generator_scenario_history")
        .insert({ user_id: auth.userId, fingerprint: acceptedFingerprint, scenario_text: scenario });
      if (insertErr) {
        console.error("scenario-write history insert error", insertErr.message);
        return new Response(
          JSON.stringify({ error: "Could not save this film. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ scenario, scenes: finalScenes, ...(quality.warning ? { warning: quality.warning } : {}) }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      if (leaseToken) {
        await releaseScenarioLease(() =>
          serviceClient.rpc("generator_release_scenario_lease", {
            _user_id: auth.userId,
            _token: leaseToken,
          })
        );
      }
    }
  } catch (e) {
    console.error("scenario-write unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
