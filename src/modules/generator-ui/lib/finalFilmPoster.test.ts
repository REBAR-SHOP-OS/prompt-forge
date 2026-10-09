import { describe, expect, it, vi } from "vitest";
import { persistFinalFilmPoster } from "./finalFilmPoster";

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
