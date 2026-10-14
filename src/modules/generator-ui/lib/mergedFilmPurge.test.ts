import { describe, expect, it, vi } from "vitest";
import { purgeMergedFilmStorage } from "./mergedFilmPurge";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const refs = {
  video: "merged-videos/user-1/merged-123.mp4",
  poster: "merged-videos/user-1/posters/merged-123.jpg",
};

describe("purgeMergedFilmStorage", () => {
  it("removes the poster and the video objects from the merged bucket", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });

    await purgeMergedFilmStorage(refs, "merged-videos", remove);

    expect(remove).toHaveBeenNthCalledWith(1, ["user-1/posters/merged-123.jpg"]);
    expect(remove).toHaveBeenNthCalledWith(2, ["user-1/merged-123.mp4"]);
  });

  it("rejects when the poster removal returns a storage error, before touching the video", async () => {
    const remove = vi.fn().mockResolvedValue({ error: { message: "storage unavailable" } });

    await expect(purgeMergedFilmStorage(refs, "merged-videos", remove))
      .rejects.toThrow("storage unavailable");
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("rejects when the video removal returns a storage error", async () => {
    const remove = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "permission denied" } });

    await expect(purgeMergedFilmStorage(refs, "merged-videos", remove))
      .rejects.toThrow("permission denied");
  });

  it("skips references that are not objects in the merged bucket", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });

    await purgeMergedFilmStorage({
      video: "blob:https://app/123",
      poster: "merged-videos/user-1/merged-123.mp4",
    }, "merged-videos", remove);
    await purgeMergedFilmStorage({ video: null, poster: "data:image/jpeg;base64,AAAA" }, "merged-videos", remove);

    expect(remove).not.toHaveBeenCalled();
  });
});
