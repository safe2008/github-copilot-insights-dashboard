export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/db/ai-settings";
import { listAvailableModels } from "@/lib/ai/models";
import { safeErrorMessage } from "@/lib/auth";

/**
 * Lazy-loaded Copilot model catalog for the settings dropdown. Kept separate
 * from the main settings GET so opening the AI Analyst tab doesn't block on
 * spawning the CLI + calling listModels().
 */
export async function GET() {
  try {
    const { token } = await getAiConfig();
    const models = await listAvailableModels(Boolean(token));
    return NextResponse.json({ models });
  } catch (err) {
    console.error("AI models GET error:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to list models") },
      { status: 500 },
    );
  }
}
