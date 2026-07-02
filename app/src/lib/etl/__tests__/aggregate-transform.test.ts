import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseNdjson, flattenAggregateReport } from "@/lib/github/copilot-api";
import {
  transformToFactOrgAggregate,
  transformToFactOrgAdoptionPhase,
  transformToFactOrgPrCommentTypes,
} from "@/lib/etl/transform";
import type { AggregateReportLine } from "@/types/copilot-api";

const read = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** Parse a wrapped aggregate fixture and flatten to per-day enterprise records. */
function loadAgg(name: string) {
  const lines = parseNdjson<AggregateReportLine>(read(name));
  return flattenAggregateReport(lines, "enterprise");
}

describe("aggregate transforms (2026-03-10 fields)", () => {
  const records = loadAgg("enterprise-aggregate-28day.ndjson");
  const day = records.find((r) => r.day === "2026-06-02");

  it("maps the 9 new surface-level active-user variants", () => {
    expect(day).toBeDefined();
    const row = transformToFactOrgAggregate(day!);
    expect(row.scope).toBe("enterprise");
    expect(row.weeklyActiveCloudAgentUsers).toBe(1);
    for (const k of [
      "dailyActiveCloudAgentUsers",
      "weeklyActiveCloudAgentUsers",
      "monthlyActiveCloudAgentUsers",
      "dailyActiveCodeReviewUsers",
      "weeklyActiveCodeReviewUsers",
      "monthlyActiveCodeReviewUsers",
      "dailyPassiveCodeReviewUsers",
      "weeklyPassiveCodeReviewUsers",
      "monthlyPassiveCodeReviewUsers",
    ] as const) {
      expect(typeof row[k]).toBe("number");
    }
  });

  it("expands totals_by_ai_adoption_phase into per-phase rows (avg_* stringified)", () => {
    const rows = transformToFactOrgAdoptionPhase(day!);
    expect(rows.length).toBe(2);
    const p3 = rows.find((r) => r.phaseNumber === 3);
    expect(p3?.phaseLabel).toBe("Phase 3");
    expect(p3?.totalEngagedUsers).toBe(1);
    expect(p3?.avgPullRequestsMerged).toBe("4");
    expect(p3?.avgPullRequestsMedianMinutesToMerge).toBe("1.58");
    expect(p3?.totalPullRequestsMerged).toBeNull();
    expect(p3?.scope).toBe("enterprise");
  });

  it("expands PR copilot suggestions by comment type", () => {
    const rows = transformToFactOrgPrCommentTypes(day!);
    expect(rows.length).toBe(2);
    const bug = rows.find((r) => r.commentType === "bug");
    expect(bug?.totalCopilotSuggestions).toBe(2);
    expect(bug?.totalCopilotAppliedSuggestions).toBe(2);
  });

  it("legacy-minimal aggregate: new fields default safely (backward compatible)", () => {
    const [legacy] = loadAgg("legacy-aggregate-minimal.ndjson");
    const lrow = transformToFactOrgAggregate(legacy);
    expect(lrow.weeklyActiveCloudAgentUsers).toBe(0);
    expect(lrow.monthlyPassiveCodeReviewUsers).toBe(0);
    expect(transformToFactOrgAdoptionPhase(legacy)).toEqual([]);
    expect(transformToFactOrgPrCommentTypes(legacy)).toEqual([]);
  });
});
