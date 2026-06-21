import { db } from "@/lib/db";
import {
  factCopilotUsageDaily,
  factAiCreditUsage,
  factOrgAggregateDaily,
  dimUser,
  dimEnterpriseTeam,
  dimEnterpriseTeamMember,
} from "@/lib/db/schema";
import { sql, and, gte, lte, eq, desc, isNotNull } from "drizzle-orm";
import {
  AI_ADOPTION_PHASES,
  AI_ADOPTION_PHASE_KEYS,
  AI_ADOPTION_PHASE_LABELS,
} from "@/types/copilot-api";

/**
 * Grounded metric snapshots for the AI Analyst. Each returns a small,
 * JSON-serializable object that the LLM narrates over — the model never
 * computes numbers itself. One builder per business-value area:
 *   - cost_license → idle seats + AI-credit spend drivers (value item 1)
 *   - adoption     → AI adoption cohorts (value item 2)
 *   - executive    → headline usage KPIs (value item 3)
 *   - delivery     → PR throughput / Copilot impact (value item 4)
 *   - roi_forecast → ROI estimate + AI-credit spend forecast (value item 5)
 *   - team_scorecards → per-team adoption/cost scorecards (value item 6)
 */
export type MetricKind =
  | "cost_license"
  | "adoption"
  | "executive"
  | "delivery"
  | "roi_forecast"
  | "team_scorecards";

export interface InsightWindow {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  orgId?: number;
}

function usageWindow(w: InsightWindow) {
  const conds = [
    gte(factCopilotUsageDaily.day, w.start),
    lte(factCopilotUsageDaily.day, w.end),
  ];
  if (w.orgId !== undefined) conds.push(eq(factCopilotUsageDaily.orgId, w.orgId));
  return and(...conds);
}

async function costLicenseSnapshot(w: InsightWindow) {
  const [licensed, active, spendByModel] = await Promise.all([
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(dimUser)
      .where(eq(dimUser.isCurrent, true)),
    db
      .select({ userId: factCopilotUsageDaily.userId })
      .from(factCopilotUsageDaily)
      .where(and(usageWindow(w), sql`${factCopilotUsageDaily.userInitiatedInteractionCount} > 0`))
      .groupBy(factCopilotUsageDaily.userId),
    db
      .select({
        model: factAiCreditUsage.model,
        netAmount: sql<number>`COALESCE(SUM(${factAiCreditUsage.netAmount}), 0)`,
      })
      .from(factAiCreditUsage)
      .where(
        and(
          isNotNull(factAiCreditUsage.usageDate),
          gte(factAiCreditUsage.usageDate, w.start),
          lte(factAiCreditUsage.usageDate, w.end),
        ),
      )
      .groupBy(factAiCreditUsage.model)
      .orderBy(sql`SUM(${factAiCreditUsage.netAmount}) DESC`)
      .limit(10),
  ]);

  const licensedUsers = Number(licensed[0]?.n ?? 0);
  const activeUsers = active.length;
  const spend = spendByModel.map((r) => ({ model: r.model, netAmount: Number(r.netAmount) }));
  const totalNetSpend = spend.reduce((s, r) => s + r.netAmount, 0);

  return {
    window: w,
    licensedUsers,
    activeUsers,
    idleSeats: Math.max(0, licensedUsers - activeUsers),
    totalNetSpend: Number(totalNetSpend.toFixed(2)),
    spendByModel: spend,
  };
}

