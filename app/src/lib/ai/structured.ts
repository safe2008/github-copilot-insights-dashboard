import { z } from "zod";

/**
 * Machine-readable companion to an AI insight narrative. Each agent appends a
 * single fenced `json` block in this shape; the server parses + strips it so the
 * UI can render scannable finding/recommendation cards with action buttons,
 * while the prose above remains the human-readable analysis.
 */
export const structuredInsightSchema = z.object({
  findings: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string().optional().default(""),
        metric: z.string().optional().default(""),
        severity: z.enum(["positive", "info", "watch", "risk"]).catch("info"),
      }),
    )
    .default([]),
  recommendations: z
    .array(
      z.object({
        action: z.string(),
        rationale: z.string().optional().default(""),
        expectedImpact: z.string().optional().default(""),
        metric: z.string().optional().default(""),
      }),
    )
    .default([]),
});

export type StructuredInsight = z.infer<typeof structuredInsightSchema>;

/** Matches a trailing ```json … ``` fenced block at the end of the response. */
const TRAILING_JSON_BLOCK = /```json\s*([\s\S]*?)```\s*$/i;

/**
 * Split a model response into human-readable prose plus the trailing structured
 * JSON block. Best-effort: when the block is missing or malformed, the whole
 * response is returned as prose with `structured: null`.
 */
export function splitStructured(raw: string): {
  prose: string;
  structured: StructuredInsight | null;
} {
  const match = raw.match(TRAILING_JSON_BLOCK);
  if (!match || match.index === undefined) {
    return { prose: raw.trim(), structured: null };
  }
  try {
    const parsed = structuredInsightSchema.parse(JSON.parse(match[1].trim()));
    if (parsed.findings.length === 0 && parsed.recommendations.length === 0) {
      return { prose: raw.trim(), structured: null };
    }
    return { prose: raw.slice(0, match.index).trim(), structured: parsed };
  } catch {
    return { prose: raw.trim(), structured: null };
  }
}

/**
 * Hide an in-progress trailing ```json fence while the answer is still
 * streaming, so the raw JSON never flashes in the UI before it is parsed out.
 */
export function stripStructuredForDisplay(raw: string): string {
  const idx = raw.lastIndexOf("```json");
  return idx >= 0 ? raw.slice(0, idx).trimEnd() : raw;
}
