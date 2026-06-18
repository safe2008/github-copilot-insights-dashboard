# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

`AGENTS.md` (repo root) is the authoritative reference for setup commands, tech stack, code style, API/database/component conventions, theme, i18n, and security. Read it first — this file only covers what AGENTS.md does not: the big-picture runtime flow that spans multiple files, plus a few command gaps.

All app code lives in `app/`. Run commands from `app/` with `pnpm`. Node 24+, `corepack enable` for pnpm.

## Commands not in AGENTS.md

```bash
cd app
pnpm run test -- src/lib/etl/__tests__/transform.test.ts   # single test file
pnpm run test -- -t "name of test"                         # single test by name
pnpm run lint                                              # eslint only
pnpm run ingest                                            # manual ETL run (tsx src/lib/etl/ingest.ts)
docker compose up -d                                       # local app + Postgres (root docker-compose.yml)
```

Tests run on vitest, `node` environment, no DB — they cover pure functions (transform, NDJSON parse, utils). There are no integration/E2E tests despite `@playwright/test` being installed.

## Runtime architecture (the part that needs multiple files)

**Startup is driven by `app/src/instrumentation.ts`** — Next.js calls `register()` on server boot (nodejs runtime only). It does two things in order:

1. **Auto-migration** via `src/lib/db/migrate.ts`. This is not a plain drizzle-kit migrate: it applies generated migrations *and* runs reconciliation/fixup logic to repair schema drift (introspects live DB, see `schema-introspect.ts` + `migration-status.ts`). So migrations apply automatically on every boot — you rarely run `db:migrate` by hand. After editing `schema.ts`, run `pnpm run db:generate` and commit the generated file in `app/drizzle/`.
2. **Sync scheduler** via `src/lib/etl/scheduler.ts`, gated on the `sync_enabled` / `sync_interval_minutes` settings (stored in DB, read via `src/lib/db/settings.ts`). Config — GitHub token, enterprise slug, interval — lives in the **database**, set through the Settings UI, *not* env vars.

**ETL pipeline** (`src/lib/etl/`): GitHub Copilot Usage Metrics API → `ingest.ts` (pagination, retry, rate limiting via `src/lib/github/`) → `transform.ts` (NDJSON → rows) → upserts into the star schema with `onConflictDoUpdate`. Triggered three ways: scheduler (background), Settings → Data Sync page (SSE-streamed manual run), or `pnpm run ingest`. Seats/AI-credits billing data is fetched live or snapshotted, not part of the usage ETL.

**Data model** (`src/lib/db/schema.ts`, ~10 dims + 9 facts): star schema, `dim_`/`fact_` prefixes, snake_case columns. `dim_user` is SCD Type 2 (`effective_from`/`effective_to`/`is_current`) — queries that join users must respect `is_current`. Team filtering (`src/lib/db/team-filter.ts`) resolves an enterprise team to its member user IDs so any report can filter by team.

**Request path**: dashboard pages are Server Components by default; data flows page → `/api/*` route (Zod-validated query params, `YYYY-MM-DD` dates) → Drizzle query → JSON. Charts are client components using `useChartOptions()` (theme-aware) and `useTranslation()` (i18n). The `EmptyState` component is the standard way to render the not-configured / not-synced / no-data / no-results states — reuse it rather than inventing empty UI.

## Gotchas

- Auth is Keycloak OIDC via Auth.js v5 (`src/auth.ts`). Realm roles map to tiers in `src/lib/authz.ts`: `insights-admin` → admin+dashboard, `insights-viewer` → dashboard only, no role → denied. Enforcement is centralized in `src/proxy.ts` (Next 16 proxy, nodejs runtime); `src/lib/auth-guards.ts` adds in-route `requireAdmin()`/`requireDashboard()` for defense-in-depth. `src/lib/auth.ts` now only holds the `safeErrorMessage`/`adminErrorMessage` helpers (~30 routes import them).
- Operational config is in the DB, not `.env`. Env-driven: `DATABASE_URL` + the Auth.js vars (`AUTH_SECRET`, `AUTH_URL`, `AUTH_KEYCLOAK_ID`, `AUTH_KEYCLOAK_SECRET`, `AUTH_KEYCLOAK_ISSUER`). `docker compose up` starts a local Keycloak (realm imported from `infra/keycloak/realm-export.json`, demo users admin/admin + viewer/viewer); add `127.0.0.1 keycloak` to `/etc/hosts` for the browser. Override `AUTH_KEYCLOAK_ISSUER` for an external Keycloak.
- Docker uses Next.js `standalone` output — the Dockerfile runner stage must copy `.next/standalone`, `.next/static`, `public/`, and `drizzle/` (migrations ship with the image so startup migration works in prod).
- Deploy is Azure via `azd up` / `azd deploy` (Bicep in `infra/`). Secrets live in Key Vault, never in code or params.
