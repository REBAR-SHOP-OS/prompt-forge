import { describe, expect, it, vi } from "vitest";
import { createSubmitAttemptCoordinator } from "./submitAttempt";

describe("createSubmitAttemptCoordinator", () => {
  it("rejects a second concurrent begin synchronously", () => {
    const uuid = vi.fn()
      .mockReturnValueOnce("slot-a")
      .mockReturnValueOnce("attempt-1")
      .mockReturnValueOnce("attempt-2");
    const coordinator = createSubmitAttemptCoordinator(uuid);

    const first = coordinator.begin(["a"]);
    const second = coordinator.begin(["b"]);

    expect(first).not.toBeNull();
    expect(coordinator.active).toBe(true);
    expect(second).toBeNull();
    expect(uuid).toHaveBeenCalledTimes(2);

    first?.release();
    expect(coordinator.active).toBe(false);
    expect(coordinator.begin()).not.toBeNull();
  });

  it("keeps one stable UUID per slot and distinct UUIDs between slots", () => {
    const ids = ["slot-a-key", "slot-b-key", "attempt-key"];
    const coordinator = createSubmitAttemptCoordinator(() =>
      ids.shift() ?? "unexpected"
    );
    const lease = coordinator.begin(["a", "b"]);

    expect(lease).not.toBeNull();
    expect(lease?.keyForSlot("a")).toBe("slot-a-key");
    expect(lease?.keyForSlot("a")).toBe("slot-a-key");
    expect(lease?.keyForSlot("b")).toBe("slot-b-key");
    expect(lease?.keyForSlot("a")).not.toBe(lease?.keyForSlot("b"));
    expect(lease?.slotKeys).toEqual(
      new Map([
        ["a", "slot-a-key"],
        ["b", "slot-b-key"],
      ]),
    );
  });
});