async function adoptionSnapshot(w: InsightWindow) {
  const conds = [
    gte(factCopilotUsageDaily.day, w.start),
    lte(factCopilotUsageDaily.day, w.end),
    isNotNull(factCopilotUsageDaily.aiAdoptionPhase),
  ];
  if (w.orgId !== undefined) conds.push(eq(factCopilotUsageDaily.orgId, w.orgId));

  const latest = await db
    .selectDistinctOn([factCopilotUsageDaily.userId], {
      userId: factCopilotUsageDaily.userId,
      phase: factCopilotUsageDaily.aiAdoptionPhase,
    })
    .from(factCopilotUsageDaily)
    .where(and(...conds))
    .orderBy(factCopilotUsageDaily.userId, desc(factCopilotUsageDaily.day));

  const counts = new Map<number, number>();
  for (const r of latest) {
    const p = Number(r.phase);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  return {
    window: w,
    totalClassifiedUsers: latest.length,
    cohorts: AI_ADOPTION_PHASES.map((p) => ({
      phase: p,
      key: AI_ADOPTION_PHASE_KEYS[p],
      label: AI_ADOPTION_PHASE_LABELS[p],
      users: counts.get(p) ?? 0,
    })),
  };
}

/** Previous equal-length window immediately preceding [start, end]. */
function previousWindow(w: InsightWindow): InsightWindow {
  const MS = 86_400_000;
  const start = new Date(w.start + "T00:00:00Z").getTime();
  const end = new Date(w.end + "T00:00:00Z").getTime();
  const days = Math.round((end - start) / MS) + 1;
  const prevEnd = start - MS;
  const prevStart = prevEnd - (days - 1) * MS;
  const fmt = (ms: number) => new Date(ms).toISOString().split("T")[0];
  return { start: fmt(prevStart), end: fmt(prevEnd), orgId: w.orgId };
}

function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

/** Headline usage totals for a window (reused for current + previous period). */
async function usageTotals(w: InsightWindow) {
  const rows = await db
    .select({
      activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
      interactions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)`,
      codeGenerated: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}), 0)`,
      codeAccepted: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount}), 0)`,
      locAdded: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}), 0)`,
    })
    .from(factCopilotUsageDaily)
    .where(usageWindow(w));
  const u = rows[0];
  const codeGenerated = Number(u?.codeGenerated ?? 0);
  const codeAccepted = Number(u?.codeAccepted ?? 0);
  return {
    activeUsers: Number(u?.activeUsers ?? 0),
    interactions: Number(u?.interactions ?? 0),
    codeGenerated,
    codeAccepted,
    acceptanceRate: codeGenerated > 0 ? Number((codeAccepted / codeGenerated).toFixed(3)) : 0,
    linesOfCodeAdded: Number(u?.locAdded ?? 0),
  };
}

/** Net AI-credit spend for a window. */
async function spendTotal(w: InsightWindow): Promise<number> {
  const rows = await db
    .select({ net: sql<number>`COALESCE(SUM(${factAiCreditUsage.netAmount}), 0)` })
    .from(factAiCreditUsage)
    .where(
      and(
        isNotNull(factAiCreditUsage.usageDate),
        gte(factAiCreditUsage.usageDate, w.start),
        lte(factAiCreditUsage.usageDate, w.end),
      ),
    );
  return Number(rows[0]?.net ?? 0);
}

/** Pull-request delivery totals for a window (enterprise scope). */
async function deliveryTotals(w: InsightWindow) {
  const rows = await db
    .select({
      created: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalCreated}), 0)`,
      merged: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalMerged}), 0)`,
      reviewed: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalReviewed}), 0)`,
      copilotAuthored: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalCreatedByCopilot}), 0)`,
      copilotReviewed: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalReviewedByCopilot}), 0)`,
      appliedSuggestions: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalCopilotAppliedSuggestions}), 0)`,
      avgMedianMinutesToMerge: sql<number>`AVG(${factOrgAggregateDaily.prMedianMinutesToMerge})`,
    })
    .from(factOrgAggregateDaily)
    .where(
      and(
        gte(factOrgAggregateDaily.day, w.start),
        lte(factOrgAggregateDaily.day, w.end),
        eq(factOrgAggregateDaily.scope, "enterprise"),
      ),
    );
  const r = rows[0];
  return {
    created: Number(r?.created ?? 0),
    merged: Number(r?.merged ?? 0),
    reviewed: Number(r?.reviewed ?? 0),
    copilotAuthored: Number(r?.copilotAuthored ?? 0),
    copilotReviewed: Number(r?.copilotReviewed ?? 0),
    appliedSuggestions: Number(r?.appliedSuggestions ?? 0),
    avgMedianMinutesToMerge:
      r?.avgMedianMinutesToMerge != null ? Number(Number(r.avgMedianMinutesToMerge).toFixed(1)) : null,
  };
}

