// Frontend: Migration cutover config (mirror of backend registry).
//
// Used to coordinate UI behavior during a domain cutover (e.g. show a banner,
// disable a write button, switch to a read-only view). In Phase 4 all domains
// default to "active" — UI is unchanged.
//
// Override at build time via VITE_CUTOVER_<DOMAIN_UPPER_SNAKE>=phase

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

function isValidPhase(v: unknown): v is CutoverPhase {
  return v === "active" || v === "dual-write" || v === "shadow-read"
    || v === "cutover" || v === "frozen" || v === "rolled-back";
}

function readEnv(domain: DomainKey): string | undefined {
  const key = `VITE_CUTOVER_${domain.toUpperCase().replace(/-/g, "_")}`;
  // Vite inlines import.meta.env at build time; missing keys return undefined.
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function getDomainPhase(domain: DomainKey): CutoverPhase {
  const v = readEnv(domain);
  return isValidPhase(v) ? v : DEFAULT_PHASE[domain];
}

export function isWriteAllowedClientSide(domain: DomainKey): boolean {
  const p = getDomainPhase(domain);
  return p !== "frozen" && p !== "rolled-back";
}
