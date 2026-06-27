import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseNdjson, type CopilotSeat } from "@/lib/github/copilot-api";
import type {
  CopilotUsageRecord,
  AggregateReportLine,
  CopilotAggregateRecord,
} from "@/types/copilot-api";

/** Read a fixture file next to this test. */
const read = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("live API fixtures satisfy the 2026-03-10 types", () => {
  it("user records expose ai_adoption_phase.phase_number (new numeric field)", () => {
    const users = parseNdjson<CopilotUsageRecord>(read("enterprise-users-28day.ndjson"));
    expect(users.length).toBe(3);

    const withPhase = users.find(
      (u) => typeof u.ai_adoption_phase === "object" && u.ai_adoption_phase !== null,
    );
    const phase = withPhase?.ai_adoption_phase as
      | { phase?: string; phase_number?: number; version?: string }
      | undefined;
    expect(phase?.phase_number).toBe(3);
    expect(phase?.phase).toBe("Phase 3");
  });

  it("aggregate day_totals carry the new active-user variants, phase, and PR comment-type breakdowns", () => {
    const [line] = parseNdjson<AggregateReportLine>(read("enterprise-aggregate-28day.ndjson"));
    const day = (line.day_totals ?? []).find(
      (d) => (d.totals_by_ai_adoption_phase?.length ?? 0) >= 2,
    ) as CopilotAggregateRecord;
    expect(day).toBeDefined();

    // The 9 new surface-level active-user variants are typed and present.
    expect(typeof day.weekly_active_copilot_cloud_agent_users).toBe("number");
    expect(typeof day.monthly_passive_copilot_code_review_users).toBe("number");

    // totals_by_ai_adoption_phase — per-phase engaged users + average outcomes.
    const phase3 = day.totals_by_ai_adoption_phase?.find((p) => p.phase_number === 3);
    expect(phase3?.total_engaged_users).toBeGreaterThanOrEqual(1);
    expect(typeof phase3?.avg_pull_requests_merged).toBe("number");

    // PR copilot suggestions by comment type.
    const cmt = day.pull_requests?.copilot_suggestions_by_comment_type ?? [];
    expect(cmt.length).toBeGreaterThanOrEqual(1);
    expect(typeof cmt[0].comment_type).toBe("string");
  });

  it("legacy-minimal aggregate parses with none of the new fields (backward compatible)", () => {
    const [line] = parseNdjson<AggregateReportLine>(read("legacy-aggregate-minimal.ndjson"));
    const day = (line.day_totals ?? [])[0] as CopilotAggregateRecord;
    expect(typeof day.daily_active_users).toBe("number");
    expect(day.totals_by_ai_adoption_phase).toBeUndefined();
    expect(day.weekly_active_copilot_cloud_agent_users).toBeUndefined();
  });

  it("seat object carries last_authenticated_at", () => {
    const seat = JSON.parse(read("seat.json")) as CopilotSeat;
    expect(seat.last_authenticated_at).toBe("2026-06-26T16:09:45Z");
    expect(seat.plan_type).toBe("enterprise");
  });
});
