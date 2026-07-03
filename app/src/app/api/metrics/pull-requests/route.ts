import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { factOrgAggregateDaily, factOrgPrCommentTypeDaily, dimOrg } from "@/lib/db/schema";
import { sql, and, gte, lte, eq, inArray, isNull } from "drizzle-orm";
import { daysAgo, isValidDate } from "@/lib/utils";
import { z } from "zod";

const querySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  orgId: z.string().optional(),
});

function parseOrgIds(orgId?: string): number[] {
  return orgId
    ? orgId.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : [];
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params = querySchema.parse({
      days: sp.get("days") ?? undefined,
      start: sp.get("start") ?? undefined,
      end: sp.get("end") ?? undefined,
      orgId: sp.get("orgId") ?? undefined,
    });

    const startDate = params.start ?? daysAgo(params.days ?? 28);
    const endDate = params.end ?? daysAgo(0);
    const orgIds = parseOrgIds(params.orgId);

    const conditions = [
      gte(factOrgAggregateDaily.day, startDate),
      lte(factOrgAggregateDaily.day, endDate),
    ];

    if (orgIds.length === 0) {
      conditions.push(eq(factOrgAggregateDaily.scope, "enterprise"));
      conditions.push(isNull(factOrgAggregateDaily.orgId));
    } else {
      conditions.push(eq(factOrgAggregateDaily.scope, "organization"));
      if (orgIds.length === 1) conditions.push(eq(factOrgAggregateDaily.orgId, orgIds[0]));
      else conditions.push(inArray(factOrgAggregateDaily.orgId, orgIds));
    }

    const orgBreakdownConditions = [
      gte(factOrgAggregateDaily.day, startDate),
      lte(factOrgAggregateDaily.day, endDate),
      eq(factOrgAggregateDaily.scope, "organization"),
    ];
    if (orgIds.length === 1) orgBreakdownConditions.push(eq(factOrgAggregateDaily.orgId, orgIds[0]));
    else if (orgIds.length > 1) orgBreakdownConditions.push(inArray(factOrgAggregateDaily.orgId, orgIds));

    // Daily PR metrics
    const dailyMetrics = await db
      .select({
        day: factOrgAggregateDaily.day,
        orgId: factOrgAggregateDaily.orgId,
        scope: factOrgAggregateDaily.scope,
        dailyActiveUsers: factOrgAggregateDaily.dailyActiveUsers,
        prTotalCreated: factOrgAggregateDaily.prTotalCreated,
        prTotalReviewed: factOrgAggregateDaily.prTotalReviewed,
        prTotalMerged: factOrgAggregateDaily.prTotalMerged,
        prMedianMinutesToMerge: factOrgAggregateDaily.prMedianMinutesToMerge,
        prTotalCreatedByCopilot: factOrgAggregateDaily.prTotalCreatedByCopilot,
        prTotalReviewedByCopilot: factOrgAggregateDaily.prTotalReviewedByCopilot,
        prTotalMergedCreatedByCopilot: factOrgAggregateDaily.prTotalMergedCreatedByCopilot,
        prMedianMinutesToMergeCopilotAuthored: factOrgAggregateDaily.prMedianMinutesToMergeCopilotAuthored,
        prTotalSuggestions: factOrgAggregateDaily.prTotalSuggestions,
        prTotalAppliedSuggestions: factOrgAggregateDaily.prTotalAppliedSuggestions,
        prTotalCopilotSuggestions: factOrgAggregateDaily.prTotalCopilotSuggestions,
        prTotalCopilotAppliedSuggestions: factOrgAggregateDaily.prTotalCopilotAppliedSuggestions,
      })
      .from(factOrgAggregateDaily)
      .where(and(...conditions))
      .orderBy(factOrgAggregateDaily.day);

    // Aggregate totals across the period
    const [totals] = await db
      .select({
        totalCreated: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreated}), 0)`,
        totalReviewed: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalReviewed}), 0)`,
        totalMerged: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMerged}), 0)`,
        totalCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreatedByCopilot}), 0)`,
        totalReviewedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalReviewedByCopilot}), 0)`,
        totalMergedCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMergedCreatedByCopilot}), 0)`,
        totalMergedReviewedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMergedReviewedByCopilot}), 0)`,
        totalSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalSuggestions}), 0)`,
        totalAppliedSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalAppliedSuggestions}), 0)`,
        totalCopilotSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotSuggestions}), 0)`,
        totalCopilotAppliedSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotAppliedSuggestions}), 0)`,
        avgMedianMinutesToMerge: sql<number>`avg(${factOrgAggregateDaily.prMedianMinutesToMerge}::numeric)`,
        avgMedianMinutesToMergeCopilot: sql<number>`avg(${factOrgAggregateDaily.prMedianMinutesToMergeCopilotAuthored}::numeric)`,
        avgMedianMinutesToMergeCopilotReviewed: sql<number>`avg(${factOrgAggregateDaily.prMedianMinutesToMergeCopilotReviewed}::numeric)`,
      })
      .from(factOrgAggregateDaily)
      .where(and(...conditions));

    // Per-org breakdown
    const orgBreakdown = await db
      .select({
        orgId: factOrgAggregateDaily.orgId,
        orgName: dimOrg.orgName,
        totalCreated: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreated}), 0)`,
        totalMerged: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMerged}), 0)`,
        totalCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreatedByCopilot}), 0)`,
        totalMergedCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMergedCreatedByCopilot}), 0)`,
        totalReviewedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalReviewedByCopilot}), 0)`,
        totalCopilotSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotSuggestions}), 0)`,
        totalCopilotAppliedSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotAppliedSuggestions}), 0)`,
      })
      .from(factOrgAggregateDaily)
      .leftJoin(dimOrg, eq(factOrgAggregateDaily.orgId, dimOrg.orgId))
      .where(and(...orgBreakdownConditions))
      .groupBy(factOrgAggregateDaily.orgId, dimOrg.orgName);

    // Copilot PR-review suggestion apply-rate by comment type
    // (pull_requests.copilot_suggestions_by_comment_type, 2026-03-10).
    const commentTypeConditions = [
      gte(factOrgPrCommentTypeDaily.day, startDate),
      lte(factOrgPrCommentTypeDaily.day, endDate),
    ];
    if (orgIds.length === 0) {
      commentTypeConditions.push(eq(factOrgPrCommentTypeDaily.scope, "enterprise"));
      commentTypeConditions.push(isNull(factOrgPrCommentTypeDaily.orgId));
    } else {
      commentTypeConditions.push(eq(factOrgPrCommentTypeDaily.scope, "organization"));
      if (orgIds.length === 1) commentTypeConditions.push(eq(factOrgPrCommentTypeDaily.orgId, orgIds[0]));
      else commentTypeConditions.push(inArray(factOrgPrCommentTypeDaily.orgId, orgIds));
    }

    const commentTypeBreakdown = await db
      .select({
        commentType: factOrgPrCommentTypeDaily.commentType,
        suggestions: sql<number>`coalesce(sum(${factOrgPrCommentTypeDaily.totalCopilotSuggestions}), 0)`,
        applied: sql<number>`coalesce(sum(${factOrgPrCommentTypeDaily.totalCopilotAppliedSuggestions}), 0)`,
      })
      .from(factOrgPrCommentTypeDaily)
      .where(and(...commentTypeConditions))
      .groupBy(factOrgPrCommentTypeDaily.commentType)
      .orderBy(sql`sum(${factOrgPrCommentTypeDaily.totalCopilotSuggestions}) desc`);

    const suggestionsByCommentType = commentTypeBreakdown.map((c) => {
      const suggestions = Number(c.suggestions);
      const applied = Number(c.applied);
      return {
        commentType: c.commentType,
        suggestions,
        applied,
        applyRatePct: suggestions > 0 ? Math.round((applied / suggestions) * 1000) / 10 : 0,
      };
    });

    return NextResponse.json({
      daily: dailyMetrics,
      totals: totals ?? {},
      orgBreakdown,
      suggestionsByCommentType,
    });
  } catch (error) {
    console.error("Failed to fetch PR metrics:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
