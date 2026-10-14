import { describe, expect, it, vi } from "vitest";
import { persistFinalFilmPoster, posterPathFromThumbnailRef } from "./finalFilmPoster";

describe("persistFinalFilmPoster", () => {
  it("uploads an inline poster to existing storage and returns a small reference", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Blob(["poster"], { type: "image/jpeg" }), { status: 200 }),
    );

    const result = await persistFinalFilmPoster(
      "data:image/jpeg;base64,AAAA",
      "user-1",
      "film-1",
      "merged-videos",
      upload,
      fetchImpl,
    );

    expect(result).toBe("merged-videos/user-1/posters/film-1.jpg");
    expect(result).not.toContain("base64");
    expect(upload).toHaveBeenCalledWith(
      "user-1/posters/film-1.jpg",
      expect.any(Blob),
      { contentType: "image/jpeg", upsert: true },
    );
  });

  it("keeps Final Film creation non-fatal when poster persistence fails", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: "offline" } });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Blob(["poster"], { type: "image/jpeg" }), { status: 200 }),
    );

    await expect(persistFinalFilmPoster(
      "data:image/jpeg;base64,AAAA",
      "user-1",
      "film-1",
      "merged-videos",
      upload,
      fetchImpl,
    )).resolves.toBeNull();
  });
});

describe("posterPathFromThumbnailRef", () => {
  it("derives the poster object path from a persisted bucket-relative reference", () => {
    expect(posterPathFromThumbnailRef("merged-videos/user-1/posters/film-1.jpg", "merged-videos"))
      .toBe("user-1/posters/film-1.jpg");
  });

  it("derives the poster path from a full storage URL", () => {
    expect(posterPathFromThumbnailRef(
      "https://project.supabase.co/storage/v1/object/public/merged-videos/user-1/posters/film-1.png",
      "merged-videos",
    )).toBe("user-1/posters/film-1.png");
  });

  it("returns null for references that are not storage-backed posters", () => {
    expect(posterPathFromThumbnailRef(null, "merged-videos")).toBeNull();
    expect(posterPathFromThumbnailRef(undefined, "merged-videos")).toBeNull();
    expect(posterPathFromThumbnailRef("data:image/jpeg;base64,AAAA", "merged-videos")).toBeNull();
    // The video file itself is not a poster object.
    expect(posterPathFromThumbnailRef("merged-videos/user-1/merged-123.mp4", "merged-videos"))
      .toBeNull();
    // A poster-shaped path in a different bucket is not ours to delete.
    expect(posterPathFromThumbnailRef("other-bucket/user-1/posters/film-1.jpg", "merged-videos"))
      .toBeNull();
  });
});
