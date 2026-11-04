import type { GenerationStartInput } from "./contract.ts";

/**
 * Veo reference images are REQUIRED once requested: each must arrive already
 * authorized and downloaded with the caller's storage permissions. Any gap
 * throws before the paid Veo call so the orchestrator fails + refunds the job.
 */
export function buildVeoReferenceImages(
  input: Pick<GenerationStartInput, "referenceImageUrls" | "referenceImages">,
): Array<Record<string, unknown>> | undefined {
  const urls = (input.referenceImageUrls ?? []).slice(0, 3);
  if (urls.length === 0) return undefined;
  const images = input.referenceImages ?? [];
  if (images.length < urls.length) {
    throw new Error("Required reference images are unavailable; provider start aborted");
  }
  return urls.map((_, i) => {
    const img = images[i];
    if (!img || !img.data || !/^image\/(png|jpeg|webp)$/.test(img.mimeType)) {
      throw new Error("Required reference images are unavailable; provider start aborted");
    }
    return { image: { bytesBase64Encoded: img.data, mimeType: img.mimeType }, referenceType: "asset" };
  });
}

