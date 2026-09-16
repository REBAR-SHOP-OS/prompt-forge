import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOwnedStorageRef } from "./owned-storage";

const origin = "https://project.supabase.co";
const userId = "11111111-1111-4111-8111-111111111111";

describe("parseOwnedStorageRef", () => {
  it("accepts and canonicalizes the caller's bucket-relative object", () => {
    expect(parseOwnedStorageRef(`user-videos/${userId}/clip.mp4`, origin, userId, ["user-videos"]))
      .toEqual({ bucket: "user-videos", path: `${userId}/clip.mp4`, canonical: `user-videos/${userId}/clip.mp4` });
  });

  it.each(["public", "sign", "authenticated"])("accepts the caller's %s Supabase URL", (route) => {
    const url = `${origin}/storage/v1/object/${route}/user-images/${userId}/photo.png?token=test-token`;
    expect(parseOwnedStorageRef(url, origin, userId, ["user-images"])?.path).toBe(`${userId}/photo.png`);
  });

  it("rejects another user's folder", () => {
    const url = `${origin}/storage/v1/object/sign/user-images/22222222-2222-4222-8222-222222222222/photo.png`;
    expect(parseOwnedStorageRef(url, origin, userId, ["user-images"])).toBeNull();
  });

  it("rejects lookalike origins, disallowed buckets and encoded traversal", () => {
    expect(parseOwnedStorageRef(`https://evil-project.supabase.co/storage/v1/object/sign/user-images/${userId}/x.png`, origin, userId, ["user-images"])).toBeNull();
    expect(parseOwnedStorageRef(`admin-secrets/${userId}/x.png`, origin, userId, ["user-images"])).toBeNull();
    expect(parseOwnedStorageRef(`user-images/${userId}/%2e%2e/x.png`, origin, userId, ["user-images"])).toBeNull();
    expect(parseOwnedStorageRef(`user-images/${userId}/nested%2Fescape.png`, origin, userId, ["user-images"])).toBeNull();
  });

  it("guards every service-role storage read and delete call site", () => {
    const aiImageEdit = readFileSync(resolve(process.cwd(), "supabase/functions/ai-image-edit/index.ts"), "utf8");
    const uploadJob = readFileSync(resolve(process.cwd(), "supabase/functions/jobs-create-from-upload/index.ts"), "utf8");
    const orchestrator = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/modules/job-orchestrator/gateway.ts"),
      "utf8",
    );
    expect(aiImageEdit).toContain("parseOwnedStorageRef(url, supabaseOrigin, userId");
    expect(uploadJob).toContain("const ownedUpload = parseOwnedStorageRef(");
    expect(uploadJob).toContain("storagePath: ownedUpload.canonical");
    expect(orchestrator).toContain("parseOwnedStorageRef(raw, SUPABASE_STORAGE_ORIGIN, auth.userId");
  });
});
