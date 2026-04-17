import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dimEnterpriseTeamMember } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  teamId: z.coerce.number().int().positive(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = paramsSchema.parse(await params);

    const members = await db
      .select({
        userId: dimEnterpriseTeamMember.userId,
        userLogin: dimEnterpriseTeamMember.userLogin,
        role: dimEnterpriseTeamMember.role,
      })
      .from(dimEnterpriseTeamMember)
      .where(eq(dimEnterpriseTeamMember.teamId, teamId))
      .orderBy(dimEnterpriseTeamMember.userLogin);

    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
    }
    console.error("Failed to fetch team members:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to fetch team members") },
      { status: 500 },
    );
  }
}
