import { parseStorageObjectRef } from "./reference-auth.ts";

export interface OwnedStorageRef {
  bucket: string;
  path: string;
  canonical: string;
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
  if (!userId) return null;
  const ref = parseStorageObjectRef(raw, ownStorageOrigin, allowedBuckets);
  if (!ref || ref.ownerId !== userId) return null;
  return { bucket: ref.bucket, path: ref.path, canonical: ref.canonical };
}
