import { getCopilotClient } from "./copilot-client";

/** Reasoning-effort levels accepted by the Copilot SDK (`SessionConfig.reasoningEffort`). */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface ModelOption {
  id: string;
  name: string;
}

/** Static fallback shown only when there is no working token. */
const FALLBACK_MODELS: ModelOption[] = [
  { id: "auto", name: "Auto" },
  { id: "claude-opus-4.8", name: "Claude Opus 4.8" },
  { id: "gpt-5.5", name: "GPT-5.5" },
];

/**
 * Live Copilot model list from the SDK (`client.listModels()`), returned as-is —
 * no synthetic "auto" is injected, so the catalog (including the API's own
 * default/auto entry) reflects exactly what Copilot grants the token. Falls back
 * to a small static list when there is no token or the call fails.
 */
export async function listAvailableModels(hasToken: boolean): Promise<ModelOption[]> {
  if (!hasToken) return FALLBACK_MODELS;
  try {
    const client = await getCopilotClient();
    const models = await client.listModels();
    const mapped = models.map((m) => ({ id: m.id, name: m.name || m.id }));
    return mapped.length ? mapped : FALLBACK_MODELS;
  } catch (err) {
    console.warn("listModels failed; using fallback model list:", err instanceof Error ? err.message : String(err));
    return FALLBACK_MODELS;
  }
}

/** Reasoning-effort levels, deepest first. */
const EFFORT_PRIORITY: ReasoningEffort[] = ["xhigh", "high", "medium", "low"];

/**
 * Highest reasoning-effort level the given model supports, or `undefined` when
 * the model is "auto"/unknown or has no reasoning-effort control. Lets the AI
 * Analyst run the selected model at its deepest reasoning for richer analysis.
 */
export async function resolveMaxReasoningEffort(
  modelId: string | undefined,
): Promise<ReasoningEffort | undefined> {
  if (!modelId || modelId === "auto") return undefined;
  try {
    const client = await getCopilotClient();
    const models = await client.listModels();
    const m = models.find((x) => x.id === modelId);
    if (!m?.capabilities?.supports?.reasoningEffort) return undefined;
    const supported = m.supportedReasoningEfforts ?? [];
    return EFFORT_PRIORITY.find((e) => supported.includes(e));
  } catch (err) {
    console.warn(
      "Could not resolve reasoning effort; using model default:",
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}
