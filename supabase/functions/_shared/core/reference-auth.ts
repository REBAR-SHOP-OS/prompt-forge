// Authorizes product/character reference image URLs for a caller.
//
// A reference passes only if it is either:
//  - on an explicitly allowlisted public host (HTTPS), or
//  - a Supabase Storage object on our own origin in an allowed bucket where
//      * the object sits in the caller's own folder (legacy/owned refs), or
//      * the exact object matches a generator_user_images row returned by a
//        CALLER-SCOPED (RLS) query. RLS only returns rows the caller owns or
//        that are shared to them via library_shares, so revoked or unshared
//        assets return no row and fail closed.
// Matching is exact equality on storage_path candidates — never wildcard.

export interface StorageObjectRef {
  bucket: string;
  ownerId: string;
  path: string; // owner-folder-relative key inside the bucket: "<owner>/<file>"
  canonical: string; // "<bucket>/<path>"
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

/** Parse a bucket-relative value or an own-origin object URL. Fails closed. */
export function parseStorageObjectRef(
  raw: string,
  ownStorageOrigin: string,
  allowedBuckets: readonly string[],
): StorageObjectRef | null {
  const trimmed = raw.trim();
  if (!trimmed || allowedBuckets.length === 0) return null;

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
    if (["public", "sign", "authenticated"].includes(rawSegments[0] ?? "")) rawSegments.shift();
  } else {
    rawSegments = trimmed.split("/");
  }

  const decoded = rawSegments.map(decodeSegment);
  if (decoded.some((part) => part === null)) return null;
  const [bucket, ownerFolder, ...objectParts] = decoded as string[];
  if (!allowedBuckets.includes(bucket) || !ownerFolder || objectParts.length === 0) return null;
  const path = [ownerFolder, ...objectParts].join("/");
  return { bucket, ownerId: ownerFolder, path, canonical: `${bucket}/${path}` };
}

/** Exact storage_path spellings a stored asset row may use for this object. */
export function storagePathCandidates(ref: StorageObjectRef, ownStorageOrigin: string): string[] {
  return [
    `${ownStorageOrigin}/storage/v1/object/public/${ref.canonical}`,
    `${ownStorageOrigin}/storage/v1/object/${ref.canonical}`,
    ref.canonical,
    ref.path,
  ];
}

/** Caller-scoped (RLS) lookup: returns the matching row's owner id, or null. */
export type SharedAssetLookup = (ownerId: string, candidates: string[]) => Promise<string | null>;

export interface ReferenceAuthOptions {
  userId: string;
  ownStorageOrigin: string;
  extraHosts: readonly string[];
  lookup: SharedAssetLookup;
}

export type ReferenceDecision =
  | { ok: true; kind: "owned" | "shared" | "external"; ref: StorageObjectRef | null }
  | { ok: false; reason: "invalid" | "not_authorized" | "mismatch" };

const REFERENCE_BUCKETS = ["user-images"] as const;
const OWNED_ONLY_BUCKETS = ["user-images", "wan-frames"] as const;

export async function authorizeReference(url: string, opts: ReferenceAuthOptions): Promise<ReferenceDecision> {
  if (!url || url.length > 2048 || !opts.userId) return { ok: false, reason: "invalid" };
  let parsed: URL | null = null;
  if (/^https?:\/\//i.test(url)) {
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "invalid" };
    }
    if (parsed.protocol !== "https:") return { ok: false, reason: "invalid" };
    if (parsed.origin !== opts.ownStorageOrigin) {
      return opts.extraHosts.includes(parsed.hostname.toLowerCase())
        ? { ok: true, kind: "external", ref: null }
        : { ok: false, reason: "invalid" };
    }
  }

  const ref = parseStorageObjectRef(url, opts.ownStorageOrigin, OWNED_ONLY_BUCKETS);
  if (!ref) return { ok: false, reason: "invalid" };
  if (ref.ownerId === opts.userId) return { ok: true, kind: "owned", ref };
  if (!(REFERENCE_BUCKETS as readonly string[]).includes(ref.bucket)) return { ok: false, reason: "not_authorized" };

  let matchedOwner: string | null = null;
  try {
    matchedOwner = await opts.lookup(ref.ownerId, storagePathCandidates(ref, opts.ownStorageOrigin));
  } catch {
    return { ok: false, reason: "not_authorized" };
  }
  if (!matchedOwner) return { ok: false, reason: "not_authorized" };
  if (matchedOwner !== ref.ownerId) return { ok: false, reason: "mismatch" };
  return { ok: true, kind: "shared", ref };
}

export async function authorizeReferences(urls: readonly string[], opts: ReferenceAuthOptions) {
  const decisions = await Promise.all(urls.map((u) => authorizeReference(u, opts)));
  return { allOk: decisions.every((d) => d.ok), decisions };
}

// Minimal structural type so this file stays free of the supabase-js import.
interface QueryClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        in(col: string, v: string[]): { limit(n: number): PromiseLike<{ data: unknown; error: unknown }> };
      };
    };
  };
}

/** Lookup bound to a user-scoped client so RLS decides own-or-shared access. */
export function rlsSharedAssetLookup(userClient: QueryClient): SharedAssetLookup {
  return async (ownerId, candidates) => {
    const { data, error } = await userClient
      .from("generator_user_images")
      .select("user_id")
      .eq("user_id", ownerId)
      .in("storage_path", candidates)
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const owner = (data[0] as { user_id?: unknown }).user_id;
    return typeof owner === "string" ? owner : null;
  };
}

export function readExtraHosts(raw: string | undefined | null): string[] {
  return (raw ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}
