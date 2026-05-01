// Shared core: Migration cutover registry.
//
// Each domain has a "phase" describing its current migration state.
// Gateways MUST consult `getDomainPhase(domain)` before performing
// write-side operations (Phase 4 only adds the contract; gateways will
// enforce when actual extractions begin in later phases).
//
// Phases (strangler-fig sequencing):
//   "active"       — domain is fully owned by this codebase. Default.
//   "dual-write"   — writes go to BOTH old and new surfaces. Reads from old.
//   "shadow-read"  — writes to old + new; reads compared but old is canonical.
//   "cutover"      — reads from new, writes to new. Old surface frozen for writes.
//   "frozen"       — old surface rejects ALL writes. Used as hard freeze prior
//                    to a cutover commit.
//   "rolled-back"  — emergency: revert to old surface; new surface refuses writes.
//
// Override per-domain via env: CUTOVER_<DOMAIN_UPPER_SNAKE>=phase
//   e.g. CUTOVER_JOB_ORCHESTRATOR=dual-write
//
// In Phase 4 every domain defaults to "active" — no behavior change.

export type CutoverPhase =
  | "active"
  | "dual-write"
  | "shadow-read"
  | "cutover"
  | "frozen"
  | "rolled-back";

export type DomainKey =
  | "generator-ui"
  | "external-api-adapter"
  | "job-orchestrator"
  | "video-library"
  | "credit-management"
  | "admin-monitor";

const DEFAULT_PHASE: Record<DomainKey, CutoverPhase> = {
  "generator-ui": "active",
  "external-api-adapter": "active",
  "job-orchestrator": "active",
  "video-library": "active",
  "credit-management": "active",
  "admin-monitor": "active",
};

function envKey(domain: DomainKey): string {
  return `CUTOVER_${domain.toUpperCase().replace(/-/g, "_")}`;
}

function isValidPhase(v: string | undefined): v is CutoverPhase {
  return v === "active" || v === "dual-write" || v === "shadow-read"
    || v === "cutover" || v === "frozen" || v === "rolled-back";
}

export function getDomainPhase(domain: DomainKey): CutoverPhase {
  const fromEnv = Deno.env.get(envKey(domain));
  if (isValidPhase(fromEnv)) return fromEnv;
  return DEFAULT_PHASE[domain];
}

/**
 * Returns true if the gateway should ACCEPT a write-side operation right now.
 * Gateways call this for any mutating operation. Read-side operations are
 * unaffected by cutover phase (callers should not gate reads with this).
 */
export function isWriteAllowed(domain: DomainKey): { allowed: boolean; reason?: string } {
  const phase = getDomainPhase(domain);
  switch (phase) {
    case "active":
    case "dual-write":
    case "shadow-read":
    case "cutover":
      return { allowed: true };
    case "frozen":
      return { allowed: false, reason: `${domain} is frozen for migration cutover` };
    case "rolled-back":
      return { allowed: false, reason: `${domain} is in rolled-back state; writes disabled on new surface` };
  }
}

/** Convenience for observability — emit current phase map in /health, etc. */
export function snapshotPhases(): Record<DomainKey, CutoverPhase> {
  return {
    "generator-ui": getDomainPhase("generator-ui"),
    "external-api-adapter": getDomainPhase("external-api-adapter"),
    "job-orchestrator": getDomainPhase("job-orchestrator"),
    "video-library": getDomainPhase("video-library"),
    "credit-management": getDomainPhase("credit-management"),
    "admin-monitor": getDomainPhase("admin-monitor"),
  };
}
