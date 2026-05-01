// Shim. New code: import the per-domain gateway from
//   @/modules/<domain>/gateway
// directly. This aggregator is kept only for backwards compatibility.
export { ApiError, request } from "@/core/api/client";
export type { Me } from "@/core/api/types";

import { adminMonitorGateway } from "@/modules/admin-monitor/gateway";
import { creditManagementGateway } from "@/modules/credit-management/gateway";
import { generatorUiGateway } from "@/modules/generator-ui/gateway";

/** @deprecated Import the relevant per-domain gateway instead. */
export const api = {
  health: () => adminMonitorGateway.getHealth(),
  me: () => generatorUiGateway.getMe(),
  credits: () => creditManagementGateway.getMyBalance(),
  routePreview: generatorUiGateway.routePreview,
};
