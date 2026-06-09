/**
 * Maps raw GitHub Copilot model identifiers to human-readable display names.
 *
 * Source: https://docs.github.com/en/copilot/reference/ai-models/supported-models
 * Models not in this map render as auto-formatted (title-cased).
 */

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // ── OpenAI GPT family ──
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-5-mini": "GPT-5 Mini",
  "gpt-5": "GPT-5",
  "gpt-5.1": "GPT-5.1",
  "gpt-5.1-codex": "GPT-5.1 Codex",
  "gpt-5.1-codex-max": "GPT-5.1 Codex Max",
  "gpt-5.1-codex-mini": "GPT-5.1 Codex Mini",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.2-codex": "GPT-5.2 Codex",
  "gpt-5-codex": "GPT-5 Codex",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.4-nano": "GPT-5.4 Nano",
  "gpt-5.5": "GPT-5.5",

  // ── OpenAI reasoning models (retired) ──
  "o1-mini": "o1 Mini",
  "o3": "o3",
  "o3-mini": "o3 Mini",
  "o4-mini": "o4 Mini",

  // ── Anthropic Claude family ──
  "claude-3.5-sonnet": "Claude Sonnet 3.5",
  "claude-3.5-haiku": "Claude Haiku 3.5",
  "claude-sonnet-3.7": "Claude Sonnet 3.7",
  "claude-sonnet-3.7-thinking": "Claude Sonnet 3.7 Thinking",
  "claude-opus-4": "Claude Opus 4",
  "claude-opus-4.1": "Claude Opus 4.1",
  "claude-sonnet-4": "Claude Sonnet 4",
  "claude-4.0-sonnet": "Claude Sonnet 4.0",
  "claude-4.5-sonnet": "Claude Sonnet 4.5",
  "claude-sonnet-4.5": "Claude Sonnet 4.5",
  "claude-4.5-haiku": "Claude Haiku 4.5",
  "claude-haiku-4.5": "Claude Haiku 4.5",
  "claude-opus-4.5": "Claude Opus 4.5",
  "claude-4.6-sonnet": "Claude Sonnet 4.6",
  "claude-sonnet-4.6": "Claude Sonnet 4.6",
  "claude-opus-4.6": "Claude Opus 4.6",
  "claude-opus-4.6-fast": "Claude Opus 4.6 (Fast Mode)",
  "claude-opus-4.7": "Claude Opus 4.7",
  "claude-opus-4.8": "Claude Opus 4.8",

  // ── Google Gemini family ──
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-3-pro": "Gemini 3 Pro",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "gemini-3.5-flash": "Gemini 3.5 Flash",

  // ── Microsoft family ──
  "mai-code-1-flash": "MAI-Code-1-Flash",

  // ── xAI Grok family (retired) ──
  "grok-code-fast-1": "Grok Code Fast 1",

  // ── Fine-tuned / special models ──
  "raptor-mini": "Raptor Mini",
  "goldeneye": "Goldeneye",

  // ── Meta identifiers ──
  "auto": "Auto",
  "unknown": "Unknown",
  "others": "Others",
};

/**
 * Convert a raw model identifier to a display name.
 * Returns the mapped name if known, otherwise auto-formats the identifier.
 */
export function getModelDisplayName(modelId: string): string {
  if (!modelId) return "Unknown";
  const mapped = MODEL_DISPLAY_NAMES[modelId];
  if (mapped) return mapped;
  // Auto-format: "claude-opus-4.7" → "Claude Opus 4.7"
  return modelId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Apply display names to an array of objects that have a model name field.
 * Returns a new array with the field value replaced by the display name.
 */
export function applyModelDisplayNames<T extends Record<string, unknown>>(
  rows: T[],
  field: keyof T & string,
): T[] {
  return rows.map((row) => ({
    ...row,
    [field]: getModelDisplayName(String(row[field] ?? "")),
  }));
}
