// Shared gateway primitives consumed by every domain gateway.
// A "GatewayRequest" is the normalized input each domain operation receives.
// A "GatewayResponse" is the normalized output the edge surface serializes.
//
// Domain gateways own:
//   - authentication enforcement
//   - rate limiting (where applicable)
//   - observability (request log)
//   - audit (where applicable)
//   - dispatch to internal services via their contract.ts
//
// Edge endpoints (`supabase/functions/<name>/index.ts`) MUST stay thin:
// they only construct a GatewayRequest and serialize a GatewayResponse.

import type { AuthContext } from "../../core/auth.ts";

export interface GatewayRequest {
  req: Request;
  /** Operation name within the domain, e.g. "getHealth", "routePreview". */
  operation: string;
  /** Parsed/raw body — gateway is responsible for validation. */
  body?: unknown;
  /** Pre-resolved auth context if the endpoint already authenticated. Optional. */
  auth?: AuthContext | null;
}

export interface GatewayResponse {
  status: number;
  /** Always JSON-serializable. Errors use { error: { code, message }, requestId }. */
  body: unknown;
}

/** Stable, versioned identifier for a domain's public contract surface. */
export interface DomainContractMeta {
  domain: string;
  version: "v1";
  operations: readonly string[];
}
