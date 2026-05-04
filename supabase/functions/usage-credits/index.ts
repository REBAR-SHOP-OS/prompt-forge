// Edge surface for credit-management.getMyBalance (v1).
// Thin adapter: all logic lives in the credit-management domain gateway.
import { preflightResponse } from "../_shared/core/http.ts";
import { creditManagementGateway } from "../_shared/modules/credit-management/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return preflightResponse(req);
  return creditManagementGateway.handle(req, "getMyBalance");
});
