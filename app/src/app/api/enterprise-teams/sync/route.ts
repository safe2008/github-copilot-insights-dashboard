import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dimEnterpriseTeam, dimEnterpriseTeamMember } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getGitHubConfig } from "@/lib/db/settings";
import {
  listEnterpriseTeams,
  listEnterpriseTeamMembers,
} from "@/lib/github/copilot-api";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const config = await getGitHubConfig();
    if (!config.token || !config.enterpriseSlug) {
      return NextResponse.json(
        { error: "GitHub token and enterprise slug must be configured" },
        { status: 400 },
      );
    }

    const { teams } = await listEnterpriseTeams({
      enterpriseSlug: config.enterpriseSlug,
      token: config.token,
    });

    let totalMembers = 0;

    for (const team of teams) {
      // Upsert the team
      const [upserted] = await db
        .insert(dimEnterpriseTeam)
        .values({
          githubTeamId: team.id,
          teamName: team.name,
          teamSlug: team.slug,
          description: team.description ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: dimEnterpriseTeam.githubTeamId,
          set: {
            teamName: team.name,
            teamSlug: team.slug,
            description: team.description ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ teamId: dimEnterpriseTeam.teamId });

      const teamId = upserted.teamId;

      // Fetch members from GitHub
      const { members } = await listEnterpriseTeamMembers({
        enterpriseSlug: config.enterpriseSlug,
        teamSlug: team.slug,
        token: config.token,
      });

      // Full sync: delete existing members, then re-insert
      await db
        .delete(dimEnterpriseTeamMember)
        .where(eq(dimEnterpriseTeamMember.teamId, teamId));

      if (members.length > 0) {
        await db.insert(dimEnterpriseTeamMember).values(
          members.map((m) => ({
            teamId,
            userId: m.id,
            userLogin: m.login,
            role: "member",
          })),
        );
      }

      totalMembers += members.length;
    }

    console.info(
      `Enterprise teams sync complete: ${teams.length} teams, ${totalMembers} members`,
    );

    return NextResponse.json({
      success: true,
      teamsSynced: teams.length,
      totalMembers,
    });
  } catch (err) {
    console.error("Failed to sync enterprise teams:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to sync enterprise teams") },
      { status: 500 },
    );
  }
}
