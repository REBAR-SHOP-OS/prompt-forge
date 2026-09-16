import { describe, expect, it, vi } from "vitest";
import { executeJobDeleteFlow } from "./delete-flow.ts";

const activeJob = {
  id: "job-1",
  status: "processing",
  provider_key: "wan",
  provider_job_id: "provider-1",
};

describe("executeJobDeleteFlow", () => {
  it("cancels the owned active provider job before local deletion", async () => {
    const order: string[] = [];
    const cancel = vi.fn(async () => {
      order.push("cancel");
      return {
        status: "requested" as const,
        providerKey: "wan" as const,
        providerJobId: "provider-1",
        message: null,
      };
    });
    const deleteLocal = vi.fn(async () => {
      order.push("delete");
      return ["merged-videos/user/video.mp4"];
    });
    const purge = vi.fn(async () => {
      order.push("purge");
      return { attempted: 1, failed: 0 };
    });

    const result = await executeJobDeleteFlow(activeJob, {
      cancel,
      deleteLocal,
      purge,
    });

    expect(order).toEqual(["cancel", "delete", "purge"]);
    expect(result).toMatchObject({
      outcome: "deleted",
      localDeleted: true,
      cancellation: { status: "requested" },
      purge: { status: "purged", attempted: 1, failed: 0 },
    });
  });

  it("truthfully reports unsupported cancellation after deleting local state", async () => {
    const result = await executeJobDeleteFlow(activeJob, {
      cancel: async () => ({
        status: "unsupported",
        providerKey: "wan",
        providerJobId: "provider-1",
        message: "not supported",
      }),
      deleteLocal: async () => [],
      purge: async () => ({ attempted: 0, failed: 0 }),
    });

    expect(result).toMatchObject({
      outcome: "deleted_with_warnings",
      localDeleted: true,
      cancellation: { status: "unsupported" },
      purge: { status: "not_needed" },
    });
  });

  it("truthfully reports cancellation failure and partial purge", async () => {
    const result = await executeJobDeleteFlow(activeJob, {
      cancel: async () => ({
        status: "failed",
        providerKey: "wan",
        providerJobId: "provider-1",
        message: "HTTP 503",
      }),
      deleteLocal: async () => ["a", "b"],
      purge: async () => ({ attempted: 2, failed: 1 }),
    });

    expect(result).toMatchObject({
      outcome: "deleted_with_warnings",
      cancellation: { status: "failed", message: "HTTP 503" },
      purge: { status: "partial", attempted: 2, failed: 1 },
    });
  });

  it("does not call cancellation for a terminal job", async () => {
    const cancel = vi.fn();
    const result = await executeJobDeleteFlow(
      { ...activeJob, status: "completed" },
      {
        cancel,
        deleteLocal: async () => [],
        purge: async () => ({ attempted: 0, failed: 0 }),
      },
    );

    expect(cancel).not.toHaveBeenCalled();
    expect(result.cancellation.status).toBe("not_needed");
  });
});
