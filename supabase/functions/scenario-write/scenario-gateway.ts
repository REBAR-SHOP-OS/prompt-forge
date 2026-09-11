export type ScenarioGatewayStage = "initial" | "retry" | "semantic-judge";

export interface ScenarioGatewayContext {
  durationSeconds: number;
  unit: "scene" | "plan";
  stage: ScenarioGatewayStage;
}

type GatewayErrorLogger = (message: string, details: unknown) => void;

/**
 * Convert a transport-level gateway rejection into an ordinary upstream
 * response so callers can use their existing retry/fail-closed handling instead
 * of falling through to the Edge Function's generic Internal error catch.
 */
export async function requestScenarioGateway(
  request: () => Promise<Response>,
  context: ScenarioGatewayContext,
  logError: GatewayErrorLogger = console.error,
): Promise<Response> {
  try {
    return await request();
  } catch (error) {
    logError("scenario-write gateway request error", { ...context, error });
    return new Response(null, { status: 503 });
  }
}

/**
 * Read OpenAI-compatible assistant text without trusting the upstream JSON
 * shape. A refusal, provider schema change, or malformed success payload becomes
 * an empty response that the existing quality pass retries or maps to a clear
 * 502 instead of throwing on `.trim()`.
 */
export function readScenarioAssistantText(
  data: unknown,
  label: string,
  logError: GatewayErrorLogger = console.error,
): string {
  const content = (data as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null)?.choices?.[0]?.message?.content;

  if (typeof content === "string") return content.trim();

  logError(`${label}: invalid assistant content`, {
    contentType: Array.isArray(content) ? "array" : content === null ? "null" : typeof content,
  });
  return "";
}
