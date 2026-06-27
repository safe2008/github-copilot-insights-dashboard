import { db } from "@/lib/db";
import {
  factCopilotUsageDaily,
  factAiCreditUsage,
  factOrgAggregateDaily,
  factOrgAdoptionPhaseDaily,
  factOrgPrCommentTypeDaily,
  factCopilotSeatAssignment,
  factUserLanguageDaily,
  factUserIdeDaily,
  factUserModelDaily,
  dimEnterprise,
  dimOrg,
  dimOrgMember,
  dimUser,
  dimLanguage,
  dimIde,
  dimModel,
  dimEnterpriseTeam,
  dimEnterpriseTeamMember,
  githubAccessCheckSnapshot,
} from "@/lib/db/schema";
import { getGitHubConfig } from "@/lib/db/settings";
import { sql, and, gte, lte, eq, desc, isNotNull, isNull } from "drizzle-orm";
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

function round(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round((numerator / denominator) * 100, 1) : null;
}

function daysInWindow(w: InsightWindow): number {
  const MS = 86_400_000;
  return Math.max(1, Math.round((Date.parse(w.end) - Date.parse(w.start)) / MS) + 1);
}

function trendLabel(changePct: number | null): "up" | "down" | "flat" | "insufficient_data" {
  if (changePct === null) return "insufficient_data";
  if (changePct >= 5) return "up";
  if (changePct <= -5) return "down";
  return "flat";
}

interface EvidenceSignal {
  name: string;
  present: boolean;
}

function dataQuality(args: {
  window: InsightWindow;
  sampleSize: number;
  hasPreviousPeriod?: boolean;
  hasCostData?: boolean;
  hasDeliveryData?: boolean;
  hasTeamData?: boolean;
  evidence?: EvidenceSignal[];
  warnings?: string[];
}) {
  const warnings = [...(args.warnings ?? [])];
  if (args.sampleSize === 0) warnings.push("No users or records were available for this window.");
  if (args.hasPreviousPeriod === false) warnings.push("Previous-period comparison is unavailable or has a zero baseline.");
  if (args.hasCostData === false) warnings.push("AI-credit cost data is missing for this window.");
  if (args.hasDeliveryData === false) warnings.push("Pull-request delivery data is missing for this window.");
  if (args.hasTeamData === false) warnings.push("Enterprise team data is missing or teams have not been synced.");

  const windowDays = daysInWindow(args.window);
  const evidence = [
    ...(args.hasPreviousPeriod !== undefined ? [{ name: "previous_period", present: args.hasPreviousPeriod }] : []),
    ...(args.hasCostData !== undefined ? [{ name: "cost_data", present: args.hasCostData }] : []),
    ...(args.hasDeliveryData !== undefined ? [{ name: "delivery_data", present: args.hasDeliveryData }] : []),
    ...(args.hasTeamData !== undefined ? [{ name: "team_data", present: args.hasTeamData }] : []),
    ...(args.evidence ?? []),
  ];
  const presentEvidence = evidence.filter((item) => item.present).length;

  return {
    windowDays,
    sampleSize: args.sampleSize,
    evidenceCompletenessPct: evidence.length > 0 ? pct(presentEvidence, evidence.length) : null,
    evidenceSignals: evidence,
    dataReadinessRationale: [
      `${args.sampleSize} sample record(s) or user(s) across ${windowDays} day(s).`,
      evidence.length > 0
        ? `${presentEvidence}/${evidence.length} evidence signal(s) were available.`
        : "No report-specific evidence signals were configured for this snapshot.",
      warnings.length > 0
        ? `${warnings.length} data-quality warning(s) detected.`
        : "No major data-quality warnings were detected.",
    ],
    warnings,
  };
}

function spendConcentration(rows: Array<{ netAmount: number }>) {
  const total = rows.reduce((sum, row) => sum + row.netAmount, 0);
  const top1 = rows[0]?.netAmount ?? 0;
  const top3 = rows.slice(0, 3).reduce((sum, row) => sum + row.netAmount, 0);
  return {
    topModelSharePct: pct(top1, total),
    top3ModelSharePct: pct(top3, total),
  };
}

function median(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : round((nums[mid - 1] + nums[mid]) / 2, 2);
}