/**
 * Comprehensive, cross-cutting executive context. Unlike the other snapshots
 * this one spans every area — engagement, productivity, cost, delivery and
 * adoption — and includes a previous-period comparison plus an in-window weekly
 * trajectory, so the briefer can connect signals and describe what changed.
 */
async function executiveSnapshot(w: InsightWindow) {
  const prev = previousWindow(w);

  const [
    usage,
    prevUsage,
    engagementRows,
    licensedRows,
    spendRows,
    netSpend,
    prevNetSpend,
    delivery,
    prevDelivery,
    cohortRows,
    weeklyRows,
  ] = await Promise.all([
    usageTotals(w),
    usageTotals(prev),
    db
      .select({
        dau: factOrgAggregateDaily.dailyActiveUsers,
        wau: factOrgAggregateDaily.weeklyActiveUsers,
        mau: factOrgAggregateDaily.monthlyActiveUsers,
      })
      .from(factOrgAggregateDaily)
      .where(and(lte(factOrgAggregateDaily.day, w.end), eq(factOrgAggregateDaily.scope, "enterprise")))
      .orderBy(desc(factOrgAggregateDaily.day))
      .limit(1),
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(dimUser)
      .where(eq(dimUser.isCurrent, true)),
    db
      .select({
        model: factAiCreditUsage.model,
        netAmount: sql<number>`COALESCE(SUM(${factAiCreditUsage.netAmount}), 0)`,
      })
      .from(factAiCreditUsage)
      .where(
        and(
          isNotNull(factAiCreditUsage.usageDate),
          gte(factAiCreditUsage.usageDate, w.start),
          lte(factAiCreditUsage.usageDate, w.end),
        ),
      )
      .groupBy(factAiCreditUsage.model)
      .orderBy(sql`SUM(${factAiCreditUsage.netAmount}) DESC`)
      .limit(5),
    spendTotal(w),
    spendTotal(prev),
    deliveryTotals(w),
    deliveryTotals(prev),
    db
      .selectDistinctOn([factCopilotUsageDaily.userId], {
        userId: factCopilotUsageDaily.userId,
        phase: factCopilotUsageDaily.aiAdoptionPhase,
      })
      .from(factCopilotUsageDaily)
      .where(and(usageWindow(w), isNotNull(factCopilotUsageDaily.aiAdoptionPhase)))
      .orderBy(factCopilotUsageDaily.userId, desc(factCopilotUsageDaily.day)),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${factCopilotUsageDaily.day}::date), 'YYYY-MM-DD')`,
        activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        interactions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)`,
      })
      .from(factCopilotUsageDaily)
      .where(usageWindow(w))
      .groupBy(sql`date_trunc('week', ${factCopilotUsageDaily.day}::date)`)
      .orderBy(sql`date_trunc('week', ${factCopilotUsageDaily.day}::date)`),
  ]);

  const licensedUsers = Number(licensedRows[0]?.n ?? 0);
  const agg = engagementRows[0];
  const dau = agg?.dau ?? null;
  const mau = agg?.mau ?? null;

  const counts = new Map<number, number>();
  for (const r of cohortRows) {
    const p = Number(r.phase);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  const topModelsBySpend = spendRows.map((r) => ({
    model: r.model,
    netAmount: Number(Number(r.netAmount).toFixed(2)),
  }));

  return {
    window: w,
    previousWindow: prev,
    engagement: {
      latestDailyActiveUsers: dau,
      latestWeeklyActiveUsers: agg?.wau ?? null,
      latestMonthlyActiveUsers: mau,
      stickinessDauOverMau:
        dau != null && mau ? Number((Number(dau) / Number(mau)).toFixed(2)) : null,
    },
    activity: {
      activeUsers: usage.activeUsers,
      activeUsersPrev: prevUsage.activeUsers,
      activeUsersChangePct: pctChange(usage.activeUsers, prevUsage.activeUsers),
      interactions: usage.interactions,
      interactionsPrev: prevUsage.interactions,
      interactionsChangePct: pctChange(usage.interactions, prevUsage.interactions),
      codeGenerated: usage.codeGenerated,
      codeAccepted: usage.codeAccepted,
      acceptanceRate: usage.acceptanceRate,
      acceptanceRatePrev: prevUsage.acceptanceRate,
      acceptanceRatePointDelta: Number(
        ((usage.acceptanceRate - prevUsage.acceptanceRate) * 100).toFixed(1),
      ),
      linesOfCodeAdded: usage.linesOfCodeAdded,
      linesOfCodeAddedPrev: prevUsage.linesOfCodeAdded,
      linesOfCodeAddedChangePct: pctChange(usage.linesOfCodeAdded, prevUsage.linesOfCodeAdded),
    },
    licensing: {
      licensedUsers,
      activeUsers: usage.activeUsers,
      idleSeats: Math.max(0, licensedUsers - usage.activeUsers),
      utilizationPct:
        licensedUsers > 0 ? Number(((usage.activeUsers / licensedUsers) * 100).toFixed(1)) : null,
    },
    cost: {
      netSpend: Number(netSpend.toFixed(2)),
      netSpendPrev: Number(prevNetSpend.toFixed(2)),
      netSpendChangePct: pctChange(netSpend, prevNetSpend),
      spendPerActiveUser:
        usage.activeUsers > 0 ? Number((netSpend / usage.activeUsers).toFixed(2)) : null,
      topModelsBySpend,
    },
    delivery: {
      prCreated: delivery.created,
      prCreatedChangePct: pctChange(delivery.created, prevDelivery.created),
      prMerged: delivery.merged,
      prMergedChangePct: pctChange(delivery.merged, prevDelivery.merged),
      prReviewed: delivery.reviewed,
      copilotAuthoredPrs: delivery.copilotAuthored,
      copilotReviewedPrs: delivery.copilotReviewed,
      copilotAppliedSuggestions: delivery.appliedSuggestions,
      avgMedianMinutesToMerge: delivery.avgMedianMinutesToMerge,
    },
    adoption: {
      totalClassifiedUsers: cohortRows.length,
      cohorts: AI_ADOPTION_PHASES.map((p) => ({
        phase: p,
        key: AI_ADOPTION_PHASE_KEYS[p],
        label: AI_ADOPTION_PHASE_LABELS[p],
        users: counts.get(p) ?? 0,
      })),
    },
    weeklyTrend: weeklyRows.map((r) => ({
      week: r.week,
      activeUsers: Number(r.activeUsers),
      interactions: Number(r.interactions),
    })),
  };
}

