// Generates an image from a text prompt using Lovable AI Gateway (Nano Banana).
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";
import {
  validateReferenceSpecs,
  buildIdentityEvalPrompt,
  parseIdentityEvalResponse,
  classifyEvalVerdict,
  type ReferenceSpec,
  type IdentityEvalOutcome,
  type EvalVerdict,
} from "../_shared/identity-eval.ts";

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
    const referenceRoles = Array.isArray(body?.referenceRoles)
      ? (body.referenceRoles as unknown[]).filter((r): r is string => typeof r === "string" && r.length > 0)
      : [];
    // Optional per-reference flag marking a character reference as a multi-view
    // character sheet (a single image with several turnaround views + facial
    // expressions of ONE person). The sheet must be treated as a single
    // identity by both the generator and the evaluator.
    const referenceCharacterSheets = Array.isArray(body?.referenceCharacterSheets)
      ? (body.referenceCharacterSheets as unknown[]).map((v) => v === true)
      : [];
    // Validate role/count/order of the reference payload. A mismatch is a hard
    // error, not a silent drop — otherwise the model would render without the
    // identity the user explicitly chose. The character-sheet flags are passed
    // in and attached to each spec BEFORE the deterministic sort, so the flag
    // always travels with its own reference (character-first input stays
    // correctly flagged after reordering).
    const refValidation = validateReferenceSpecs(
      referenceImageUrls,
      referenceRoles,
      referenceCharacterSheets,
    );
    if (!refValidation.ok) {
      return new Response(JSON.stringify({ error: refValidation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const refSpecs: ReferenceSpec[] = refValidation.specs;
    // Cap the number of reference images and validate each against the same
    // security rules as the job orchestrator (own storage under user folder or
    // allowlisted host). Never accept arbitrary insecure URLs server-side.
    const MAX_REFERENCE_IMAGES = 3;
    const safeReferenceUrls = refSpecs
      .slice(0, MAX_REFERENCE_IMAGES)
      .filter((s) => s.url.length <= 2048 && isAllowedReferenceUrl(s.url, auth.userId));
    // A reference that was supplied but failed security validation is a hard
    // error, not a silent drop — otherwise the model would render without the
    // identity the user explicitly chose.
    const droppedReferenceCount = refSpecs.length - safeReferenceUrls.length;
    if (droppedReferenceCount > 0) {
      return new Response(JSON.stringify({
        error: "One or more reference images could not be validated. Re-select the product/character and try again.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    // URLs as text. Private-bucket URLs are inlined as data URLs first. Each
    // image is preceded by an explicit role label so the model knows which
    // reference is the product vs the character.
    const userContent: unknown[] = [{ type: "text", text: fullPrompt }];
    for (const spec of safeReferenceUrls) {
      const sheetNote = spec.role === "character" && spec.characterSheet
        ? " This is a MULTI-VIEW CHARACTER SHEET: every view shows the SAME one person. Preserve that exact person (same face, hair, skin tone, body type, and outfit) in the output — do NOT substitute a different person."
        : "";
      userContent.push({
        type: "text",
        text: `${spec.role.toUpperCase()} reference image (preserve this exact ${spec.role} in the output):${sheetNote}`,
      });
      const resolved = await resolveImageForGateway(spec.url);
      userContent.push({ type: "image_url", image_url: { url: resolved } });
    }

    const extractImage = (data: unknown): string | undefined => {
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any)?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    };

    const PRIMARY = "google/gemini-3.1-flash-image-preview";
    const FALLBACK = "google/gemini-2.5-flash-image";
    const MAX_ATTEMPTS = 3;

    // Vision-based identity evaluation: after each generation, the output image
    // is compared against each reference image to confirm the SAME product and
    // the SAME character are present and match. A dataUrl alone is NOT success.
    // The evaluation has three outcomes:
    //   - pass: every reference present AND matches -> accept the image.
    //   - identity-fail: image produced but identities not preserved -> retry
    //     (bounded).
    //   - error: the evaluator itself failed (technical error, invalid response,
    //     429/402/5xx) -> return immediately, do NOT start a fresh generation.
    const evalModel = "google/gemini-3-flash-preview";
    const evalPrompt = buildIdentityEvalPrompt(safeReferenceUrls);

    // Returns { verdict, outcome }. verdict is "pass" | "identity-fail" | "error".
    async function evaluateIdentity(dataUrl: string): Promise<{
      verdict: EvalVerdict;
      outcome: IdentityEvalOutcome | null;
    }> {
      if (safeReferenceUrls.length === 0) {
        // No references to preserve — nothing to evaluate.
        return { verdict: "pass", outcome: { perReference: [], passed: true } };
      }
      // Build the evaluator input: GENERATED_OUTPUT first, then each reference
      // with its role label immediately beside its image.
      const evalContent: unknown[] = [
        { type: "text", text: evalPrompt },
        { type: "text", text: "GENERATED_OUTPUT:" },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
      for (let i = 0; i < safeReferenceUrls.length; i++) {
        const spec = safeReferenceUrls[i];
        evalContent.push({
          type: "text",
          text: `REF_${i + 1} (${spec.role.toUpperCase()}):`,
        });
        const resolved = await resolveImageForGateway(spec.url);
        evalContent.push({ type: "image_url", image_url: { url: resolved } });
      }
      const evalResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: evalModel,
          messages: [{ role: "user", content: evalContent }],
        }),
      });
      if (evalResp.status === 429) {
        return { verdict: "error", outcome: null };
      }
      if (evalResp.status === 402) {
        return { verdict: "error", outcome: null };
      }
      if (!evalResp.ok) {
        const text = await evalResp.text().catch(() => "");
        console.error("ai-image-generate identity-eval gateway error", evalResp.status, text);
        return { verdict: "error", outcome: null };
      }
      const evalData = await readJsonLoose(evalResp, "ai-image-generate-identity-eval");
      const raw: string = (evalData?.choices?.[0]?.message?.content ?? "").trim();
      if (!raw) return { verdict: "error", outcome: null };
      const outcome = parseIdentityEvalResponse(raw, safeReferenceUrls.length);
      return { verdict: classifyEvalVerdict(outcome), outcome };
    }

    let data: unknown = null;
    let dataUrl: string | undefined;
    let lastEval: IdentityEvalOutcome | null = null;
    let lastVerdict: EvalVerdict = "error";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const model = attempt === 0 ? PRIMARY : FALLBACK;
      const attemptContent = attempt > 0 && safeReferenceUrls.length > 0
        ? [
            { type: "text", text: fullPrompt },
            ...userContent.slice(1),
            {
              type: "text",
              text: "IMPORTANT: The previous attempt did not preserve the required identities. The output MUST contain the SAME product and the SAME character from the reference images, together in the same shot. If the character reference is a multi-view character sheet, the output MUST show the exact same person (same face, hair, skin tone, body type, and outfit) — never a different person.",
            },
          ]
        : userContent;
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: attemptContent }],
          modalities: ["image", "text"],
          image_config: { aspect_ratio: aspectRatio },
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
        console.error("ai-image-generate gateway error", resp.status, text);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      data = await readJsonLoose(resp, "ai-image-generate");
      dataUrl = extractImage(data);
      if (!dataUrl) {
        console.warn(`ai-image-generate attempt ${attempt + 1} returned no image`);
        continue;
      }

      // Evaluate the output against the references. Only accept when every
      // reference is present AND matches. A dataUrl alone is not success.
      const evalResult = await evaluateIdentity(dataUrl);
      lastEval = evalResult.outcome;
      lastVerdict = evalResult.verdict;
      if (evalResult.verdict === "pass") break;
      if (evalResult.verdict === "error") {
        // Technical error from the evaluator: return immediately, do NOT start
        // a fresh generation.
        console.error("ai-image-generate identity-eval technical error");
        return new Response(JSON.stringify({
          error: "Could not verify the generated image. Please try again in a moment.",
        }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // identity-fail: retry (bounded).
      console.warn(
        `ai-image-generate attempt ${attempt + 1} failed identity evaluation`,
        JSON.stringify(lastEval),
      );
    }

    if (!dataUrl) {
      console.error("ai-image-generate empty image after retries", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({
        error: "The AI returned text instead of an image. Try a more visual prompt — describe the scene, subject, lighting, and style.",
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (safeReferenceUrls.length > 0 && lastVerdict !== "pass") {
      const missing = lastEval?.perReference
        ?.filter((r) => !r.present)
        .map((r) => r.reason)
        .filter(Boolean)
        .join(" ") || "The generated image did not preserve the selected product and/or character.";
      console.error("ai-image-generate identity not preserved after retries", JSON.stringify(lastEval));
      return new Response(JSON.stringify({
        error: `Could not preserve the selected product and character in the image. ${missing} Try re-selecting them or rephrasing the scene.`,
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
