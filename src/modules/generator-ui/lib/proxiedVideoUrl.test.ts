import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock supabase before importing the module under test.
// Use vi.hoisted so the mock factories can reference the fn variables.
const { mockCreateSignedUrl, mockGetSession } = vi.hoisted(() => ({
  mockCreateSignedUrl: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
    auth: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@/core/api/client", () => ({
  FUNCTIONS_BASE: "https://test.supabase.co/functions/v1",
}));

// Import after mocks are set up.
import { proxiedVideoUrl, proxiedThumbnailUrl, parseStorageRef } from "./proxiedVideoUrl";

describe("proxiedVideoUrl", () => {
  beforeEach(() => {
    mockCreateSignedUrl.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "***" } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns blob: URLs unchanged", async () => {
    const url = "blob:https://example.com/123";
    await expect(proxiedVideoUrl(url)).resolves.toBe(url);
  });

  it("returns data: URLs unchanged", async () => {
    const url = "data:image/png;base64,iVBORw0KGgo=";
    await expect(proxiedVideoUrl(url)).resolves.toBe(url);
  });

  it("returns empty string unchanged", async () => {
    await expect(proxiedVideoUrl("")).resolves.toBe("");
  });

  it("resolves bucket-relative private path via signed URL", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/file.mp4?token=***" },
      error: null,
    });

    const result = await proxiedVideoUrl("merged-videos/user/file.mp4");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user/file.mp4", 7200);
    expect(result).toContain("video-proxy");
    expect(result).toContain("token=");
  });

  it("resolves full private Supabase storage URL via signed URL", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/file.mp4?token=***" },
      error: null,
    });

    const input = "https://test.supabase.co/storage/v1/object/public/merged-videos/user/file.mp4";
    const result = await proxiedVideoUrl(input);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user/file.mp4", 7200);
    expect(result).toContain("video-proxy");
  });

  it("throws when signing a private bucket fails (fail-closed)", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "not authorized" },
    });

    await expect(
      proxiedVideoUrl("merged-videos/user/file.mp4"),
    ).rejects.toThrow("Failed to sign merged-videos/user/file.mp4");
  });

  it("throws on invalid URL that is not bucket-relative", async () => {
    await expect(proxiedVideoUrl("not-a-url")).rejects.toThrow("Invalid video URL");
  });

  it("returns public Supabase storage URLs unchanged", async () => {
    const url = "https://test.supabase.co/storage/v1/object/public/user-images/abc.png";
    const result = await proxiedVideoUrl(url);
    expect(result).toBe(url);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it("routes external URLs through video-proxy with token", async () => {
    const external = "https://dashscope-oss.cn.aliyuncs.com/output/video.mp4";
    const result = await proxiedVideoUrl(external);
    expect(result).toContain("video-proxy");
    expect(result).toContain(encodeURIComponent(external));
    expect(result).toContain("token=");
  });

  it("throws when not authenticated for external URL", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const external = "https://dashscope-oss.cn.aliyuncs.com/output/video.mp4";
    await expect(proxiedVideoUrl(external)).rejects.toThrow("Not authenticated");
  });
});

describe("proxiedThumbnailUrl", () => {
  beforeEach(() => {
    mockCreateSignedUrl.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "***" } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined for empty input", async () => {
    await expect(proxiedThumbnailUrl(null)).resolves.toBeUndefined();
    await expect(proxiedThumbnailUrl("")).resolves.toBeUndefined();
  });

  it("returns blob:/data: URLs unchanged", async () => {
    await expect(proxiedThumbnailUrl("blob:https://example.com/1")).resolves.toBe("blob:https://example.com/1");
    await expect(proxiedThumbnailUrl("data:image/jpeg;base64,AAAA")).resolves.toBe("data:image/jpeg;base64,AAAA");
  });

  it("re-signs a bucket-relative private path to a signed URL (no proxy wrapper)", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/thumb.jpg?token=***" },
      error: null,
    });
    const result = await proxiedThumbnailUrl("merged-videos/user/thumb.jpg");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user/thumb.jpg", 7200);
    expect(result).toContain("/object/sign/merged-videos/");
    expect(result).not.toContain("video-proxy");
  });

  it("re-signs an old public-form private-bucket URL", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/thumb.jpg?token=***" },
      error: null,
    });
    const input = "https://test.supabase.co/storage/v1/object/public/merged-videos/user/thumb.jpg";
    const result = await proxiedThumbnailUrl(input);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user/thumb.jpg", 7200);
    expect(result).toContain("/object/sign/merged-videos/");
  });

  it("returns undefined (no poster) when signing fails", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "not authorized" },
    });
    await expect(proxiedThumbnailUrl("merged-videos/user/thumb.jpg")).resolves.toBeUndefined();
  });

  it("returns public-bucket and external URLs unchanged", async () => {
    const pub = "https://test.supabase.co/storage/v1/object/public/user-images/abc.png";
    await expect(proxiedThumbnailUrl(pub)).resolves.toBe(pub);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });
});

