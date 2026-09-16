import { describe, expect, it, vi } from "vitest";
import { cancelProviderGeneration } from "./provider-cancel.ts";

function encodedVeoState(state: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `veo:v1:${
    btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  }`;
}

function dependencies(values: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  return {
    fetchMock,
    deps: {
      fetch: fetchMock as unknown as typeof fetch,
      env: (name: string) => values[name],
    },
  };
}

describe("cancelProviderGeneration", () => {
  it("cancels the active decoded Veo operation", async () => {
    const { fetchMock, deps } = dependencies({ GEMINI_API_KEY: "test-key" });
    const providerJobId = encodedVeoState({
      initialOp: "operations/base",
      currentOp: "operations/extension",
      extensionStarted: true,
    });

    const cancel = await cancelProviderGeneration("flow", providerJobId, deps);

    expect(cancel.status).toBe("requested");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/operations/extension:cancel?key=test-key",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not guess a Veo operation while extension dispatch is ambiguous", async () => {
    const { fetchMock, deps } = dependencies({ GEMINI_API_KEY: "test-key" });
    const providerJobId = encodedVeoState({
      initialOp: "operations/base",
      currentOp: "operations/base",
      extensionStarted: false,
      extensionClaimToken: "claim-1",
    });

    const cancel = await cancelProviderGeneration("flow", providerJobId, deps);

    expect(cancel.status).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Wan's per-task cancel endpoint", async () => {
    const { fetchMock, deps } = dependencies({ WAN_API_KEY: "wan-key" });

    const cancel = await cancelProviderGeneration(
      "wan",
      "task/with spaces",
      deps,
    );

    expect(cancel.status).toBe("requested");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashscope-intl.aliyuncs.com/api/v1/tasks/task%2Fwith%20spaces/cancel",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer wan-key" }),
      }),
    );
  });

  it("deletes only the matching ComfyUI prompt from the queue", async () => {
    const { fetchMock, deps } = dependencies({
      LOCAL_VIDEO_ROUTER_URL: "https://router.example",
    });

    const cancel = await cancelProviderGeneration(
      "local",
      "localcomfy:prompt-123",
      deps,
    );

    expect(cancel.status).toBe("requested");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://router.example/queue",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ delete: ["prompt-123"] }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("interrupt");
  });

  it("uses only an explicitly configured per-job local route", async () => {
    const { fetchMock, deps } = dependencies({
      LOCAL_VIDEO_ROUTER_URL: "https://router.example/api",
      LOCAL_VIDEO_ROUTER_CANCEL_PATH: "/jobs/{id}/cancel",
    });

    const cancel = await cancelProviderGeneration("local", "local:job-7", deps);

    expect(cancel.status).toBe("requested");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://router.example/api/jobs/job-7/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports unsupported instead of sending a global local interrupt", async () => {
    const { fetchMock, deps } = dependencies({
      LOCAL_VIDEO_ROUTER_URL: "https://router.example",
    });

    const cancel = await cancelProviderGeneration("local", "local:job-8", deps);

    expect(cancel.status).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