async function enterpriseContext(w: InsightWindow) {
  const { enterpriseSlug } = await getGitHubConfig();
  const scopedUserConds = [
    eq(dimUser.isCurrent, true),
    ...(w.orgId !== undefined ? [eq(dimUser.orgId, w.orgId)] : []),
  ];

  const [
    enterpriseRows,
    orgBaseRows,
    orgMemberRows,
    dimUserOrgRows,
    orgUsageRows,
    teamRows,
    teamMemberRows,
    licensedRows,
    latestSeatDateRows,
    latestAccessRows,
    featureUsageRows,
    languageRows,
    editorRows,
    modelRows,
  ] = await Promise.all([
    db.select({ enterpriseId: dimEnterprise.enterpriseId, enterpriseSlug: dimEnterprise.enterpriseSlug }).from(dimEnterprise),
    db.select({ orgId: dimOrg.orgId, orgName: dimOrg.orgName, githubOrgId: dimOrg.githubOrgId }).from(dimOrg),
    db
      .select({ orgId: dimOrgMember.orgId, members: sql<number>`COUNT(DISTINCT ${dimOrgMember.userId})::int` })
      .from(dimOrgMember)
      .groupBy(dimOrgMember.orgId),
    db
      .select({ orgId: dimUser.orgId, members: sql<number>`COUNT(DISTINCT ${dimUser.userId})::int` })
      .from(dimUser)
      .where(eq(dimUser.isCurrent, true))
      .groupBy(dimUser.orgId),
    db
      .select({
        orgId: factCopilotUsageDaily.orgId,
        activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})::int`,
        interactions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)::int`,
        aiCreditsUsed: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.aiCreditsUsed}), 0)::float8`,
      })
      .from(factCopilotUsageDaily)
      .where(usageWindow(w))
      .groupBy(factCopilotUsageDaily.orgId),
    db.select({ teamId: dimEnterpriseTeam.teamId, teamName: dimEnterpriseTeam.teamName }).from(dimEnterpriseTeam),
    db.select({ members: sql<number>`COUNT(DISTINCT ${dimEnterpriseTeamMember.userId})::int` }).from(dimEnterpriseTeamMember),
    db
      .select({
        licensedUsers: sql<number>`COUNT(DISTINCT ${dimUser.userId})::int`,
        usersWithAssignedDate: sql<number>`COUNT(DISTINCT ${dimUser.userId}) FILTER (WHERE ${dimUser.licenseAssignedDate} IS NOT NULL)::int`,
      })
      .from(dimUser)
      .where(eq(dimUser.isCurrent, true)),
    enterpriseSlug
      ? db
          .select({ snapshotDate: factCopilotSeatAssignment.snapshotDate })
          .from(factCopilotSeatAssignment)
          .where(eq(factCopilotSeatAssignment.enterpriseSlug, enterpriseSlug))
          .orderBy(desc(factCopilotSeatAssignment.snapshotDate), desc(factCopilotSeatAssignment.capturedAt))
          .limit(1)
      : Promise.resolve([] as Array<{ snapshotDate: string }>),
    db
      .select({
        checkedAt: githubAccessCheckSnapshot.checkedAt,
        tokenValid: githubAccessCheckSnapshot.tokenValid,
        tokenLogin: githubAccessCheckSnapshot.tokenLogin,
        tokenType: githubAccessCheckSnapshot.tokenType,
        representativeOrg: githubAccessCheckSnapshot.representativeOrg,
        representativeTeam: githubAccessCheckSnapshot.representativeTeam,
        scopes: githubAccessCheckSnapshot.scopes,
        checks: githubAccessCheckSnapshot.checks,
      })
      .from(githubAccessCheckSnapshot)
      .orderBy(desc(githubAccessCheckSnapshot.checkedAt))
      .limit(1),
    db
      .select({
        activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})::int`,
        chatUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedChat} = true)::int`,
        cliUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true)::int`,
        agentUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true)::int`,
        codingAgentUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedCopilotCodingAgent} = true)::int`,
        cloudAgentUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedCopilotCloudAgent} = true)::int`,
        codeReviewUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedCodeReviewActive} = true OR ${factCopilotUsageDaily.usedCodeReviewPassive} = true)::int`,
      })
      .from(factCopilotUsageDaily)
      .where(usageWindow(w)),
    db
      .select({
        language: dimLanguage.languageName,
        codeGenerated: sql<number>`COALESCE(SUM(${factUserLanguageDaily.codeGenerationActivityCount}), 0)::int`,
        codeAccepted: sql<number>`COALESCE(SUM(${factUserLanguageDaily.codeAcceptanceActivityCount}), 0)::int`,
      })
      .from(factUserLanguageDaily)
      .innerJoin(dimLanguage, eq(factUserLanguageDaily.languageId, dimLanguage.languageId))
      .innerJoin(dimUser, eq(factUserLanguageDaily.userId, dimUser.userId))
      .where(and(gte(factUserLanguageDaily.day, w.start), lte(factUserLanguageDaily.day, w.end), ...scopedUserConds))
      .groupBy(dimLanguage.languageName)
      .orderBy(sql`SUM(${factUserLanguageDaily.codeGenerationActivityCount}) DESC`)
      .limit(8),
    db
      .select({
        editor: dimIde.ideName,
        interactions: sql<number>`COALESCE(SUM(${factUserIdeDaily.userInitiatedInteractionCount}), 0)::int`,
        codeGenerated: sql<number>`COALESCE(SUM(${factUserIdeDaily.codeGenerationActivityCount}), 0)::int`,
        codeAccepted: sql<number>`COALESCE(SUM(${factUserIdeDaily.codeAcceptanceActivityCount}), 0)::int`,
      })
      .from(factUserIdeDaily)
      .innerJoin(dimIde, eq(factUserIdeDaily.ideId, dimIde.ideId))
      .innerJoin(dimUser, eq(factUserIdeDaily.userId, dimUser.userId))
      .where(and(gte(factUserIdeDaily.day, w.start), lte(factUserIdeDaily.day, w.end), ...scopedUserConds))
      .groupBy(dimIde.ideName)
      .orderBy(sql`SUM(${factUserIdeDaily.userInitiatedInteractionCount}) DESC`)
      .limit(8),
    db
      .select({
        model: dimModel.modelName,
        interactions: sql<number>`COALESCE(SUM(${factUserModelDaily.userInitiatedInteractionCount}), 0)::int`,
        codeGenerated: sql<number>`COALESCE(SUM(${factUserModelDaily.codeGenerationActivityCount}), 0)::int`,
        codeAccepted: sql<number>`COALESCE(SUM(${factUserModelDaily.codeAcceptanceActivityCount}), 0)::int`,
      })
      .from(factUserModelDaily)
      .innerJoin(dimModel, eq(factUserModelDaily.modelId, dimModel.modelId))
      .innerJoin(dimUser, eq(factUserModelDaily.userId, dimUser.userId))
      .where(and(gte(factUserModelDaily.day, w.start), lte(factUserModelDaily.day, w.end), ...scopedUserConds))
      .groupBy(dimModel.modelName)
      .orderBy(sql`SUM(${factUserModelDaily.userInitiatedInteractionCount}) DESC`)
      .limit(8),
  ]);

  const latestSeatDate = latestSeatDateRows[0]?.snapshotDate ?? null;
  const seatRows = latestSeatDate && enterpriseSlug
    ? await db
        .select({
          assigneeLogin: factCopilotSeatAssignment.assigneeLogin,
          planType: factCopilotSeatAssignment.planType,
          assignmentMethod: factCopilotSeatAssignment.assignmentMethod,
          organizationLogin: factCopilotSeatAssignment.organizationLogin,
          assigningTeamSlug: factCopilotSeatAssignment.assigningTeamSlug,
          pendingCancellationDate: factCopilotSeatAssignment.pendingCancellationDate,
          lastActivityAt: factCopilotSeatAssignment.lastActivityAt,
          lastAuthenticatedAt: factCopilotSeatAssignment.lastAuthenticatedAt,
          lastActivityEditor: factCopilotSeatAssignment.lastActivityEditor,
        })
        .from(factCopilotSeatAssignment)
        .where(
          and(
            eq(factCopilotSeatAssignment.enterpriseSlug, enterpriseSlug),
            eq(factCopilotSeatAssignment.snapshotDate, latestSeatDate),
          ),
        )
    : [];

  const orgMemberMap = new Map(orgMemberRows.map((row) => [row.orgId, Number(row.members)]));
  const dimUserOrgMap = new Map(dimUserOrgRows.map((row) => [row.orgId, Number(row.members)]));
  const orgUsageMap = new Map(orgUsageRows.map((row) => [row.orgId, row]));
  const orgScorecards = orgBaseRows
    .map((org) => {
      const memberCount = orgMemberMap.get(org.orgId) ?? dimUserOrgMap.get(org.orgId) ?? 0;
      const usage = orgUsageMap.get(org.orgId);
      const activeUsers = Number(usage?.activeUsers ?? 0);
      const interactions = Number(usage?.interactions ?? 0);
      const aiCreditsUsed = round(Number(usage?.aiCreditsUsed ?? 0), 2);
      return {
        orgId: org.orgId,
        orgName: org.orgName,
        githubOrgId: org.githubOrgId,
        memberCount,
        memberSource: orgMemberMap.has(org.orgId) ? "dim_org_member" : "dim_user_current",
        activeUsers,
        activeSharePct: pct(activeUsers, memberCount),
        interactions,
        interactionsPerActiveUser: activeUsers > 0 ? round(interactions / activeUsers, 1) : null,
        aiCreditsUsed,
        aiCreditsPerActiveUser: activeUsers > 0 ? round(aiCreditsUsed / activeUsers, 2) : null,
      };
    })
    .sort((a, b) => b.activeUsers - a.activeUsers)
    .slice(0, 12);

  const licensedUsers = Number(licensedRows[0]?.licensedUsers ?? 0);
  const usersWithAssignedDate = Number(licensedRows[0]?.usersWithAssignedDate ?? 0);
  const activeUsers = orgScorecards.reduce((sum, org) => sum + org.activeUsers, 0);
  const teamCount = teamRows.length;
  const teamMembers = Number(teamMemberRows[0]?.members ?? 0);
  const uniqueSeatAssignees = new Set(seatRows.map((row) => row.assigneeLogin));
  const now = Date.now();
  const inactiveSeatAssignees = new Set(
    seatRows
      .filter((row) => !row.lastActivityAt || now - new Date(row.lastActivityAt).getTime() > 30 * 86_400_000)
      .map((row) => row.assigneeLogin),
  );
  const neverActiveSeatAssignees = new Set(seatRows.filter((row) => !row.lastActivityAt).map((row) => row.assigneeLogin));
  const neverAuthenticatedSeatAssignees = new Set(
    seatRows.filter((row) => !row.lastAuthenticatedAt).map((row) => row.assigneeLogin),
  );
  const planCounts = seatRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.planType] = (acc[row.planType] ?? 0) + 1;
    return acc;
  }, {});
  const assignmentMethodCounts = seatRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.assignmentMethod] = (acc[row.assignmentMethod] ?? 0) + 1;
    return acc;
  }, {});
  const latestAccess = latestAccessRows[0] ?? null;
  const latestChecks = Array.isArray(latestAccess?.checks)
    ? (latestAccess.checks as Array<{ label?: string; status?: string; detail?: string }>)
    : [];
  const failedAccessChecks = latestChecks
    .filter((check) => check.status && check.status !== "ok")
    .map((check) => ({ label: check.label ?? "unknown", status: check.status ?? "unknown", detail: check.detail ?? "" }))
    .slice(0, 8);
  const featureUsage = featureUsageRows[0];
  const featureActiveUsers = Number(featureUsage?.activeUsers ?? 0);

  return {
    enterprise: {
      configuredSlug: enterpriseSlug,
      storedEnterprises: enterpriseRows.map((e) => ({
        enterpriseId: e.enterpriseId,
        enterpriseSlug: e.enterpriseSlug,
      })),
    },
    topology: {
      orgsAnalyzed: orgBaseRows.length,
      teamsSynced: teamCount,
      enterpriseTeamMembersSynced: teamMembers,
      licensedUsers,
      activeUsers,
      overallUtilizationPct: pct(activeUsers, licensedUsers),
    },
    orgScorecards,
    seatAssignmentSignals: {
      source: latestSeatDate
        ? "Persisted fact_copilot_seat_assignment snapshot from the live GitHub Copilot seats API."
        : "Fallback to dim_user + usage facts because no persisted seat assignment snapshot exists yet.",
      latestSnapshotDate: latestSeatDate,
      totalAssignments: seatRows.length,
      uniqueAssignees: uniqueSeatAssignees.size,
      licensedUsers,
      activeUsers: latestSeatDate ? uniqueSeatAssignees.size - inactiveSeatAssignees.size : activeUsers,
      idleSeatsApprox: latestSeatDate ? inactiveSeatAssignees.size : Math.max(0, licensedUsers - activeUsers),
      neverActiveSeats: latestSeatDate ? neverActiveSeatAssignees.size : null,
      neverAuthenticatedSeats: latestSeatDate ? neverAuthenticatedSeatAssignees.size : null,
      idleSeatRatePct: latestSeatDate
        ? pct(inactiveSeatAssignees.size, uniqueSeatAssignees.size)
        : pct(Math.max(0, licensedUsers - activeUsers), licensedUsers),
      pendingCancellationCount: latestSeatDate
        ? seatRows.filter((row) => row.pendingCancellationDate).length
        : null,
      planCounts,
      assignmentMethodCounts,
      assignedViaTeamCount: assignmentMethodCounts.team ?? 0,
      assignedViaOrganizationCount: assignmentMethodCounts.organization ?? 0,
      usersWithLicenseAssignedDate: usersWithAssignedDate,
      licenseAssignedDateCoveragePct: pct(usersWithAssignedDate, licensedUsers),
      assignmentMethodAvailable: Boolean(latestSeatDate),
      pendingCancellationAvailable: Boolean(latestSeatDate),
      planTypeAvailable: Boolean(latestSeatDate),
      lastActivityEditorAvailable: Boolean(latestSeatDate),
    },
    accessHealth: latestAccess
      ? {
          checkedAt: latestAccess.checkedAt,
          tokenValid: latestAccess.tokenValid,
          tokenLogin: latestAccess.tokenLogin,
          tokenType: latestAccess.tokenType,
          representativeOrg: latestAccess.representativeOrg,
          representativeTeam: latestAccess.representativeTeam,
          failedChecks: failedAccessChecks,
          failedCheckCount: failedAccessChecks.length,
        }
      : null,
    featureMix: {
      activeUsers: featureActiveUsers,
      userFeatureAdoption: {
        chatUsers: Number(featureUsage?.chatUsers ?? 0),
        chatSharePct: pct(Number(featureUsage?.chatUsers ?? 0), featureActiveUsers),
        cliUsers: Number(featureUsage?.cliUsers ?? 0),
        cliSharePct: pct(Number(featureUsage?.cliUsers ?? 0), featureActiveUsers),
        agentUsers: Number(featureUsage?.agentUsers ?? 0),
        agentSharePct: pct(Number(featureUsage?.agentUsers ?? 0), featureActiveUsers),
        codingAgentUsers: Number(featureUsage?.codingAgentUsers ?? 0),
        cloudAgentUsers: Number(featureUsage?.cloudAgentUsers ?? 0),
        codeReviewUsers: Number(featureUsage?.codeReviewUsers ?? 0),
        codeReviewSharePct: pct(Number(featureUsage?.codeReviewUsers ?? 0), featureActiveUsers),
      },
      topLanguages: languageRows.map((row) => ({
        language: row.language,
        codeGenerated: Number(row.codeGenerated),
        codeAccepted: Number(row.codeAccepted),
        acceptanceRate: Number(row.codeGenerated) > 0 ? round(Number(row.codeAccepted) / Number(row.codeGenerated), 3) : 0,
      })),
      topEditors: editorRows.map((row) => ({
        editor: row.editor,
        interactions: Number(row.interactions),
        codeGenerated: Number(row.codeGenerated),
        codeAccepted: Number(row.codeAccepted),
        acceptanceRate: Number(row.codeGenerated) > 0 ? round(Number(row.codeAccepted) / Number(row.codeGenerated), 3) : 0,
      })),
      topModels: modelRows.map((row) => ({
        model: row.model,
        interactions: Number(row.interactions),
        codeGenerated: Number(row.codeGenerated),
        codeAccepted: Number(row.codeAccepted),
        acceptanceRate: Number(row.codeGenerated) > 0 ? round(Number(row.codeAccepted) / Number(row.codeGenerated), 3) : 0,
      })),
    },
    contextWarnings: [
      ...(orgBaseRows.length === 0 ? ["No organizations are stored in dim_org."] : []),
      ...(teamCount === 0 ? ["Enterprise teams have not been synced into dim_enterprise_team."] : []),
      ...(!latestSeatDate ? ["No persisted Copilot seat assignment snapshot is available yet."] : []),
      ...(!latestAccess ? ["No persisted GitHub access check snapshot is available yet."] : []),
      ...(usersWithAssignedDate < licensedUsers ? ["Some licensed users do not have a license_assigned_date in dim_user."] : []),
    ],
  };
}