// Regression guard for #202: `storage_path` is now persisted as
// "merged-videos/<path>". Every consumer that resolves a bucket+path (download
// with Content-Disposition, copyright/transcript signing, Social Media Manager
// handoff, local-merge purge) must understand BOTH shapes. Before this helper
// the bucket-relative shape was signed as MERGED_BUCKET + the still-prefixed
// path, producing a dead "merged-videos/merged-videos/..." key.
describe("parseStorageRef", () => {
  it("parses the bucket-relative form persisted since #202", () => {
    expect(parseStorageRef("merged-videos/uid-1/job-abc.mp4")).toEqual({
      bucket: "merged-videos",
      path: "uid-1/job-abc.mp4",
    });
  });

  it("parses the user-videos bucket-relative form", () => {
    expect(parseStorageRef("user-videos/uid-1/clip.webm")).toEqual({
      bucket: "user-videos",
      path: "uid-1/clip.webm",
    });
  });

  it("does NOT double-prefix — path never keeps the bucket segment", () => {
    const ref = parseStorageRef("merged-videos/uid-1/job-abc.mp4");
    expect(ref?.path.startsWith("merged-videos/")).toBe(false);
  });

  it("parses the legacy public-URL form", () => {
    expect(
      parseStorageRef(
        "https://test.supabase.co/storage/v1/object/public/merged-videos/uid-1/job-abc.mp4",
      ),
    ).toEqual({ bucket: "merged-videos", path: "uid-1/job-abc.mp4" });
  });

  it("parses the signed and authenticated URL forms", () => {
    expect(
      parseStorageRef(
        "https://test.supabase.co/storage/v1/object/sign/merged-videos/uid-1/a.mp4?token=x",
      ),
    ).toEqual({ bucket: "merged-videos", path: "uid-1/a.mp4" });
    expect(
      parseStorageRef(
        "https://test.supabase.co/storage/v1/object/authenticated/user-videos/uid-1/b.mp4",
      ),
    ).toEqual({ bucket: "user-videos", path: "uid-1/b.mp4" });
  });

  it("percent-decodes the path", () => {
    expect(
      parseStorageRef(
        "https://test.supabase.co/storage/v1/object/public/merged-videos/uid-1/my%20film.mp4",
      ),
    ).toEqual({ bucket: "merged-videos", path: "uid-1/my film.mp4" });
  });

  it("returns null for a plain path with no bucket prefix (caller keeps its default bucket)", () => {
    expect(parseStorageRef("uid-1/job-abc.mp4")).toBeNull();
  });

  it("returns null for blob:, data:, empty and non-storage URLs", () => {
    expect(parseStorageRef("blob:https://example.com/1")).toBeNull();
    expect(parseStorageRef("data:video/mp4;base64,AA")).toBeNull();
    expect(parseStorageRef("")).toBeNull();
    expect(parseStorageRef(null)).toBeNull();
    expect(parseStorageRef("https://dashscope.aliyuncs.com/x/y.mp4")).toBeNull();
  });

  it("returns null for a bare bucket name with no object path", () => {
    expect(parseStorageRef("merged-videos")).toBeNull();
    expect(parseStorageRef("merged-videos/")).toBeNull();
  });
});
