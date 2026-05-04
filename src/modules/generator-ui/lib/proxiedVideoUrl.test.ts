import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession,
    },
  },
}));

describe("proxiedVideoUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "project-ref");
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:proxied-video"),
    });
  });

  it("fetches the proxy with an Authorization header and keeps the token out of the URL", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "secret-token",
        },
      },
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(new Blob(["video-bytes"], { type: "video/mp4" }), {
        status: 200,
        headers: { "Content-Type": "video/mp4" },
      }),
    );

    const { proxiedVideoUrl } = await import("./proxiedVideoUrl");
    const result = await proxiedVideoUrl("https://dashscope-example.oss-cn.aliyuncs.com/video.mp4");

    expect(result).toBe("blob:proxied-video");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toContain("/video-proxy?url=");
    expect(String(requestUrl)).not.toContain("secret-token");
    expect(requestInit).toMatchObject({
      headers: {
        Authorization: "Bearer secret-token",
      },
    });
  });
});
