export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/db/ai-settings";

/**
 * Lightweight status probe used by the UI to decide whether to render AI
 * Analyst surfaces. Never returns the token itself.
 */
export async function GET() {
  try {
    const { enabled, token } = await getAiConfig();
    return NextResponse.json({ enabled, configured: Boolean(token) });
  } catch (error) {
    console.error("AI status failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
