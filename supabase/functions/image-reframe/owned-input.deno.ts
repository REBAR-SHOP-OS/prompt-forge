import { parseOwnedStorageRef } from "../_shared/core/owned-storage.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const origin = "https://project.supabase.co";
const user = "11111111-1111-4111-8111-111111111111";
const buckets = ["user-images", "wan-frames"];

Deno.test("image reframe allows only the caller's approved storage objects", () => {
  const owned = `${origin}/storage/v1/object/sign/user-images/${user}/photo.png?token=x`;
  assert(parseOwnedStorageRef(owned, origin, user, buckets)?.path === `${user}/photo.png`, "owned image rejected");
  assert(parseOwnedStorageRef(`${origin}/storage/v1/object/sign/user-images/other/photo.png`, origin, user, buckets) === null, "foreign owner accepted");
  assert(parseOwnedStorageRef(`https://evil.example/storage/v1/object/sign/user-images/${user}/photo.png`, origin, user, buckets) === null, "foreign origin accepted");
});
