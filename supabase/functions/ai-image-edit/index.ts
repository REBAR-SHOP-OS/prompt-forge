// Edits an image (data URL or https URL) using Lovable AI Gateway (Nano Banana).
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";
import {
  buildIdentityEvalPrompt,
  classifyEvalVerdict,
  MAX_REFERENCE_IMAGES,
  parseIdentityEvalResponse,
  selectEvaluatedSpecs,
  validateReferenceSpecs,
  type IdentityEvalOutcome,
  type ReferenceSpec,
} from "../_shared/identity-eval.ts";
import { runIdentityCheckedEdit } from "./identity-retry.ts";

// Our storage buckets are private, so public URLs return 400 when the AI gateway
// tries to fetch them. Download via the service client and inline as a data URL.
function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function toInlineDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/);
  if (m) {
    const bucket = m[1];
    const path = decodeURIComponent(m[2]);
    const { data, error } = await getServiceClient().storage.from(bucket).download(path);
    if (!error && data) {
      const bytes = new Uint8Array(await data.arrayBuffer());
      let mime = data.type?.split(";")[0]?.trim() || "image/png";
      if (!/^image\/(png|jpe?g|webp)$/i.test(mime)) mime = "image/png";
      return `data:${mime};base64,${bytesToBase64(bytes)}`;
    }
  }
  // Fall back to the raw URL (e.g. already-signed or external).
  return url;
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
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const maskUrl = typeof body?.maskUrl === "string" ? body.maskUrl.trim() : "";
    const aspectRatio = typeof body?.aspectRatio === "string" && ["1:1","9:16","16:9"].includes(body.aspectRatio)
      ? body.aspectRatio as "1:1" | "9:16" | "16:9"
      : null;

    // Accept either a single imageUrl (legacy) or an imageUrls array (multiple
    // references). The cap is identity-eval's own MAX_REFERENCE_IMAGES — a
    // local, smaller redeclaration here would silently truncate a multi-angle
    // product folder that validateReferenceSpecs would otherwise accept.
    const rawUrls: string[] = Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter((u: unknown) => typeof u === "string").map((u: string) => u.trim())
      : (typeof body?.imageUrl === "string" ? [body.imageUrl.trim()] : []);
    const imageUrls = rawUrls.filter((u) => u.length > 0);
    const hasReferenceMetadata = Array.isArray(body?.referenceRoles) ||
      Array.isArray(body?.referenceCharacterSheets);
    const referenceRoles = Array.isArray(body?.referenceRoles) ? body.referenceRoles : [];
    const referenceCharacterSheets = Array.isArray(body?.referenceCharacterSheets)
      ? body.referenceCharacterSheets
      : [];
    let identitySpecs: ReferenceSpec[] = [];
    if (hasReferenceMetadata) {
      const validated = validateReferenceSpecs(
        imageUrls,
        referenceRoles,
        referenceCharacterSheets,
      );
      if (!validated.ok) {
        return new Response(JSON.stringify({ error: validated.error }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      identitySpecs = validated.specs;
    }

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (prompt.length > 4000) {
      return new Response(JSON.stringify({ error: "prompt too long" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: "at least one image is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (imageUrls.length > MAX_REFERENCE_IMAGES) {
      return new Response(JSON.stringify({ error: `at most ${MAX_REFERENCE_IMAGES} images allowed` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Allow data: URLs (from a freshly generated image) or https URLs from our supabase host.
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const isUrlAllowed = (url: string): boolean => {
      if (url.startsWith("data:image/")) return true;
      try {
        const u = new URL(url);
        return u.protocol === "https:" && (
          u.hostname === supabaseHost ||
          u.hostname.endsWith(".supabase.co") ||
          u.hostname.endsWith(".supabase.in")
        );
      } catch { return false; }
    };
    for (const url of imageUrls) {
      if (!isUrlAllowed(url)) {
        return new Response(JSON.stringify({ error: "each image must be a data URL or supabase https URL" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (url.length > 15_000_000) {
        return new Response(JSON.stringify({ error: "imageUrl too large" }), {
          status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    if (maskUrl) {
      if (!maskUrl.startsWith("data:image/")) {
        return new Response(JSON.stringify({ error: "maskUrl must be a data:image/* URL" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (maskUrl.length > 15_000_000) {
        return new Response(JSON.stringify({ error: "maskUrl too large" }), {
          status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const multiRefText = identitySpecs.length > 0
      ? `You will receive ${imageUrls.length} labelled identity reference images. Preserve every labelled identity exactly and include them together in the result. Apply this instruction (which may be in any language, including Persian/Farsi/Arabic): ${prompt}.${aspectRatio ? ` The output image MUST keep a strict ${aspectRatio} aspect ratio.` : " Preserve the overall composition and aspect ratio unless the instruction explicitly requires otherwise."} Respond with ONLY the resulting image — no text, captions, or explanations.`
      : imageUrls.length > 1
      ? `You will receive ${imageUrls.length} images. Image 1 is the BASE image to edit/transform. The remaining ${imageUrls.length - 1} image(s) are visual REFERENCES — use their style, subject, products, or details to guide the edit. Apply this instruction (which may be in any language, including Persian/Farsi/Arabic) to image 1: ${prompt}.${aspectRatio ? ` The output image MUST keep a strict ${aspectRatio} aspect ratio.` : " Preserve the overall composition and aspect ratio of the base image unless the instruction explicitly requires otherwise."} Respond with ONLY the resulting image — no text, captions, or explanations.`
      : `Edit the provided image as follows: ${prompt}.${aspectRatio ? ` The output image MUST keep a strict ${aspectRatio} aspect ratio.` : " Preserve the overall composition and aspect ratio of the original image unless the instruction explicitly requires otherwise."} Respond with ONLY the edited image — no text, captions, or explanations.`;

    // Inline private-bucket URLs as data URLs so the AI gateway can read them.
    const generationSpecs = identitySpecs.length > 0
      ? identitySpecs
      : imageUrls.map((url) => ({ url, role: "product" as const, characterSheet: false }));
    const inlinedUrls = await Promise.all(generationSpecs.map((s) => toInlineDataUrl(s.url)));

    const messageContent = maskUrl
      ? [
          { type: "text", text: `You will receive two images. Image 1 is the ORIGINAL. Image 2 is a strict edit MASK (transparent background; opaque/white pixels mark the editable region). Only the white/opaque pixels of the mask define the editable region — DO NOT alter pixels where the mask is transparent. Keep every pixel outside the mask absolutely identical (same composition, colors, lighting, subject, pose, background). The user instruction (which may be in any language, including Persian/Farsi/Arabic) describes what to put inside the masked region: ${prompt}.${aspectRatio ? ` Output MUST keep a strict ${aspectRatio} aspect ratio.` : ""} Respond with ONLY the edited image — no text.` },
          { type: "image_url", image_url: { url: inlinedUrls[0] } },
          { type: "image_url", image_url: { url: maskUrl } },
        ]
      : [
          { type: "text", text: multiRefText },
          ...(identitySpecs.length > 0 ? inlinedUrls.flatMap((url, i) => {
            const spec = generationSpecs[i];
            const sheetNote = spec.role === "character" && spec.characterSheet
              ? " This is a MULTI-VIEW CHARACTER SHEET of one person; preserve that exact person."
              : "";
            return [
              { type: "text", text: `REFERENCE ${i + 1} ROLE: ${spec.role.toUpperCase()}.${sheetNote}` },
              { type: "image_url", image_url: { url } },
            ];
          }) : inlinedUrls.map((url) => ({ type: "image_url", image_url: { url } }))),
        ];


    const callModel = async (model: string, identityRetry = false) => {
      const content = identityRetry
        ? [
            ...messageContent,
            {
              type: "text",
              text: "The previous output failed identity validation. The new output MUST contain the exact same product and the exact same character from the labelled reference images. Do not substitute, omit, or redesign either identity.",
            },
          ]
        : messageContent;
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
          ...(aspectRatio ? { image_config: { aspect_ratio: aspectRatio } } : {}),
        }),
      });
    };

    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractImage = (data: any): string | undefined =>
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    const PRIMARY = "google/gemini-3.1-flash-image-preview";
    const FALLBACK = "google/gemini-2.5-flash-image";
    const MAX_IDENTITY_ATTEMPTS = 2;
    const evalModel = "google/gemini-3-flash-preview";
    // Judge only the first product angle plus the character, never every
    // grouped angle — a single generated image can only visually show one
    // product angle, so evaluating the rest would fail spuriously. The extra
    // product specs above are generation-only grounding.
    const evaluatedSpecs = selectEvaluatedSpecs(identitySpecs);
    const evalPrompt = buildIdentityEvalPrompt(evaluatedSpecs);

    async function evaluateIdentity(dataUrl: string) {
      const evalContent: unknown[] = [
        { type: "text", text: evalPrompt },
        { type: "text", text: "GENERATED_OUTPUT:" },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
      for (let i = 0; i < evaluatedSpecs.length; i++) {
        const spec = evaluatedSpecs[i];
        evalContent.push({ type: "text", text: `REF_${i + 1} (${spec.role.toUpperCase()}):` });
        evalContent.push({ type: "image_url", image_url: { url: await toInlineDataUrl(spec.url) } });
      }
      const evalResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: evalModel,
          messages: [{ role: "user", content: evalContent }],
        }),
      });
      if (evalResp.status === 429) {
        return { verdict: "error" as const, outcome: null, status: 429, error: "Identity evaluator rate limit reached. Try again in a moment." };
      }
      if (evalResp.status === 402) {
        return { verdict: "error" as const, outcome: null, status: 402, error: "AI credits exhausted during identity evaluation." };
      }
      if (!evalResp.ok) {
        const text = await evalResp.text().catch(() => "");
        console.error("ai-image-edit identity-eval gateway error", evalResp.status, text);
        return { verdict: "error" as const, outcome: null, status: 502, error: "Identity evaluator gateway error" };
      }
      const evalData = await readJsonLoose(evalResp, "ai-image-edit-identity-eval");
      const raw = String(evalData?.choices?.[0]?.message?.content ?? "").trim();
      const outcome: IdentityEvalOutcome | null = raw
        ? parseIdentityEvalResponse(raw, evaluatedSpecs.length)
        : null;
      const verdict = classifyEvalVerdict(outcome);
      return verdict === "error"
        ? { verdict, outcome, status: 502, error: "Identity evaluator returned an invalid response" }
        : { verdict, outcome };
    }

    async function generateOnce(model: string, identityRetry: boolean) {
      const resp = await callModel(model, identityRetry);
      if (resp.status === 429) return { kind: "error" as const, status: 429, error: "Rate limit reached. Try again in a moment." };
      if (resp.status === 402) return { kind: "error" as const, status: 402, error: "AI credits exhausted. Add credits to continue." };
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.error("ai-image-edit gateway error", resp.status, text);
        return { kind: "error" as const, status: 502, error: "AI gateway error" };
      }
      const data = await readJsonLoose(resp, "ai-image-edit");
      const dataUrl = extractImage(data);
      return dataUrl
        ? { kind: "success" as const, dataUrl }
        : { kind: "error" as const, status: 422, error: "The AI returned text instead of an edited image. Try a more visual instruction." };
    }

    const result = await runIdentityCheckedEdit({
      referenceCount: identitySpecs.length,
      maxAttempts: identitySpecs.length > 0 ? MAX_IDENTITY_ATTEMPTS : 1,
      generate: async (attempt) => {
        const model = attempt === 0 ? PRIMARY : FALLBACK;
        const generated = await generateOnce(model, attempt > 0);
        if (identitySpecs.length === 0 && generated.kind === "error" && generated.status === 422) {
          console.warn("ai-image-edit primary returned no image, retrying with fallback model");
          return await generateOnce(FALLBACK, false);
        }
        return generated;
      },
      evaluate: evaluateIdentity,
    });

    if (result.kind === "error") {
      if (result.status === 422 && result.outcome) {
        console.warn("ai-image-edit identity mismatch after retries", JSON.stringify(result.outcome));
      }
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ dataUrl: result.dataUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-image-edit unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
