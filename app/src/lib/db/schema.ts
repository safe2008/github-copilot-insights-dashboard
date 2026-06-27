import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  date,
  timestamp,
  text,
  numeric,
  jsonb,
  bigserial,
  smallint,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Dimension Tables ──

export const dimDate = pgTable("dim_date", {
  dateKey: date("date_key").primaryKey(),
  year: smallint("year").notNull(),
  quarter: smallint("quarter").notNull(),
  month: smallint("month").notNull(),
  weekOfYear: smallint("week_of_year").notNull(),
  dayOfWeek: smallint("day_of_week").notNull(),
  dayOfMonth: smallint("day_of_month").notNull(),
  isWeekend: boolean("is_weekend").notNull(),
  monthName: varchar("month_name", { length: 10 }).notNull(),
  dayName: varchar("day_name", { length: 10 }).notNull(),
});

export const dimEnterprise = pgTable("dim_enterprise", {
  enterpriseId: integer("enterprise_id").primaryKey(),
  enterpriseSlug: varchar("enterprise_slug", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimOrg = pgTable("dim_org", {
  orgId: serial("org_id").primaryKey(),
  orgName: varchar("org_name", { length: 255 }).notNull().unique(),
  githubOrgId: integer("github_org_id"),
  enterpriseId: integer("enterprise_id").references(() => dimEnterprise.enterpriseId),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimEnterpriseTeam = pgTable(
  "dim_enterprise_team",
  {
    teamId: serial("team_id").primaryKey(),
    githubTeamId: integer("github_team_id").notNull(),
    teamName: varchar("team_name", { length: 255 }).notNull(),
    teamSlug: varchar("team_slug", { length: 255 }).notNull(),
    description: text("description"),
    enterpriseId: integer("enterprise_id").references(() => dimEnterprise.enterpriseId),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_dim_ent_team_github_id").on(table.githubTeamId),
    index("idx_dim_ent_team_slug").on(table.teamSlug),
  ]
);

export const dimEnterpriseTeamMember = pgTable(
  "dim_enterprise_team_member",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => dimEnterpriseTeam.teamId),
    userId: integer("user_id").notNull(),
    userLogin: varchar("user_login", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).default("member").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_dim_ent_team_member_unique").on(table.teamId, table.userId),
    index("idx_dim_ent_team_member_user").on(table.userId),
  ]
);

export const dimUser = pgTable(
  "dim_user",
  {
    userKey: serial("user_key").primaryKey(),
    userId: integer("user_id").notNull(),
    userLogin: varchar("user_login", { length: 255 }).notNull(),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    teamName: varchar("team_name", { length: 255 }),
    effectiveFrom: date("effective_from").defaultNow().notNull(),
    effectiveTo: date("effective_to").default("9999-12-31"),
    isCurrent: boolean("is_current").default(true).notNull(),
    licenseAssignedDate: date("license_assigned_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_dim_user_user_id").on(table.userId),
    index("idx_dim_user_is_current").on(table.isCurrent),
    index("idx_dim_user_org_id").on(table.orgId),
  ]
);

export const dimOrgMember = pgTable(
  "dim_org_member",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => dimOrg.orgId),
    orgLogin: varchar("org_login", { length: 255 }).notNull(),
    githubOrgId: integer("github_org_id"),
    userId: integer("user_id").notNull(),
    userLogin: varchar("user_login", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    memberType: varchar("member_type", { length: 50 }).default("User").notNull(),
    siteAdmin: boolean("site_admin").default(false).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_dim_org_member_unique").on(table.orgId, table.userId),
    index("idx_dim_org_member_org").on(table.orgId),
    index("idx_dim_org_member_user").on(table.userId),
  ]
);

export const dimIde = pgTable("dim_ide", {
  ideId: serial("ide_id").primaryKey(),
  ideName: varchar("ide_name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimFeature = pgTable("dim_feature", {
  featureId: serial("feature_id").primaryKey(),
  featureName: varchar("feature_name", { length: 255 }).notNull().unique(),
  featureCategory: varchar("feature_category", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimLanguage = pgTable("dim_language", {
  languageId: serial("language_id").primaryKey(),
  languageName: varchar("language_name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimModel = pgTable("dim_model", {
  modelId: serial("model_id").primaryKey(),
  modelName: varchar("model_name", { length: 255 }).notNull().unique(),
  isPremium: boolean("is_premium").default(false).notNull(),
  isEnabled: boolean("is_enabled"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Fact Tables ──

export const rawCopilotUsage = pgTable(
  "raw_copilot_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    reportDate: date("report_date").notNull(),
    enterpriseId: integer("enterprise_id").notNull(),
    userId: integer("user_id").notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    rawJson: jsonb("raw_json").notNull(),
    contentHash: varchar("content_hash", { length: 64 }),
    reportStartDay: date("report_start_day"),
    reportEndDay: date("report_end_day"),
  },
  (table) => [
    uniqueIndex("idx_raw_unique").on(table.reportDate, table.enterpriseId, table.userId),
  ]
);

export const factCopilotUsageDaily = pgTable(
  "fact_copilot_usage_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    enterpriseId: integer("enterprise_id").notNull(),
    userId: integer("user_id").notNull(),
    userLogin: varchar("user_login", { length: 255 }).notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
    usedAgent: boolean("used_agent").default(false).notNull(),
    usedCopilotCodingAgent: boolean("used_copilot_coding_agent").default(false).notNull(),
    usedCopilotCloudAgent: boolean("used_copilot_cloud_agent").default(false).notNull(),
    usedChat: boolean("used_chat").default(false).notNull(),
    usedCli: boolean("used_cli").default(false).notNull(),
    usedCodeReviewActive: boolean("used_code_review_active").default(false).notNull(),
    usedCodeReviewPassive: boolean("used_code_review_passive").default(false).notNull(),
    locSuggestedToAddSum: integer("loc_suggested_to_add_sum").default(0).notNull(),
    locSuggestedToDeleteSum: integer("loc_suggested_to_delete_sum").default(0).notNull(),
    locAddedSum: integer("loc_added_sum").default(0).notNull(),
    locDeletedSum: integer("loc_deleted_sum").default(0).notNull(),
    // AI credits consumed by the user over the report window (Copilot Usage
    // Metrics API, 2026-06-19). A consumption signal, not a billed total.
    aiCreditsUsed: numeric("ai_credits_used").default("0").notNull(),
    // AI adoption phase (cohorts, Copilot Usage Metrics API 2026-05-29).
    // 0 = no cohort, 1 = code-first, 2 = agent-first, 3 = multi-agent.
    aiAdoptionPhase: smallint("ai_adoption_phase"),
    aiAdoptionPhaseVersion: varchar("ai_adoption_phase_version", { length: 10 }),
  },
  (table) => [
    uniqueIndex("idx_fact_usage_unique").on(table.day, table.enterpriseId, table.userId),
    index("idx_fact_usage_day_org").on(table.day, table.orgId),
    index("idx_fact_usage_user_id").on(table.userId),
    index("idx_fact_usage_user_day").on(table.userId, table.day),
    index("idx_fact_usage_enterprise_id").on(table.enterpriseId),
    index("idx_fact_usage_source_team_github_id").on(table.sourceTeamGithubId),
    index("idx_fact_usage_ai_phase").on(table.day, table.aiAdoptionPhase),
  ]
);

// AI Credit usage snapshots (GitHub usage-based billing, effective June 1 2026).
// Sourced live from the /settings/billing/ai_credit/usage endpoints and persisted
// as a per-period snapshot so trailing trends survive the premium_request → ai_credit
// endpoint split (each endpoint only returns its own era of data).
export const factAiCreditUsage = pgTable(
  "fact_ai_credit_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    enterpriseSlug: varchar("enterprise_slug", { length: 255 }).notNull(),
    periodYear: smallint("period_year").notNull(),
    periodMonth: smallint("period_month").notNull(),
    usageDate: date("usage_date"),
    product: varchar("product", { length: 255 }).notNull().default("Copilot"),
    sku: varchar("sku", { length: 255 }).notNull().default(""),
    model: varchar("model", { length: 255 }).notNull().default(""),
    costCenter: varchar("cost_center", { length: 255 }),
    orgName: varchar("org_name", { length: 255 }),
    userLogin: varchar("user_login", { length: 255 }),
    teamName: varchar("team_name", { length: 255 }),
    unitType: varchar("unit_type", { length: 64 }).notNull().default("ai-credits"),
    pricePerUnit: numeric("price_per_unit").notNull().default("0"),
    grossQuantity: numeric("gross_quantity").notNull().default("0"),
    discountQuantity: numeric("discount_quantity").notNull().default("0"),
    netQuantity: numeric("net_quantity").notNull().default("0"),
    grossAmount: numeric("gross_amount").notNull().default("0"),
    discountAmount: numeric("discount_amount").notNull().default("0"),
    netAmount: numeric("net_amount").notNull().default("0"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_fact_ai_credit_period").on(table.enterpriseSlug, table.periodYear, table.periodMonth),
    index("idx_fact_ai_credit_model").on(table.model),
  ]
);

export const factCopilotSeatAssignment = pgTable(
  "fact_copilot_seat_assignment",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    snapshotDate: date("snapshot_date").notNull(),
    enterpriseSlug: varchar("enterprise_slug", { length: 255 }).notNull(),
    assigneeLogin: varchar("assignee_login", { length: 255 }).notNull(),
    assigneeGithubId: integer("assignee_github_id"),
    organizationLogin: varchar("organization_login", { length: 255 }),
    organizationGithubId: integer("organization_github_id"),
    assigningTeamGithubId: integer("assigning_team_github_id"),
    assigningTeamName: varchar("assigning_team_name", { length: 255 }),
    assigningTeamSlug: varchar("assigning_team_slug", { length: 255 }),
    assignmentMethod: varchar("assignment_method", { length: 50 }).notNull(),
    planType: varchar("plan_type", { length: 50 }).notNull().default("unknown"),
    seatCreatedAt: timestamp("seat_created_at", { withTimezone: true }),
    seatUpdatedAt: timestamp("seat_updated_at", { withTimezone: true }),
    pendingCancellationDate: date("pending_cancellation_date"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true }),
    lastActivityEditor: varchar("last_activity_editor", { length: 255 }),
    rawJson: jsonb("raw_json"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_fact_seat_snapshot_date").on(table.snapshotDate),
    index("idx_fact_seat_enterprise_date").on(table.enterpriseSlug, table.snapshotDate),
    index("idx_fact_seat_assignee").on(table.assigneeLogin),
    index("idx_fact_seat_assignment_method").on(table.assignmentMethod),
  ]
);

export const factUserFeatureDaily = pgTable(
  "fact_user_feature_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    featureId: integer("feature_id").notNull().references(() => dimFeature.featureId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
    locSuggestedToAddSum: integer("loc_suggested_to_add_sum").default(0).notNull(),
    locSuggestedToDeleteSum: integer("loc_suggested_to_delete_sum").default(0).notNull(),
    locAddedSum: integer("loc_added_sum").default(0).notNull(),
    locDeletedSum: integer("loc_deleted_sum").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_feature_unique").on(table.day, table.userId, table.featureId),
  ]
);

export const factUserIdeDaily = pgTable(
  "fact_user_ide_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    ideId: integer("ide_id").notNull().references(() => dimIde.ideId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
    locSuggestedToAddSum: integer("loc_suggested_to_add_sum").default(0).notNull(),
    locSuggestedToDeleteSum: integer("loc_suggested_to_delete_sum").default(0).notNull(),
    locAddedSum: integer("loc_added_sum").default(0).notNull(),
    locDeletedSum: integer("loc_deleted_sum").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_ide_unique").on(table.day, table.userId, table.ideId),
  ]
);

export const factUserLanguageDaily = pgTable(
  "fact_user_language_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    languageId: integer("language_id").notNull().references(() => dimLanguage.languageId),
    featureId: integer("feature_id").notNull().references(() => dimFeature.featureId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_lang_unique").on(table.day, table.userId, table.languageId, table.featureId),
  ]
);

export const factUserModelDaily = pgTable(
  "fact_user_model_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    modelId: integer("model_id").notNull().references(() => dimModel.modelId),
    featureId: integer("feature_id").notNull().references(() => dimFeature.featureId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_model_unique").on(table.day, table.userId, table.modelId, table.featureId),
  ]
);

export const factUserLanguageModelDaily = pgTable(
  "fact_user_language_model_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    languageId: integer("language_id").notNull().references(() => dimLanguage.languageId),
    modelId: integer("model_id").notNull().references(() => dimModel.modelId),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_lang_model_unique").on(table.day, table.userId, table.languageId, table.modelId),
  ]
);

export const factCliDaily = pgTable(
  "fact_cli_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    sourceTeamGithubId: integer("source_team_github_id"),
    cliVersion: varchar("cli_version", { length: 50 }),
    sessionCount: integer("session_count").default(0).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    promptCount: integer("prompt_count").default(0).notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    completionTokens: integer("completion_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    avgTokensPerRequest: numeric("avg_tokens_per_request"),
  },
  (table) => [
    uniqueIndex("idx_fact_cli_unique").on(table.day, table.userId, table.cliVersion),
  ]
);

// IDE/Plugin version tracking
export const factUserIdeVersionDaily = pgTable(
  "fact_user_ide_version_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    ideId: integer("ide_id").notNull().references(() => dimIde.ideId),
    ideVersion: varchar("ide_version", { length: 100 }),
    pluginName: varchar("plugin_name", { length: 100 }),
    pluginVersion: varchar("plugin_version", { length: 100 }),
    sampledAt: timestamp("sampled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("idx_fact_ide_version_unique").on(table.day, table.userId, table.ideId),
  ]
);

export const factOrgAggregateDaily = pgTable(
  "fact_org_aggregate_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    scope: varchar("scope", { length: 20 }).default("organization").notNull(),
    dailyActiveUsers: integer("daily_active_users").default(0),
    weeklyActiveUsers: integer("weekly_active_users").default(0),
    monthlyActiveUsers: integer("monthly_active_users").default(0),
    monthlyActiveAgentUsers: integer("monthly_active_agent_users").default(0),
    monthlyActiveChatUsers: integer("monthly_active_chat_users").default(0),
    dailyActiveCliUsers: integer("daily_active_cli_users").default(0),
    // Surface-level engaged-user variants (Copilot Usage Metrics API, 2026-03-10):
    // cloud agent + code review (active/passive) across daily/weekly/monthly.
    dailyActiveCloudAgentUsers: integer("daily_active_copilot_cloud_agent_users").default(0),
    weeklyActiveCloudAgentUsers: integer("weekly_active_copilot_cloud_agent_users").default(0),
    monthlyActiveCloudAgentUsers: integer("monthly_active_copilot_cloud_agent_users").default(0),
    dailyActiveCodeReviewUsers: integer("daily_active_copilot_code_review_users").default(0),
    weeklyActiveCodeReviewUsers: integer("weekly_active_copilot_code_review_users").default(0),
    monthlyActiveCodeReviewUsers: integer("monthly_active_copilot_code_review_users").default(0),
    dailyPassiveCodeReviewUsers: integer("daily_passive_copilot_code_review_users").default(0),
    weeklyPassiveCodeReviewUsers: integer("weekly_passive_copilot_code_review_users").default(0),
    monthlyPassiveCodeReviewUsers: integer("monthly_passive_copilot_code_review_users").default(0),
    // Pull Request metrics
    prTotalCreated: integer("pr_total_created").default(0),
    prTotalReviewed: integer("pr_total_reviewed").default(0),
    prTotalMerged: integer("pr_total_merged").default(0),
    prMedianMinutesToMerge: numeric("pr_median_minutes_to_merge"),
    prTotalSuggestions: integer("pr_total_suggestions").default(0),
    prTotalAppliedSuggestions: integer("pr_total_applied_suggestions").default(0),
    prTotalCreatedByCopilot: integer("pr_total_created_by_copilot").default(0),
    prTotalReviewedByCopilot: integer("pr_total_reviewed_by_copilot").default(0),
    prTotalMergedCreatedByCopilot: integer("pr_total_merged_created_by_copilot").default(0),
    prTotalMergedReviewedByCopilot: integer("pr_total_merged_reviewed_by_copilot").default(0),
    prMedianMinutesToMergeCopilotAuthored: numeric("pr_median_minutes_to_merge_copilot_authored"),
    prMedianMinutesToMergeCopilotReviewed: numeric("pr_median_minutes_to_merge_copilot_reviewed"),
    prTotalCopilotSuggestions: integer("pr_total_copilot_suggestions").default(0),
    prTotalCopilotAppliedSuggestions: integer("pr_total_copilot_applied_suggestions").default(0),
  },
  (table) => [
    uniqueIndex("idx_fact_org_agg_unique").on(table.day, table.orgId, table.scope),
    index("idx_fact_org_agg_day").on(table.day),
  ]
);

// Per-phase aggregate cohort outcomes (the `totals_by_ai_adoption_phase` block
// of the enterprise/organization aggregate report, 2026-03-10). One row per
// (day, scope, org, phase). `avg_*` are GitHub-computed per-phase averages over
// the report's engaged users. numeric inserted as String(n); SUM with ::float8.
export const factOrgAdoptionPhaseDaily = pgTable(
  "fact_org_adoption_phase_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    scope: varchar("scope", { length: 20 }).default("organization").notNull(),
    phaseNumber: smallint("phase_number").notNull(),
    phaseLabel: varchar("phase_label", { length: 32 }),
    totalEngagedUsers: integer("total_engaged_users").default(0),
    avgUserInitiatedInteractions: numeric("avg_user_initiated_interactions"),
    avgCodeGenerationActivities: numeric("avg_code_generation_activities"),
    avgCodeAcceptanceActivities: numeric("avg_code_acceptance_activities"),
    avgLocAdded: numeric("avg_loc_added"),
    avgLocDeleted: numeric("avg_loc_deleted"),
    avgPullRequestsCreated: numeric("avg_pull_requests_created"),
    avgPullRequestsMerged: numeric("avg_pull_requests_merged"),
    avgPullRequestsReviewed: numeric("avg_pull_requests_reviewed"),
    avgPullRequestsMedianMinutesToMerge: numeric("avg_pull_requests_median_minutes_to_merge"),
  },
  (table) => [
    uniqueIndex("idx_fact_org_phase_unique").on(table.day, table.orgId, table.scope, table.phaseNumber),
    index("idx_fact_org_phase_day").on(table.day, table.phaseNumber),
  ]
);

// PR Copilot suggestion counts split by comment type
// (`pull_requests.copilot_suggestions_by_comment_type`, 2026-03-10).
export const factOrgPrCommentTypeDaily = pgTable(
  "fact_org_pr_comment_type_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    scope: varchar("scope", { length: 20 }).default("organization").notNull(),
    commentType: varchar("comment_type", { length: 100 }).notNull(),
    totalCopilotSuggestions: integer("total_copilot_suggestions").default(0),
    totalCopilotAppliedSuggestions: integer("total_copilot_applied_suggestions").default(0),
  },
  (table) => [
    uniqueIndex("idx_fact_org_pr_comment_unique").on(table.day, table.orgId, table.scope, table.commentType),
    index("idx_fact_org_pr_comment_day").on(table.day),
  ]
);

export const ingestionLog = pgTable("ingestion_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ingestionDate: date("ingestion_date").notNull(),
  source: varchar("source", { length: 20 }).default("api").notNull(),
  scope: varchar("scope", { length: 30 }).default("enterprise"),
  scopeDetail: varchar("scope_detail", { length: 500 }),
  orgName: varchar("org_name", { length: 255 }),
  orgsDiscovered: integer("orgs_discovered").default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  recordsFetched: integer("records_fetched").default(0),
  recordsInserted: integer("records_inserted").default(0),
  recordsSkipped: integer("records_skipped").default(0),
  aggregateRecords: integer("aggregate_records").default(0),
  errorMessage: text("error_message"),
  apiRequests: integer("api_requests").default(0),
  logMessages: text("log_messages"),
});

