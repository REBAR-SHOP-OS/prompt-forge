// Deprecated: prefer `creditManagementGateway` from "./gateway".
import { creditManagementGateway } from "./gateway";
import type { CreditApi } from "./contract";

export const creditApi: CreditApi = {
  getBalance: () => creditManagementGateway.getMyBalance(),
};
