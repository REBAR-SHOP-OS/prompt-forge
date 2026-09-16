export interface SubmitAttemptLease {
  readonly attemptId: string;
  readonly slotKeys: ReadonlyMap<string, string>;
  keyForSlot(slotId: string): string;
  release(): void;
}

export interface SubmitAttemptCoordinator {
  readonly active: boolean;
  begin(slotIds?: Iterable<string>): SubmitAttemptLease | null;
}

/**
 * A synchronous submit lease. `begin` flips the guard before returning, so two
 * event handlers entering in the same tick cannot both start paid work.
 * Idempotency keys are allocated once per slot for the lifetime of the lease.
 */
export function createSubmitAttemptCoordinator(
  uuid: () => string = () => crypto.randomUUID(),
): SubmitAttemptCoordinator {
  let activeLease: SubmitAttemptLease | null = null;

  return {
    get active() {
      return activeLease !== null;
    },

    begin(slotIds: Iterable<string> = []): SubmitAttemptLease | null {
      if (activeLease) return null;

      const keys = new Map<string, string>();
      const keyForSlot = (slotId: string): string => {
        const normalized = slotId.trim();
        if (!normalized) throw new Error("slotId is required");
        const existing = keys.get(normalized);
        if (existing) return existing;
        const next = uuid();
        keys.set(normalized, next);
        return next;
      };

      for (const slotId of slotIds) keyForSlot(slotId);

      let released = false;
      const lease: SubmitAttemptLease = {
        attemptId: uuid(),
        get slotKeys() {
          return new Map(keys);
        },
        keyForSlot,
        release() {
          if (released) return;
          released = true;
          if (activeLease === lease) activeLease = null;
        },
      };

      // Set synchronously, before control can return to an async caller.
      activeLease = lease;
      return lease;
    },
  };
}
