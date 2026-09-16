export interface OwnedStorageRef {
  bucket: string;
  path: string;
  canonical: string;
}

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Parse a Supabase Storage reference and prove that it points to an object in
 * the authenticated caller's top-level folder. Both bucket-relative values and
 * public/signed/authenticated object URLs are accepted; foreign origins,
 * buckets and user folders fail closed.
 */
export function parseOwnedStorageRef(
  raw: string,
  ownStorageOrigin: string,
  userId: string,
  allowedBuckets: readonly string[],
): OwnedStorageRef | null {
  const trimmed = raw.trim();
  if (!trimmed || !userId || allowedBuckets.length === 0) return null;

  let rawSegments: string[];
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.origin !== ownStorageOrigin) return null;

    const prefix = "/storage/v1/object/";
    if (!url.pathname.startsWith(prefix)) return null;
    rawSegments = url.pathname.slice(prefix.length).split("/");
    if (["public", "sign", "authenticated"].includes(rawSegments[0] ?? "")) {
      rawSegments.shift();
    }
  } else {
    rawSegments = trimmed.split("/");
  }

  const decoded = rawSegments.map(decodeSegment);
  if (decoded.some((part) => part === null)) return null;
  const segments = decoded as string[];
  const [bucket, ownerFolder, ...objectParts] = segments;
  if (!allowedBuckets.includes(bucket) || ownerFolder !== userId || objectParts.length === 0) return null;

  const path = [ownerFolder, ...objectParts].join("/");
  return { bucket, path, canonical: `${bucket}/${path}` };
}
