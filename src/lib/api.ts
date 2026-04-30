// Shim. New code: import from @/core/api/client and module APIs directly.
export { ApiError, request } from "@/core/api/client";
export type { Me } from "@/core/api/types";

import { request } from "@/core/api/client";
import type { Me } from "@/core/api/types";
import { creditApi } from "@/modules/credit-management/api";
import { adminApi } from "@/modules/admin-monitor/api";
import { generatorUiApi } from "@/modules/generator-ui/api";
import type { ProviderKey } from "@/modules/external-api-adapter/contract";

/** @deprecated Import the relevant module API instead. */
export const api = {
  health: () => adminApi.getHealth(),
  me: () => request<Me>("/me"),
  credits: () => creditApi.getBalance(),
  routePreview: (input: { providerKey: ProviderKey; requestedModel?: string; prompt: string }) =>
    generatorUiApi.routePreview(input),
};
