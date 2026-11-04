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


/**
 * Paid start request guard: revalidates every reference for the caller AFTER
 * all frame/reference downloads and immediately before the provider call, so
 * a share revoked mid-preparation never reaches a paid request. Required when
 * references are present (fail closed if the orchestrator omitted it).
 */
export async function guardedProviderStart(
  input: Pick<GenerationStartInput, "referenceImageUrls" | "revalidateReferences">,
  url: string,
  init: RequestInit,
  doFetch: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  if ((input.referenceImageUrls?.length ?? 0) > 0) {
    if (!input.revalidateReferences) throw new ReferenceStartBlockedError("Reference access check unavailable; provider start aborted");
    try {
      await input.revalidateReferences();
    } catch (e) {
      throw new ReferenceStartBlockedError(`Reference image access changed; provider start aborted (${(e as Error).message})`);
    }
  }
  return await doFetch(url, init);
}


/** Thrown when a reference re-check blocks a start; never a network error. */
export class ReferenceStartBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceStartBlockedError";
  }
}

/**
 * Local-router create fallback loop. EVERY real POST attempt is wrapped in
 * guardedProviderStart, so access is re-checked immediately before each call
 * (a revocation between a 404 fallback and the next endpoint stops the loop
 * with no further provider call). Returns the authoritative response, or null
 * when every endpoint 404'd.
 */
export async function runGuardedCreateAttempts(
  input: Pick<GenerationStartInput, "referenceImageUrls" | "revalidateReferences">,
  urls: readonly string[],
  post: (url: string, init: RequestInit) => Promise<Response>,
  init: RequestInit,
  onFallback?: (from: string, to: string) => void,
): Promise<Response | null> {
  for (let i = 0; i < urls.length; i++) {
    const candidate = await guardedProviderStart(input, urls[i], init, post);
    if (candidate.status === 404 && i < urls.length - 1) {
      onFallback?.(urls[i], urls[i + 1]);
      await candidate.body?.cancel().catch(() => {});
      continue;
    }
    return candidate;
  }
  return null;
}
