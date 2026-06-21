import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dimEnterpriseTeam, dimEnterpriseTeamMember, factCopilotUsageDaily } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { daysAgo } from "@/lib/utils";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const teams = await db
      .select({
        teamId: dimEnterpriseTeam.teamId,
        githubTeamId: dimEnterpriseTeam.githubTeamId,
        teamName: dimEnterpriseTeam.teamName,
        teamSlug: dimEnterpriseTeam.teamSlug,
        description: dimEnterpriseTeam.description,
        memberCount: sql<number>`count(${dimEnterpriseTeamMember.id})`.as("member_count"),
      })
      .from(dimEnterpriseTeam)
      .leftJoin(
        dimEnterpriseTeamMember,
        eq(dimEnterpriseTeam.teamId, dimEnterpriseTeamMember.teamId),
      )
      .groupBy(
        dimEnterpriseTeam.teamId,
        dimEnterpriseTeam.githubTeamId,
        dimEnterpriseTeam.teamName,
        dimEnterpriseTeam.teamSlug,
        dimEnterpriseTeam.description,
      )
      .orderBy(dimEnterpriseTeam.teamName);

    // AI credits consumed per team over the trailing 28 days, attributed via the
    // team roster (member ai_credits_used from the Copilot Usage Metrics signal).
    const windowStart = daysAgo(28);
    const creditRows = await db
      .select({
        teamId: dimEnterpriseTeamMember.teamId,
        aiCreditsUsed: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.aiCreditsUsed}), 0)::float8`,
      })
      .from(dimEnterpriseTeamMember)
      .innerJoin(
        factCopilotUsageDaily,
        and(
          eq(factCopilotUsageDaily.userId, dimEnterpriseTeamMember.userId),
          gte(factCopilotUsageDaily.day, windowStart),
        ),
      )
      .groupBy(dimEnterpriseTeamMember.teamId);
    const creditMap = new Map<number, number>(
      creditRows.map((r) => [r.teamId, Math.round(Number(r.aiCreditsUsed) * 100) / 100]),
    );

    return NextResponse.json({
      teams: teams.map((t) => ({
        id: t.teamId,
        githubTeamId: t.githubTeamId,
        name: t.teamName,
        slug: t.teamSlug,
        description: t.description,
        memberCount: Number(t.memberCount),
        aiCreditsUsed: creditMap.get(t.teamId) ?? 0,
      })),
    });
  } catch (err) {
    console.error("Failed to fetch enterprise teams:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to fetch enterprise teams") },
      { status: 500 },
    );
  }
}