async function deliverySnapshot(w: InsightWindow) {
  const rows = await db
    .select({
      created: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalCreated}), 0)`,
      merged: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalMerged}), 0)`,
      reviewed: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalReviewed}), 0)`,
      copilotAuthored: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalCreatedByCopilot}), 0)`,
      copilotReviewed: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalReviewedByCopilot}), 0)`,
      suggestions: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalCopilotSuggestions}), 0)`,
      appliedSuggestions: sql<number>`COALESCE(SUM(${factOrgAggregateDaily.prTotalCopilotAppliedSuggestions}), 0)`,
      avgMedianMinutesToMerge: sql<number>`AVG(${factOrgAggregateDaily.prMedianMinutesToMerge})`,
    })
    .from(factOrgAggregateDaily)
    .where(
      and(
        gte(factOrgAggregateDaily.day, w.start),
        lte(factOrgAggregateDaily.day, w.end),
        eq(factOrgAggregateDaily.scope, "enterprise"),
      ),
    );

  const r = rows[0];
  return {
    window: w,
    prCreated: Number(r?.created ?? 0),
    prMerged: Number(r?.merged ?? 0),
    prReviewed: Number(r?.reviewed ?? 0),
    copilotAuthoredPrs: Number(r?.copilotAuthored ?? 0),
    copilotReviewedPrs: Number(r?.copilotReviewed ?? 0),
    copilotSuggestions: Number(r?.suggestions ?? 0),
    copilotAppliedSuggestions: Number(r?.appliedSuggestions ?? 0),
    avgMedianMinutesToMerge:
      r?.avgMedianMinutesToMerge != null ? Number(Number(r.avgMedianMinutesToMerge).toFixed(1)) : null,
  };
}

