import { describe, it, expect, afterAll } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { factOrgAdoptionPhaseDaily } from "@/lib/db/schema";
import { getMetricSnapshot } from "@/lib/ai/insight-data";

interface AdoptionSnapshot {
  cohorts: Array<{
    phase: number;
    outcomes: { avgPrsMerged: number | null; engagedUsers: number } | null;
  }>;
  businessSignals: {
    cohortOutcomesAvailable: boolean;
    prMergedUpliftAdvancedVsCodeFirst: number | null;
  };
}

/**
 * Integration test for the AI-Analyst adoption cohort-outcome grounding. Seeds
 * fact_org_adoption_phase_daily for a unique day and asserts the snapshot reads
 * the GitHub-measured per-phase outcomes (not invented by the model). Skipped in
 * the unit suite (no DATABASE_URL).
 */
describe.skipIf(!process.env.DATABASE_URL)("adoptionSnapshot cohort outcomes (integration)", () => {
  const DAY = "2026-05-30"; // unique day to avoid colliding with other int tests

  const clean = () =>
    db
      .delete(factOrgAdoptionPhaseDaily)
      .where(
        and(
          eq(factOrgAdoptionPhaseDaily.day, DAY),
          eq(factOrgAdoptionPhaseDaily.scope, "enterprise"),
          isNull(factOrgAdoptionPhaseDaily.orgId),
        ),
      );

  afterAll(clean);

  it("grounds cohorts[].outcomes + uplift on fact_org_adoption_phase_daily", async () => {
    await clean();
    await db.insert(factOrgAdoptionPhaseDaily).values([
      { day: DAY, orgId: null, scope: "enterprise", phaseNumber: 1, phaseLabel: "Code-first", totalEngagedUsers: 5, avgPullRequestsMerged: "1", avgPullRequestsReviewed: "0", avgPullRequestsMedianMinutesToMerge: "120", avgLocAdded: "50", avgCodeAcceptanceActivities: "10" },
      { day: DAY, orgId: null, scope: "enterprise", phaseNumber: 3, phaseLabel: "Phase 3", totalEngagedUsers: 2, avgPullRequestsMerged: "4", avgPullRequestsReviewed: "3", avgPullRequestsMedianMinutesToMerge: "30", avgLocAdded: "200", avgCodeAcceptanceActivities: "53" },
    ]);

    const snap = (await getMetricSnapshot("adoption", { start: DAY, end: DAY })) as unknown as AdoptionSnapshot;

    const p3 = snap.cohorts.find((c) => c.phase === 3);
    const p1 = snap.cohorts.find((c) => c.phase === 1);
    expect(p3?.outcomes?.avgPrsMerged).toBe(4);
    expect(p3?.outcomes?.engagedUsers).toBe(2);
    expect(p1?.outcomes?.avgPrsMerged).toBe(1);

    // Measured uplift = advanced (phase 3) − code-first (phase 1) avg PRs merged.
    expect(snap.businessSignals.cohortOutcomesAvailable).toBe(true);
    expect(snap.businessSignals.prMergedUpliftAdvancedVsCodeFirst).toBe(3);
  });
});
