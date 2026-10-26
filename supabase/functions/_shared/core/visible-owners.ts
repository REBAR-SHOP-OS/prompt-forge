// Resolves which owners' library rows the caller may read: always the caller,
// plus any owner who shared their library via public.library_shares.
// The RPC runs as the caller (user-scoped client), so it can only ever return
// shares where the caller is the viewer. Falls back to self-only on error.
import type { SupabaseClient } from "./supabase.ts";

export async function resolveVisibleOwnerIds(userId: string, client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.rpc("visible_owner_ids");
  if (error || !Array.isArray(data)) {
    if (error) console.warn("[visible-owners] lookup failed, self only:", error.message);
    return [userId];
  }
  const ids = new Set<string>([userId]);
  for (const id of data) if (typeof id === "string" && id) ids.add(id);
  return [...ids];
}
