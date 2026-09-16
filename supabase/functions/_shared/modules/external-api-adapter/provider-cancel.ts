import type { GenerationCancelResult, ProviderKey } from "./contract.ts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com";
const VEO_STATE_PREFIX = "veo:v1:";

export interface ProviderCancelDependencies {
  fetch: typeof fetch;
  env(name: string): string | undefined;
}

interface DecodedVeoCancelState {
  currentOp: string;
  extensionClaimToken?: string;
}

function result(
  status: GenerationCancelResult["status"],
  providerKey: ProviderKey,
  providerJobId: string,
  message: string | null,
): GenerationCancelResult {
  return { status, providerKey, providerJobId, message };
}

function decodeVeoCancelState(
  providerJobId: string,
): DecodedVeoCancelState | null {
  if (!providerJobId.startsWith(VEO_STATE_PREFIX)) {
    return providerJobId.trim() ? { currentOp: providerJobId } : null;
  }
  const raw = providerJobId.slice(VEO_STATE_PREFIX.length);
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (raw.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<
      DecodedVeoCancelState
    >;
    return typeof parsed.currentOp === "string" && parsed.currentOp.length > 0
      ? {
        currentOp: parsed.currentOp,
        extensionClaimToken: parsed.extensionClaimToken,
      }
      : null;
  } catch {
    return null;
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function localHeaders(
  env: ProviderCancelDependencies["env"],
): Record<string, string> {
  const token = env("LOCAL_VIDEO_ROUTER_TOKEN") ?? env("LOCAL_VIDEO_API_KEY");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function localBaseUrl(env: ProviderCancelDependencies["env"]): string | null {
  const raw = (
    env("LOCAL_VIDEO_ROUTER_URL") ??
      env("LOCAL_VIDEO_BASE_URL") ??
      env("LOCAL_AI_ROUTER_BASE_URL") ??
      ""
  ).trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== "https:" && env("ALLOW_LOCAL_VIDEO_HTTP") !== "true"
    ) return null;
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function postCancel(
  deps: ProviderCancelDependencies,
  providerKey: ProviderKey,
  providerJobId: string,
  url: string,
  init: RequestInit,
): Promise<GenerationCancelResult> {
  try {
    const response = await deps.fetch(url, init);
    await response.body?.cancel().catch(() => {});
    if (response.ok) {
      // HTTP success confirms that the provider accepted the cancellation
      // request; it does not prove the remote operation has already stopped.
      return result("requested", providerKey, providerJobId, null);
    }
    return result(
      "failed",
      providerKey,
      providerJobId,
      `Provider cancellation returned HTTP ${response.status}`,
    );
  } catch (error) {
    return result(
      "failed",
      providerKey,
      providerJobId,
      error instanceof Error ? error.message : "Provider cancellation failed",
    );
  }
}

/** Cancel one provider job only. This helper intentionally has no global interrupt route. */
export async function cancelProviderGeneration(
  providerKey: ProviderKey,
  providerJobId: string,
  deps: ProviderCancelDependencies = {
    fetch: globalThis.fetch.bind(globalThis),
    env: (name) => Deno.env.get(name),
  },
): Promise<GenerationCancelResult> {
  if (providerKey === "flow") {
    const state = decodeVeoCancelState(providerJobId);
    if (!state) {
      return result(
        "unsupported",
        providerKey,
        providerJobId,
        "Veo operation state is not decodable",
      );
    }
    if (state.extensionClaimToken) {
      return result(
        "unsupported",
        providerKey,
        providerJobId,
        "Veo extension dispatch outcome is ambiguous; cancellation cannot identify the active operation safely",
      );
    }
    const apiKey = deps.env("GEMINI_API_KEY") ?? deps.env("FLOW_API_KEY");
    if (!apiKey) {
      return result(
        "failed",
        providerKey,
        providerJobId,
        "Veo API key is not configured",
      );
    }
    const operation = state.currentOp.replace(/^\/+/, "");
    return await postCancel(
      deps,
      providerKey,
      providerJobId,
      `${GEMINI_BASE}/${operation}:cancel?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
  }

  if (providerKey === "wan") {
    const apiKey = deps.env("WAN_API_KEY");
    if (!apiKey) {
      return result(
        "failed",
        providerKey,
        providerJobId,
        "Wan API key is not configured",
      );
    }
    return await postCancel(
      deps,
      providerKey,
      providerJobId,
      `${DASHSCOPE_BASE_URL}/api/v1/tasks/${
        encodeURIComponent(providerJobId)
      }/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
  }

  const baseUrl = localBaseUrl(deps.env);
  if (!baseUrl) {
    return result(
      "unsupported",
      providerKey,
      providerJobId,
      "Local per-job cancellation is not configured",
    );
  }

  if (providerJobId.startsWith("localcomfy:")) {
    const promptId = providerJobId.slice("localcomfy:".length);
    if (!promptId) {
      return result(
        "unsupported",
        providerKey,
        providerJobId,
        "ComfyUI prompt id is missing",
      );
    }
    return await postCancel(
      deps,
      providerKey,
      providerJobId,
      joinUrl(baseUrl, "/queue"),
      {
        method: "POST",
        headers: localHeaders(deps.env),
        body: JSON.stringify({ delete: [promptId] }),
      },
    );
  }

  const routeTemplate = (deps.env("LOCAL_VIDEO_ROUTER_CANCEL_PATH") ?? "")
    .trim();
  if (!routeTemplate || !routeTemplate.includes("{id}")) {
    return result(
      "unsupported",
      providerKey,
      providerJobId,
      "Local router has no configured per-job cancellation route",
    );
  }
  const rawId = providerJobId.startsWith("local:")
    ? providerJobId.slice("local:".length)
    : providerJobId;
  const cancelPath = routeTemplate.replace("{id}", encodeURIComponent(rawId));
  return await postCancel(
    deps,
    providerKey,
    providerJobId,
    joinUrl(baseUrl, cancelPath),
    { method: "POST", headers: localHeaders(deps.env), body: "{}" },
  );
}