/**
 * ROI + spend-forecast snapshot. Provides the raw value drivers (accepted
 * suggestions, delivery signals), cost (AI-credit net spend + seats), a spend
 * run-rate with 30-day/annual projections, and a set of clearly-labeled,
 * editable ASSUMPTIONS so the model can compute a transparent return-on-
 * investment estimate without inventing measured numbers.
 */
async function roiForecastSnapshot(w: InsightWindow) {
  const prev = previousWindow(w);
  const MS = 86_400_000;
  const daysInWindow = Math.max(
    1,
    Math.round((Date.parse(w.end) - Date.parse(w.start)) / MS) + 1,
  );

  const [usage, prevUsage, delivery, netSpend, prevNetSpend, licensedRows, weeklySpendRows] =
    await Promise.all([
      usageTotals(w),
      usageTotals(prev),
      deliveryTotals(w),
      spendTotal(w),
      spendTotal(prev),
      db.select({ n: sql<number>`COUNT(*)` }).from(dimUser).where(eq(dimUser.isCurrent, true)),
      db
        .select({
          week: sql<string>`to_char(date_trunc('week', ${factAiCreditUsage.usageDate}::date), 'YYYY-MM-DD')`,
          net: sql<number>`COALESCE(SUM(${factAiCreditUsage.netAmount}), 0)::float8`,
        })
        .from(factAiCreditUsage)
        .where(
          and(
            isNotNull(factAiCreditUsage.usageDate),
            gte(factAiCreditUsage.usageDate, w.start),
            lte(factAiCreditUsage.usageDate, w.end),
          ),
        )
        .groupBy(sql`date_trunc('week', ${factAiCreditUsage.usageDate}::date)`)
        .orderBy(sql`date_trunc('week', ${factAiCreditUsage.usageDate}::date)`),
    ]);

  const licensedUsers = Number(licensedRows[0]?.n ?? 0);
  const avgDailyNetSpend = Number((netSpend / daysInWindow).toFixed(2));

  return {
    window: w,
    daysInWindow,
    value: {
      activeUsers: usage.activeUsers,
      interactions: usage.interactions,
      codeGenerated: usage.codeGenerated,
      codeAccepted: usage.codeAccepted,
      acceptanceRate: usage.acceptanceRate,
      linesOfCodeAdded: usage.linesOfCodeAdded,
      copilotAuthoredPrs: delivery.copilotAuthored,
      copilotReviewedPrs: delivery.copilotReviewed,
      copilotAppliedSuggestions: delivery.appliedSuggestions,
      avgMedianMinutesToMerge: delivery.avgMedianMinutesToMerge,
      activeUsersChangePct: pctChange(usage.activeUsers, prevUsage.activeUsers),
      codeAcceptedChangePct: pctChange(usage.codeAccepted, prevUsage.codeAccepted),
    },
    licensing: {
      licensedUsers,
      activeUsers: usage.activeUsers,
      idleSeats: Math.max(0, licensedUsers - usage.activeUsers),
      utilizationPct:
        licensedUsers > 0 ? Number(((usage.activeUsers / licensedUsers) * 100).toFixed(1)) : null,
    },
    cost: {
      netSpend: Number(netSpend.toFixed(2)),
      netSpendPrev: Number(prevNetSpend.toFixed(2)),
      netSpendChangePct: pctChange(netSpend, prevNetSpend),
      avgDailyNetSpend,
      projected30DaySpend: Number((avgDailyNetSpend * 30).toFixed(2)),
      projectedAnnualSpend: Number((avgDailyNetSpend * 365).toFixed(2)),
      weeklyNetSpend: weeklySpendRows.map((r) => ({
        week: r.week,
        netSpend: Number(Number(r.net).toFixed(2)),
      })),
    },
    assumptions: {
      minutesSavedPerAcceptedSuggestion: 1.5,
      developerHourlyCostUsd: 75,
      monthlyCostPerSeatUsd: 19,
      note: "Editable default assumptions — adjust to your organization's actuals. Any productivity-value or ROI figure derived from these is an estimate, not a measured metric.",
    },
  };
}

