import { describe, expect, it, vi } from "vitest";
import {
  ConfirmedVeoExtensionDispatchError,
  dispatchPersistedVeoExtension,
  type VeoExtensionClaimStore,
} from "./veo-extension-claim.ts";

function memoryStore(initial: string) {
  let current = initial;
  const store: VeoExtensionClaimStore = {
    async claim(expected, claimed) {
      if (current !== expected) return false;
      current = claimed;
      return true;
    },
    async settle(claimed, next) {
      if (current !== claimed) return false;
      current = next;
      return true;
    },
  };
  return { store, current: () => current };
}

const baseInput = {
  expectedProviderJobId: "phase-one",
  claimedProviderJobId: "extension-claimed",
  retryProviderJobId: () => "extension-retry-1",
  isConfirmedFailure: (error: unknown) =>
    error instanceof ConfirmedVeoExtensionDispatchError,
};

describe("dispatchPersistedVeoExtension", () => {
  it("allows exactly one paid dispatch when concurrent polls race", async () => {
    const state = memoryStore("phase-one");
    const dispatch = vi.fn(async () => ({
      value: "op-2",
      providerJobId: "phase-two",
    }));

    const [first, second] = await Promise.all([
      dispatchPersistedVeoExtension({
        ...baseInput,
        store: state.store,
        dispatch,
      }),
      dispatchPersistedVeoExtension({
        ...baseInput,
        store: state.store,
        dispatch,
      }),
    ]);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect([first.status, second.status].sort()).toEqual([
      "dispatched",
      "lost",
    ]);
    expect(state.current()).toBe("phase-two");
  });

  it("persists a bounded retry state after a confirmed provider rejection", async () => {
    const state = memoryStore("phase-one");
    const result = await dispatchPersistedVeoExtension({
      ...baseInput,
      store: state.store,
      dispatch: async () => {
        throw new ConfirmedVeoExtensionDispatchError(
          "HTTP 409 not processed yet",
        );
      },
    });

    expect(result).toMatchObject({
      status: "retryable",
      providerJobId: "extension-retry-1",
    });
    expect(state.current()).toBe("extension-retry-1");
  });

  it("retains the durable claim after an ambiguous transport failure", async () => {
    const state = memoryStore("phase-one");
    const first = await dispatchPersistedVeoExtension({
      ...baseInput,
      store: state.store,
      dispatch: async () => {
        throw new TypeError("fetch failed after request write");
      },
    });
    const retryDispatch = vi.fn(async () => ({
      value: "op-duplicate",
      providerJobId: "phase-two",
    }));
    const second = await dispatchPersistedVeoExtension({
      ...baseInput,
      store: state.store,
      dispatch: retryDispatch,
    });

    expect(first.status).toBe("ambiguous");
    expect(second.status).toBe("lost");
    expect(retryDispatch).not.toHaveBeenCalled();
    expect(state.current()).toBe("extension-claimed");
  });
});
