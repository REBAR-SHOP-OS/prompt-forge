import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock("@/core/api/client", () => ({
  request: requestMock,
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public requestId?: string) {
      super(message);
    }
  },
}));

describe("jobOrchestratorGateway.createJob", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requestMock.mockReset();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("queues generation through a short bounded request and accepts pending jobs", async () => {
    requestMock.mockResolvedValueOnce({
      jobId: "job-1",
      status: "pending",
      videoAssetId: null,
      providerKey: "wan",
      resolvedModel: "wan2.7-i2v-2026-04-25",
      requestId: "req-1",
    });

    const { jobOrchestratorGateway } = await import("./gateway");
    const result = await jobOrchestratorGateway.createJob({
      providerKey: "wan",
      requestedModel: "wan2.7-i2v-2026-04-25",
      prompt: "test prompt",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });

    expect(result.status).toBe("pending");
    expect(requestMock).toHaveBeenCalledWith("/jobs-create", {
      method: "POST",
      body: JSON.stringify({
        providerKey: "wan",
        requestedModel: "wan2.7-i2v-2026-04-25",
        clientRequestId: "00000000-0000-4000-8000-000000000001",
        prompt: "test prompt",
        durationSeconds: 5,
        aspectRatio: "16:9",
      }),
      timeoutMs: 45_000,
    });
  });

  it("retries a timed-out create once with the same idempotency key", async () => {
    const { ApiError } = await import("@/core/api/client");
    requestMock
      .mockRejectedValueOnce(new ApiError(408, "TIMEOUT", "The request took too long. Please try again."))
      .mockResolvedValueOnce({
        jobId: "job-1",
        status: "pending",
        videoAssetId: null,
        providerKey: "wan",
        resolvedModel: "wan2.7-i2v-2026-04-25",
        requestId: "req-2",
      });

    const { jobOrchestratorGateway } = await import("./gateway");
    const result = await jobOrchestratorGateway.createJob({
      providerKey: "wan",
      requestedModel: "wan2.7-i2v-2026-04-25",
      prompt: "test prompt",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });

    expect(result.jobId).toBe("job-1");
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock.mock.calls[0][1].body).toBe(requestMock.mock.calls[1][1].body);
    expect(JSON.parse(requestMock.mock.calls[0][1].body)).toMatchObject({
      clientRequestId: "00000000-0000-4000-8000-000000000001",
    });
  });
});