/**
 * Per-team scorecards. Attributes activity and AI-credit consumption to each
 * enterprise team via its roster (dim_enterprise_team_member), so leaders can
 * compare adoption, utilization, acceptance and cost across teams and target
 * enablement. Empty when no enterprise teams have been synced.
 */
async function teamScorecardsSnapshot(w: InsightWindow) {
  const rosterRows = await db
    .select({
      teamId: dimEnterpriseTeamMember.teamId,
      rosterSize: sql<number>`COUNT(*)::int`,
    })
    .from(dimEnterpriseTeamMember)
    .groupBy(dimEnterpriseTeamMember.teamId);
  const rosterMap = new Map<number, number>(
    rosterRows.map((r) => [r.teamId, Number(r.rosterSize)]),
  );

  const teamRows = await db
    .select({
      teamId: dimEnterpriseTeam.teamId,
      teamName: dimEnterpriseTeam.teamName,
      activeMembers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})::int`,
      agentAdopters: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent})::int`,
      creditsUsed: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.aiCreditsUsed}), 0)::float8`,
      interactions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)`,
      codeGenerated: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}), 0)`,
      codeAccepted: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount}), 0)`,
    })
    .from(dimEnterpriseTeamMember)
    .innerJoin(
      factCopilotUsageDaily,
      and(
        eq(factCopilotUsageDaily.userId, dimEnterpriseTeamMember.userId),
        gte(factCopilotUsageDaily.day, w.start),
        lte(factCopilotUsageDaily.day, w.end),
      ),
    )
    .innerJoin(dimEnterpriseTeam, eq(dimEnterpriseTeam.teamId, dimEnterpriseTeamMember.teamId))
    .groupBy(dimEnterpriseTeam.teamId, dimEnterpriseTeam.teamName);

  const teams = teamRows
    .map((r) => {
      const rosterSize = rosterMap.get(r.teamId) ?? Number(r.activeMembers);
      const activeMembers = Number(r.activeMembers);
      const codeGenerated = Number(r.codeGenerated);
      const codeAccepted = Number(r.codeAccepted);
      return {
        team: r.teamName,
        rosterSize,
        activeMembers,
        utilizationPct:
          rosterSize > 0 ? Number(((activeMembers / rosterSize) * 100).toFixed(1)) : null,
        agentAdopters: Number(r.agentAdopters),
        creditsUsed: Number(Number(r.creditsUsed).toFixed(2)),
        interactions: Number(r.interactions),
        acceptanceRate: codeGenerated > 0 ? Number((codeAccepted / codeGenerated).toFixed(3)) : 0,
      };
    })
    .sort((a, b) => b.creditsUsed - a.creditsUsed)
    .slice(0, 15);

  return {
    window: w,
    teamsAnalyzed: teams.length,
    teams,
  };
}

/** Compute the grounded metric snapshot for a given insight kind. */
export async function getMetricSnapshot(kind: MetricKind, w: InsightWindow) {
  switch (kind) {
    case "cost_license":
      return costLicenseSnapshot(w);
    case "adoption":
      return adoptionSnapshot(w);
    case "executive":
      return executiveSnapshot(w);
    case "delivery":
      return deliverySnapshot(w);
    case "roi_forecast":
      return roiForecastSnapshot(w);
    case "team_scorecards":
      return teamScorecardsSnapshot(w);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown metric kind: ${String(_exhaustive)}`);
    }
  }
}