function withEnterpriseContext<T extends Record<string, unknown>>(
  snapshot: T,
  context: Record<string, unknown>,
): T & { enterpriseContext: Record<string, unknown> } {
  return { ...snapshot, enterpriseContext: context };
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
  const idleSeats = Math.max(0, licensedUsers - activeUsers);
  const concentration = spendConcentration(spend);
  const utilizationPct = pct(activeUsers, licensedUsers);

  return {
    window: w,
    licensedUsers,
    activeUsers,
    idleSeats,
    utilizationPct,
    idleSeatRatePct: pct(idleSeats, licensedUsers),
    totalNetSpend: Number(totalNetSpend.toFixed(2)),
    netSpendPerActiveUser:
      activeUsers > 0 ? Number((totalNetSpend / activeUsers).toFixed(2)) : null,
    spendConcentration: concentration,
    spendByModel: spend,
    businessSignals: {
      licenseRisk:
        utilizationPct === null ? "unknown" : utilizationPct < 60 ? "high" : utilizationPct < 80 ? "medium" : "low",
      spendConcentrationRisk:
        (concentration.top3ModelSharePct ?? 0) >= 80 ? "high" : (concentration.top3ModelSharePct ?? 0) >= 60 ? "medium" : "low",
      primaryOpportunity:
        idleSeats > 0 ? "reclaim_or_reassign_idle_seats" : "optimize_high_spend_models",
    },
    dataQuality: dataQuality({
      window: w,
      sampleSize: licensedUsers,
      hasCostData: totalNetSpend > 0,
      evidence: [
        { name: "licensed_users", present: licensedUsers > 0 },
        { name: "active_users", present: activeUsers > 0 },
        { name: "idle_seat_signal", present: licensedUsers > 0 },
        { name: "spend_by_model", present: spend.length > 0 },
        { name: "net_spend", present: totalNetSpend > 0 },
      ],
      warnings: licensedUsers === 0 ? ["No current licensed users found in dim_user."] : [],
    }),
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
  const totalClassifiedUsers = latest.length;
  const codeFirstUsers = counts.get(1) ?? 0;
  const agentFirstUsers = counts.get(2) ?? 0;
  const multiAgentUsers = counts.get(3) ?? 0;
  const advancedUsers = agentFirstUsers + multiAgentUsers;
  const earlyOrNoCohortUsers = (counts.get(0) ?? 0) + codeFirstUsers;

  // GitHub-computed per-phase outcomes from the latest matching aggregate day.
  // These measured per-cohort averages cannot be derived from the per-user facts
  // — they use GitHub's own engaged-user denominator.
  const phaseOutcomeConds = [
    gte(factOrgAdoptionPhaseDaily.day, w.start),
    lte(factOrgAdoptionPhaseDaily.day, w.end),
    eq(factOrgAdoptionPhaseDaily.scope, w.orgId !== undefined ? "organization" : "enterprise"),
    w.orgId !== undefined
      ? eq(factOrgAdoptionPhaseDaily.orgId, w.orgId)
      : isNull(factOrgAdoptionPhaseDaily.orgId),
  ];
  const phaseOutcomeRows = await db
    .select({
      day: factOrgAdoptionPhaseDaily.day,
      phaseNumber: factOrgAdoptionPhaseDaily.phaseNumber,
      totalEngagedUsers: factOrgAdoptionPhaseDaily.totalEngagedUsers,
      avgPullRequestsMerged: factOrgAdoptionPhaseDaily.avgPullRequestsMerged,
      avgPullRequestsReviewed: factOrgAdoptionPhaseDaily.avgPullRequestsReviewed,
      avgPullRequestsMedianMinutesToMerge: factOrgAdoptionPhaseDaily.avgPullRequestsMedianMinutesToMerge,
      avgLocAdded: factOrgAdoptionPhaseDaily.avgLocAdded,
      avgCodeAcceptanceActivities: factOrgAdoptionPhaseDaily.avgCodeAcceptanceActivities,
    })
    .from(factOrgAdoptionPhaseDaily)
    .where(and(...phaseOutcomeConds));
  const latestPhaseDay = phaseOutcomeRows.reduce<string | null>(
    (max, r) => (max === null || r.day > max ? r.day : max),
    null,
  );
  const outcomeByPhase = new Map<number, (typeof phaseOutcomeRows)[number]>();
  for (const r of phaseOutcomeRows) {
    if (r.day === latestPhaseDay) outcomeByPhase.set(r.phaseNumber, r);
  }
  const numFrom = (v: string | null): number | null => (v != null ? Number(v) : null);

  const cohortRows = AI_ADOPTION_PHASES.map((p) => {
    const o = outcomeByPhase.get(p);
    return {
      phase: p,
      key: AI_ADOPTION_PHASE_KEYS[p],
      label: AI_ADOPTION_PHASE_LABELS[p],
      users: counts.get(p) ?? 0,
      sharePct: pct(counts.get(p) ?? 0, totalClassifiedUsers),
      outcomes: o
        ? {
            engagedUsers: o.totalEngagedUsers ?? 0,
            avgPrsMerged: numFrom(o.avgPullRequestsMerged),
            avgPrsReviewed: numFrom(o.avgPullRequestsReviewed),
            avgMinutesToMerge: numFrom(o.avgPullRequestsMedianMinutesToMerge),
            avgLocAdded: numFrom(o.avgLocAdded),
            avgAcceptedActivities: numFrom(o.avgCodeAcceptanceActivities),
          }
        : null,
    };
  });
  const dominantCohort = [...cohortRows].sort((a, b) => b.users - a.users)[0] ?? null;

  // Measured productivity uplift: best advanced cohort (multi-agent, else
  // agent-first) vs code-first, in average pull requests merged per engaged user.
  const codeFirstMerged = outcomeByPhase.get(1)?.avgPullRequestsMerged ?? null;
  const advancedMerged =
    outcomeByPhase.get(3)?.avgPullRequestsMerged ?? outcomeByPhase.get(2)?.avgPullRequestsMerged ?? null;
  const prMergedUpliftAdvancedVsCodeFirst =
    codeFirstMerged != null && advancedMerged != null
      ? Number((Number(advancedMerged) - Number(codeFirstMerged)).toFixed(2))
      : null;
  const hasCohortOutcomes = outcomeByPhase.size > 0;

  return {
    window: w,
    totalClassifiedUsers,
    cohorts: cohortRows,
    stageMix: {
      earlyOrNoCohortUsers,
      earlyOrNoCohortSharePct: pct(earlyOrNoCohortUsers, totalClassifiedUsers),
      advancedUsers,
      advancedSharePct: pct(advancedUsers, totalClassifiedUsers),
      agentFirstOrMultiAgentUsers: advancedUsers,
    },
    businessSignals: {
      dominantCohort: dominantCohort
        ? { key: dominantCohort.key, label: dominantCohort.label, users: dominantCohort.users }
        : null,
      maturity:
        totalClassifiedUsers === 0 ? "unknown" : (pct(advancedUsers, totalClassifiedUsers) ?? 0) >= 50 ? "advanced" : (pct(advancedUsers, totalClassifiedUsers) ?? 0) >= 20 ? "developing" : "early",
      primaryEnablementFocus:
        earlyOrNoCohortUsers >= advancedUsers ? "move_code_first_users_to_agent_workflows" : "scale_multi_agent_practices",
      prMergedUpliftAdvancedVsCodeFirst,
      cohortOutcomesAvailable: hasCohortOutcomes,
    },
    dataQuality: dataQuality({
      window: w,
      sampleSize: totalClassifiedUsers,
      evidence: [
        { name: "cohort_classifications", present: totalClassifiedUsers > 0 },
        { name: "cohort_distribution", present: cohortRows.some((row) => row.users > 0) },
        { name: "advanced_adoption_signal", present: advancedUsers > 0 },
        { name: "dominant_cohort", present: Boolean(dominantCohort && dominantCohort.users > 0) },
        { name: "cohort_outcomes", present: hasCohortOutcomes },
      ],
      warnings: totalClassifiedUsers === 0 ? ["No AI adoption phase classifications were found for this window."] : [],
    }),
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
        cloudAgentDaily: factOrgAggregateDaily.dailyActiveCloudAgentUsers,
        cloudAgentMonthly: factOrgAggregateDaily.monthlyActiveCloudAgentUsers,
        codeReviewMonthly: factOrgAggregateDaily.monthlyActiveCodeReviewUsers,
        passiveCodeReviewMonthly: factOrgAggregateDaily.monthlyPassiveCodeReviewUsers,
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
  const activeUsersChangePct = pctChange(usage.activeUsers, prevUsage.activeUsers);
  const interactionsChangePct = pctChange(usage.interactions, prevUsage.interactions);
  const linesOfCodeAddedChangePct = pctChange(usage.linesOfCodeAdded, prevUsage.linesOfCodeAdded);
  const netSpendChangePct = pctChange(netSpend, prevNetSpend);
  const prCreatedChangePct = pctChange(delivery.created, prevDelivery.created);
  const prMergedChangePct = pctChange(delivery.merged, prevDelivery.merged);
  const utilizationPct = pct(usage.activeUsers, licensedUsers);
  const idleSeats = Math.max(0, licensedUsers - usage.activeUsers);
  const cohortBreakdown = AI_ADOPTION_PHASES.map((p) => ({
    phase: p,
    key: AI_ADOPTION_PHASE_KEYS[p],
    label: AI_ADOPTION_PHASE_LABELS[p],
    users: counts.get(p) ?? 0,
    sharePct: pct(counts.get(p) ?? 0, cohortRows.length),
  }));
  const advancedUsers = (counts.get(2) ?? 0) + (counts.get(3) ?? 0);
  const costHasData = netSpend > 0 || topModelsBySpend.length > 0;
  const deliveryHasData = delivery.created > 0 || delivery.merged > 0 || delivery.reviewed > 0;
  const executiveWarnings = [
    ...(prevUsage.activeUsers === 0 ? ["Previous-period active-user baseline is zero, so some trend percentages are unavailable."] : []),
    ...(cohortRows.length === 0 ? ["No AI adoption cohort rows were available for this window."] : []),
  ];

  return {
    window: w,
    previousWindow: prev,
    engagement: {
      latestDailyActiveUsers: dau,
      latestWeeklyActiveUsers: agg?.wau ?? null,
      latestMonthlyActiveUsers: mau,
      stickinessDauOverMau:
        dau != null && mau ? Number((Number(dau) / Number(mau)).toFixed(2)) : null,
      surfaceEngagement: {
        cloudAgentDailyActiveUsers: agg?.cloudAgentDaily ?? null,
        cloudAgentMonthlyActiveUsers: agg?.cloudAgentMonthly ?? null,
        cloudAgentStickiness:
          agg?.cloudAgentDaily != null && agg?.cloudAgentMonthly
            ? Number((Number(agg.cloudAgentDaily) / Number(agg.cloudAgentMonthly)).toFixed(2))
            : null,
        codeReviewActiveMonthlyUsers: agg?.codeReviewMonthly ?? null,
        codeReviewPassiveMonthlyUsers: agg?.passiveCodeReviewMonthly ?? null,
      },
    },
    activity: {
      activeUsers: usage.activeUsers,
      activeUsersPrev: prevUsage.activeUsers,
      activeUsersChangePct,
      interactions: usage.interactions,
      interactionsPrev: prevUsage.interactions,
      interactionsChangePct,
      codeGenerated: usage.codeGenerated,
      codeAccepted: usage.codeAccepted,
      acceptanceRate: usage.acceptanceRate,
      acceptanceRatePrev: prevUsage.acceptanceRate,
      acceptanceRatePointDelta: Number(
        ((usage.acceptanceRate - prevUsage.acceptanceRate) * 100).toFixed(1),
      ),
      linesOfCodeAdded: usage.linesOfCodeAdded,
      linesOfCodeAddedPrev: prevUsage.linesOfCodeAdded,
      linesOfCodeAddedChangePct,
    },
    licensing: {
      licensedUsers,
      activeUsers: usage.activeUsers,
      idleSeats,
      utilizationPct,
    },
    cost: {
      netSpend: Number(netSpend.toFixed(2)),
      netSpendPrev: Number(prevNetSpend.toFixed(2)),
      netSpendChangePct,
      spendPerActiveUser:
        usage.activeUsers > 0 ? Number((netSpend / usage.activeUsers).toFixed(2)) : null,
      topModelsBySpend,
    },
    delivery: {
      prCreated: delivery.created,
      prCreatedChangePct,
      prMerged: delivery.merged,
      prMergedChangePct,
      prReviewed: delivery.reviewed,
      copilotAuthoredPrs: delivery.copilotAuthored,
      copilotAuthoredSharePct: pct(delivery.copilotAuthored, delivery.created),
      copilotReviewedPrs: delivery.copilotReviewed,
      copilotReviewedSharePct: pct(delivery.copilotReviewed, delivery.reviewed),
      copilotAppliedSuggestions: delivery.appliedSuggestions,
      avgMedianMinutesToMerge: delivery.avgMedianMinutesToMerge,
    },
    adoption: {
      totalClassifiedUsers: cohortRows.length,
      cohorts: cohortBreakdown,
      advancedUsers,
      advancedSharePct: pct(advancedUsers, cohortRows.length),
    },
    weeklyTrend: weeklyRows.map((r) => ({
      week: r.week,
      activeUsers: Number(r.activeUsers),
      interactions: Number(r.interactions),
    })),
    businessSignals: {
      activityTrend: trendLabel(activeUsersChangePct),
      productivityTrend: trendLabel(linesOfCodeAddedChangePct),
      spendTrend: trendLabel(netSpendChangePct),
      deliveryTrend: trendLabel(prMergedChangePct),
      adoptionMaturity:
        cohortRows.length === 0 ? "unknown" : (pct(advancedUsers, cohortRows.length) ?? 0) >= 50 ? "advanced" : (pct(advancedUsers, cohortRows.length) ?? 0) >= 20 ? "developing" : "early",
      topRisk:
        idleSeats > usage.activeUsers ? "license_underutilization" : !deliveryHasData ? "missing_delivery_data" : netSpendChangePct !== null && netSpendChangePct > 25 ? "rapid_spend_growth" : "none_obvious",
      recommendedExecutiveDecision:
        idleSeats > 0 ? "reassign_or_reclaim_idle_seats_before_expanding" : (pct(advancedUsers, cohortRows.length) ?? 0) < 20 ? "fund_targeted_agent_enablement" : "scale_proven_adoption_patterns",
    },
    dataQuality: dataQuality({
      window: w,
      sampleSize: usage.activeUsers,
      hasPreviousPeriod: prevUsage.activeUsers > 0,
      hasCostData: costHasData,
      hasDeliveryData: deliveryHasData,
      evidence: [
        { name: "engagement_snapshot", present: dau != null || mau != null },
        { name: "activity_totals", present: usage.activeUsers > 0 || usage.interactions > 0 },
        { name: "license_totals", present: licensedUsers > 0 },
        { name: "adoption_cohorts", present: cohortRows.length > 0 },
        { name: "weekly_trend", present: weeklyRows.length > 1 },
      ],
      warnings: executiveWarnings,
    }),
  };
}

async function deliverySnapshot(w: InsightWindow) {
  const prev = previousWindow(w);
  const [rows, prevDelivery, commentTypeRows] = await Promise.all([
    db
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
      ),
    deliveryTotals(prev),
    db
      .select({
        commentType: factOrgPrCommentTypeDaily.commentType,
        suggestions: sql<number>`COALESCE(SUM(${factOrgPrCommentTypeDaily.totalCopilotSuggestions}), 0)`,
        applied: sql<number>`COALESCE(SUM(${factOrgPrCommentTypeDaily.totalCopilotAppliedSuggestions}), 0)`,
      })
      .from(factOrgPrCommentTypeDaily)
      .where(
        and(
          gte(factOrgPrCommentTypeDaily.day, w.start),
          lte(factOrgPrCommentTypeDaily.day, w.end),
          eq(factOrgPrCommentTypeDaily.scope, "enterprise"),
        ),
      )
      .groupBy(factOrgPrCommentTypeDaily.commentType),
  ]);

  // Apply rate by PR suggestion comment type (signal-to-noise of Copilot review).
  const suggestionsByCommentType = commentTypeRows
    .map((c) => {
      const suggestions = Number(c.suggestions);
      const applied = Number(c.applied);
      return { commentType: c.commentType, suggestions, applied, applyRatePct: pct(applied, suggestions) };
    })
    .sort((a, b) => b.suggestions - a.suggestions);

  const r = rows[0];
  const prCreated = Number(r?.created ?? 0);
  const prMerged = Number(r?.merged ?? 0);
  const prReviewed = Number(r?.reviewed ?? 0);
  const copilotAuthoredPrs = Number(r?.copilotAuthored ?? 0);
  const copilotReviewedPrs = Number(r?.copilotReviewed ?? 0);
  const copilotSuggestions = Number(r?.suggestions ?? 0);
  const copilotAppliedSuggestions = Number(r?.appliedSuggestions ?? 0);
  const prMergedChangePct = pctChange(prMerged, prevDelivery.merged);
  const deliveryHasData = prCreated > 0 || prMerged > 0 || prReviewed > 0;
  return {
    window: w,
    previousWindow: prev,
    prCreated,
    prCreatedChangePct: pctChange(prCreated, prevDelivery.created),
    prMerged,
    prMergedChangePct,
    prReviewed,
    copilotAuthoredPrs,
    copilotAuthoredSharePct: pct(copilotAuthoredPrs, prCreated),
    copilotReviewedPrs,
    copilotReviewedSharePct: pct(copilotReviewedPrs, prReviewed),
    copilotSuggestions,
    copilotAppliedSuggestions,
    suggestionApplicationRatePct: pct(copilotAppliedSuggestions, copilotSuggestions),
    suggestionsByCommentType,
    avgMedianMinutesToMerge:
      r?.avgMedianMinutesToMerge != null ? Number(Number(r.avgMedianMinutesToMerge).toFixed(1)) : null,
    businessSignals: {
      deliveryTrend: trendLabel(prMergedChangePct),
      copilotContribution:
        (pct(copilotAuthoredPrs + copilotReviewedPrs, prCreated + prReviewed) ?? 0) >= 25 ? "strong" : (pct(copilotAuthoredPrs + copilotReviewedPrs, prCreated + prReviewed) ?? 0) >= 10 ? "mixed" : "weak",
      primaryCaveat: deliveryHasData ? "correlation_not_causation" : "missing_delivery_data",
    },
    dataQuality: dataQuality({
      window: w,
      sampleSize: prCreated + prReviewed,
      hasPreviousPeriod: prevDelivery.created > 0 || prevDelivery.merged > 0,
      hasDeliveryData: deliveryHasData,
      evidence: [
        { name: "pr_created", present: prCreated > 0 },
        { name: "pr_reviewed", present: prReviewed > 0 },
        { name: "copilot_authored_or_reviewed_prs", present: copilotAuthoredPrs > 0 || copilotReviewedPrs > 0 },
        { name: "copilot_suggestions", present: copilotSuggestions > 0 },
        { name: "time_to_merge", present: r?.avgMedianMinutesToMerge != null },
        { name: "comment_type_breakdown", present: suggestionsByCommentType.length > 0 },
      ],
    }),
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
  const assumptions = {
    minutesSavedPerAcceptedSuggestion: 1.5,
    developerHourlyCostUsd: 75,
    monthlyCostPerSeatUsd: 19,
    note: "Editable default assumptions — adjust to your organization's actuals. Any productivity-value or ROI figure derived from these is an estimate, not a measured metric.",
  };
  const estimatedHoursSaved = round((usage.codeAccepted * assumptions.minutesSavedPerAcceptedSuggestion) / 60, 2);
  const estimatedValueUsd = round(estimatedHoursSaved * assumptions.developerHourlyCostUsd, 2);
  const seatCostUsd = round(licensedUsers * assumptions.monthlyCostPerSeatUsd, 2);
  const fullyLoadedCostUsd = round(seatCostUsd + netSpend, 2);
  const netValueUsd = round(estimatedValueUsd - fullyLoadedCostUsd, 2);
  const roiRatio = fullyLoadedCostUsd > 0 ? round(estimatedValueUsd / fullyLoadedCostUsd, 2) : null;
  const breakEvenHours = assumptions.developerHourlyCostUsd > 0
    ? round(fullyLoadedCostUsd / assumptions.developerHourlyCostUsd, 2)
    : null;
  const netSpendChangePct = pctChange(netSpend, prevNetSpend);

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
      projected90DaySpend: Number((avgDailyNetSpend * 90).toFixed(2)),
      projectedAnnualSpend: Number((avgDailyNetSpend * 365).toFixed(2)),
      weeklyNetSpend: weeklySpendRows.map((r) => ({
        week: r.week,
        netSpend: Number(Number(r.net).toFixed(2)),
      })),
    },
    assumptions,
    computedEstimates: {
      estimatedHoursSaved,
      estimatedValueUsd,
      seatCostUsd,
      aiCreditNetSpendUsd: Number(netSpend.toFixed(2)),
      fullyLoadedCostUsd,
      netValueUsd,
      roiRatio,
      breakEvenHours,
      idleSeatCostUsd: round(Math.max(0, licensedUsers - usage.activeUsers) * assumptions.monthlyCostPerSeatUsd, 2),
    },
    businessSignals: {
      roiJudgment:
        roiRatio === null ? "insufficient_cost_data" : roiRatio >= 2 ? "strong" : roiRatio >= 1 ? "positive_but_watch_cost" : "negative_or_unproven",
      spendTrend: trendLabel(netSpendChangePct),
      forecastRisk:
        netSpendChangePct !== null && netSpendChangePct > 25 ? "high" : netSpendChangePct !== null && netSpendChangePct > 10 ? "medium" : "low",
      primaryAction:
        Math.max(0, licensedUsers - usage.activeUsers) > 0 ? "reduce_idle_seat_cost" : "watch_ai_credit_run_rate",
    },
    dataQuality: dataQuality({
      window: w,
      sampleSize: usage.activeUsers,
      hasPreviousPeriod: prevUsage.activeUsers > 0 || prevNetSpend > 0,
      hasCostData: netSpend > 0 || licensedUsers > 0,
      hasDeliveryData: delivery.created > 0 || delivery.reviewed > 0,
      evidence: [
        { name: "accepted_code_activity", present: usage.codeAccepted > 0 },
        { name: "license_cost_basis", present: licensedUsers > 0 },
        { name: "ai_credit_spend", present: netSpend > 0 },
        { name: "weekly_spend_series", present: weeklySpendRows.length > 1 },
        { name: "delivery_supporting_signal", present: delivery.copilotAuthored > 0 || delivery.copilotReviewed > 0 },
      ],
      warnings: usage.codeAccepted === 0 ? ["No accepted-code activity was found, so productivity-value estimates may be zero."] : [],
    }),
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

  const baseTeams = teamRows
    .map((r) => {
      const rosterSize = rosterMap.get(r.teamId) ?? Number(r.activeMembers);
      const activeMembers = Number(r.activeMembers);
      const codeGenerated = Number(r.codeGenerated);
      const codeAccepted = Number(r.codeAccepted);
      const creditsUsed = Number(Number(r.creditsUsed).toFixed(2));
      const interactions = Number(r.interactions);
      return {
        team: r.teamName,
        rosterSize,
        activeMembers,
        utilizationPct:
          rosterSize > 0 ? Number(((activeMembers / rosterSize) * 100).toFixed(1)) : null,
        agentAdopters: Number(r.agentAdopters),
        agentAdoptionSharePct: pct(Number(r.agentAdopters), activeMembers),
        creditsUsed,
        creditsPerActiveMember: activeMembers > 0 ? round(creditsUsed / activeMembers, 2) : null,
        creditsPerInteraction: interactions > 0 ? round(creditsUsed / interactions, 4) : null,
        interactions,
        acceptanceRate: codeGenerated > 0 ? Number((codeAccepted / codeGenerated).toFixed(3)) : 0,
      };
    });

  const medianUtilizationPct = median(baseTeams.map((t) => t.utilizationPct));
  const medianAcceptanceRate = median(baseTeams.map((t) => t.acceptanceRate));
  const medianCreditsPerActiveMember = median(baseTeams.map((t) => t.creditsPerActiveMember));
  const teams = baseTeams
    .map((team) => {
      const utilization = team.utilizationPct ?? 0;
      const acceptance = team.acceptanceRate;
      const creditsPerMember = team.creditsPerActiveMember ?? 0;
      const highUtilization = medianUtilizationPct !== null && utilization >= medianUtilizationPct;
      const highAcceptance = medianAcceptanceRate !== null && acceptance >= medianAcceptanceRate;
      const highCost = medianCreditsPerActiveMember !== null && creditsPerMember > medianCreditsPerActiveMember * 1.5;
      return {
        ...team,
        segment:
          highUtilization && highAcceptance && !highCost
            ? "leader"
            : highCost && !highAcceptance
              ? "cost_watch"
              : utilization < 40
                ? "underutilized"
                : "enablement_candidate",
        benchmark: {
          utilizationVsMedianPct:
            medianUtilizationPct !== null && team.utilizationPct !== null
              ? round(team.utilizationPct - medianUtilizationPct, 1)
              : null,
          acceptanceVsMedianPoints:
            medianAcceptanceRate !== null ? round((team.acceptanceRate - medianAcceptanceRate) * 100, 1) : null,
          creditsPerActiveMemberVsMedian:
            medianCreditsPerActiveMember !== null && team.creditsPerActiveMember !== null
              ? round(team.creditsPerActiveMember - medianCreditsPerActiveMember, 2)
              : null,
        },
      };
    })
    .sort((a, b) => b.creditsUsed - a.creditsUsed)
    .slice(0, 15);

  return {
    window: w,
    teamsAnalyzed: baseTeams.length,
    benchmarks: {
      medianUtilizationPct,
      medianAcceptanceRate,
      medianCreditsPerActiveMember,
    },
    teams,
    businessSignals: {
      leaders: teams.filter((t) => t.segment === "leader").slice(0, 3).map((t) => t.team),
      costWatchTeams: teams.filter((t) => t.segment === "cost_watch").slice(0, 3).map((t) => t.team),
      underutilizedTeams: teams.filter((t) => t.segment === "underutilized").slice(0, 3).map((t) => t.team),
    },
    dataQuality: dataQuality({
      window: w,
      sampleSize: baseTeams.length,
      hasTeamData: rosterRows.length > 0,
      hasCostData: baseTeams.some((t) => t.creditsUsed > 0),
      evidence: [
        { name: "team_rosters", present: rosterRows.length > 0 },
        { name: "team_activity", present: baseTeams.some((t) => t.activeMembers > 0) },
        { name: "team_acceptance", present: baseTeams.some((t) => t.acceptanceRate > 0) },
        { name: "team_ai_credit_usage", present: baseTeams.some((t) => t.creditsUsed > 0) },
        { name: "benchmark_medians", present: medianUtilizationPct !== null && medianAcceptanceRate !== null },
      ],
      warnings: rosterRows.length === 0 ? ["Enterprise team rosters have not been synced."] : [],
    }),
  };
}

/** Compute the grounded metric snapshot for a given insight kind. */
export async function getMetricSnapshot(kind: MetricKind, w: InsightWindow) {
  const context = await enterpriseContext(w);
  let snapshot: Record<string, unknown>;
  switch (kind) {
    case "cost_license":
      snapshot = await costLicenseSnapshot(w);
      break;
    case "adoption":
      snapshot = await adoptionSnapshot(w);
      break;
    case "executive":
      snapshot = await executiveSnapshot(w);
      break;
    case "delivery":
      snapshot = await deliverySnapshot(w);
      break;
    case "roi_forecast":
      snapshot = await roiForecastSnapshot(w);
      break;
    case "team_scorecards":
      snapshot = await teamScorecardsSnapshot(w);
      break;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown metric kind: ${String(_exhaustive)}`);
    }
  }
  return withEnterpriseContext(snapshot, context);
}