export const savedViews = pgTable("saved_views", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  filtersJson: jsonb("filters_json").notNull(),
  dashboardPath: varchar("dashboard_path", { length: 255 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alertRules = pgTable("alert_rules", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  metricName: varchar("metric_name", { length: 255 }).notNull(),
  condition: varchar("condition", { length: 20 }).notNull(),
  threshold: numeric("threshold").notNull(),
  scopeType: varchar("scope_type", { length: 20 }).default("enterprise").notNull(),
  scopeId: integer("scope_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// AI Analyst — cached LLM-generated narratives keyed by insight kind + scope +
// a hash of the grounding data, so repeat views don't re-spend premium requests.
export const aiInsights = pgTable(
  "ai_insights",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: varchar("kind", { length: 50 }).notNull(),
    scopeKey: varchar("scope_key", { length: 255 }).notNull(),
    windowStart: date("window_start"),
    windowEnd: date("window_end"),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    model: varchar("model", { length: 255 }),
    language: varchar("language", { length: 8 }).notNull().default("en"),
    content: text("content").notNull(),
    structured: jsonb("structured"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_ai_insights_unique").on(table.kind, table.scopeKey, table.contentHash),
    index("idx_ai_insights_kind").on(table.kind),
  ]
);

export const githubAccessCheckSnapshot = pgTable(
  "github_access_check_snapshot",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    enterpriseSlug: varchar("enterprise_slug", { length: 255 }),
    tokenLogin: varchar("token_login", { length: 255 }),
    tokenName: varchar("token_name", { length: 255 }),
    tokenType: varchar("token_type", { length: 50 }).notNull().default("unknown"),
    tokenValid: boolean("token_valid").default(false).notNull(),
    representativeOrg: varchar("representative_org", { length: 255 }),
    representativeTeam: varchar("representative_team", { length: 255 }),
    scopes: jsonb("scopes").notNull().default([]),
    orgs: jsonb("orgs").notNull().default([]),
    checks: jsonb("checks").notNull().default([]),
  },
  (table) => [
    index("idx_github_access_checked_at").on(table.checkedAt),
    index("idx_github_access_enterprise").on(table.enterpriseSlug),
  ]
);

// ── Audit Log ──

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    action: varchar("action", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    actor: varchar("actor", { length: 255 }).default("system").notNull(),
    details: jsonb("details"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_log_category").on(table.category),
    index("idx_audit_log_created_at").on(table.createdAt),
  ]
);
