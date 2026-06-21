export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidDate, daysAgo } from "@/lib/utils";
import { getAiConfig } from "@/lib/db/ai-settings";
import { generateInsight } from "@/lib/ai/insights";

const bodySchema = z.object({
  kind: z.enum(["cost_license", "adoption", "executive", "delivery", "roi_forecast", "team_scorecards"]),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  orgId: z.coerce.number().int().optional(),
  force: z.boolean().optional(),
  locale: z.enum(["en", "ar", "es", "fr"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { enabled, token } = await getAiConfig();
    if (!enabled) return NextResponse.json({ error: "feature-disabled" }, { status: 403 });
    if (!token) return NextResponse.json({ error: "not-configured" }, { status: 409 });

    const body = bodySchema.parse(await request.json());
    const end = body.end ?? new Date().toISOString().split("T")[0];
    const start = body.start ?? daysAgo(28);

    const result = await generateInsight(
      body.kind,
      { start, end, orgId: body.orgId },
      { force: body.force, locale: body.locale },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("AI insights failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
