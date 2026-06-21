import { getSetting, setSetting } from "@/lib/db/settings";

/**
 * AI Analyst configuration, persisted in the `app_settings` key/value table.
 * - `ai_enabled`   → feature toggle (string-boolean, like `sync_enabled`)
 * - `copilot_token`→ GitHub Copilot token used by the Copilot SDK
 * - `ai_model`     → "auto" or a specific model id
 */
export interface AiConfig {
  enabled: boolean;
  token: string | null;
  model: string;
}

const ENABLED_KEY = "ai_enabled";
const TOKEN_KEY = "copilot_token";
const MODEL_KEY = "ai_model";

export async function getAiConfig(): Promise<AiConfig> {
  const [enabled, token, model] = await Promise.all([
    getSetting(ENABLED_KEY),
    getSetting(TOKEN_KEY),
    getSetting(MODEL_KEY),
  ]);
  return {
    enabled: enabled === "true",
    token: token ?? null,
    model: model ?? "auto",
  };
}

/**
 * Returns null when the token looks usable, otherwise a user-facing reason.
 * The Copilot SDK does not accept classic `ghp_` tokens.
 */
export function validateCopilotToken(token: string): string | null {
  const t = token.trim();
  if (!t) return "Token is required.";
  if (t.startsWith("ghp_")) {
    return "Classic tokens (ghp_) are not supported. Use a fine-grained PAT (github_pat_) or an OAuth token from a Copilot-licensed account.";
  }
  return null;
}

export async function setAiConfig(p: {
  enabled?: boolean;
  token?: string;
  model?: string;
}): Promise<void> {
  if (p.enabled !== undefined) await setSetting(ENABLED_KEY, p.enabled ? "true" : "false");
  if (p.token !== undefined) await setSetting(TOKEN_KEY, p.token);
  if (p.model !== undefined) await setSetting(MODEL_KEY, p.model);
}
