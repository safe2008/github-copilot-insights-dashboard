---
description: "Use when implementing the AI Analyst feature: the AI-powered analytics surfaces, GitHub Copilot SDK integration, /api/ai routes, lib/ai client and tools, the ai_insights cache table, and the AI Analyst settings tab. Prescriptive build spec."
applyTo: "app/src/app/api/ai/**/*.ts, app/src/lib/ai/**/*.ts, app/src/app/settings/ai-analyst/**/*.tsx"
---
# AI Analyst — Implementation Instructions

Implement an AI-powered analytics feature ("**AI Analyst**") that uses the **GitHub Copilot
SDK** to generate narratives and recommendations over the existing
star-schema data. Follow these instructions exactly. When a detail is unspecified, prefer the
existing repo conventions in `.github/copilot-instructions.md` and the sibling
`*.instructions.md` files.

## Critical rules (do NOT violate)

1. **SDK:** use `@github/copilot-sdk` only. Do NOT use GitHub Models, `@azure/ai-inference`,
   `openai`, or `@copilot-extensions/preview-sdk`.
2. **Runtime:** every file under `app/src/app/api/ai/**` MUST declare `export const runtime = "nodejs";`.
   Never Edge — the SDK spawns a child process.
3. **In-process, no sidecar:** the SDK spawns the bundled Copilot CLI as a child of the Next.js
   process. Create ONE `CopilotClient` and reuse it. Never spawn a client per request.
4. **Locked-down agent:** create the client with `mode: "empty"`. Every session MUST set an
   explicit `availableTools` allowlist AND an `onPermissionRequest` handler that **rejects**
   everything except our own `custom:*` tools. NEVER use `approveAll` in an API route.
5. **Token handling:** the token is server-side only. NEVER send it to the client, NEVER log it,
   NEVER put it in an error message. Reject classic `ghp_` tokens (unsupported by the SDK).
6. **Grounding:** the model MUST NOT invent numbers. Compute all metrics with Drizzle and pass
   them to the model; the model only narrates/interprets. State this in the agent's prompt.
7. **Default OFF:** the feature is opt-in. `ai_enabled` defaults to `"false"`.
8. **Cost:** each prompt = 1 Copilot premium request. Cache narratives in `ai_insights`; generate
   on sync, not on every page load.
9. **Conventions:** Zod at all boundaries, Drizzle only (no raw SQL), `console.info/warn/error`
   (never `console.log`), all user-visible strings via `t()` with keys added to `en/ar/es/fr`.
10. **Custom agents:** every AI feature is a Copilot SDK **custom agent** defined in
    `lib/ai/agents.ts` (`{ name, displayName, description, prompt }`). Sessions register it with
    `customAgents: [agent]` and select it with `agent: agent.name` — do NOT inline a `systemMessage`.
    One agent per feature: `cost-license-analyst`, `adoption-coach`, `executive-briefer`,
    `delivery-analyst`.

## Settings keys (in `app_settings`, via `@/lib/db/settings`)

| Key | Values | Default | Meaning |
|-----|--------|---------|---------|
| `ai_enabled` | `"true"` / `"false"` | `"false"` | Feature toggle (string-boolean, like `sync_enabled`). |
| `copilot_token` | masked string | — | Fine-grained PAT (`github_pat_`, with the **Copilot Requests** account permission) or `gho_`/`ghu_` token from a **Copilot-licensed** account. Separate from `github_token`. |
| `ai_model` | `"auto"` or model id | `"auto"` | `"auto"` ⇒ omit `model` on `createSession`. |

---

## Step 1 — AI settings helpers

**File:** `app/src/lib/db/ai-settings.ts`

```typescript
import { getSetting, setSetting } from "@/lib/db/settings";

export interface AiConfig {
  enabled: boolean;
  token: string | null;
  model: string; // "auto" or a model id
}

export async function getAiConfig(): Promise<AiConfig> {
  const [enabled, token, model] = await Promise.all([
    getSetting("ai_enabled"),
    getSetting("copilot_token"),
    getSetting("ai_model"),
  ]);
  return {
    enabled: enabled === "true",
    token: token ?? null,
    model: model ?? "auto",
  };
}

/** Returns null if the token is valid-looking, else a user-facing reason string. */
export function validateCopilotToken(token: string): string | null {
  if (!token.trim()) return "Token is required.";
  if (token.startsWith("ghp_")) {
    return "Classic tokens (ghp_) are not supported. Use a fine-grained PAT (github_pat_) from a Copilot-licensed account.";
  }
  return null;
}

export async function setAiConfig(p: Partial<{ enabled: boolean; token: string; model: string }>): Promise<void> {
  if (p.enabled !== undefined) await setSetting("ai_enabled", p.enabled ? "true" : "false");
  if (p.token !== undefined) await setSetting("copilot_token", p.token);
  if (p.model !== undefined) await setSetting("ai_model", p.model);
}
```

**Done when:** `getAiConfig()` returns typed config and `validateCopilotToken` rejects `ghp_`.

---

## Step 2 — In-process Copilot client singleton

**File:** `app/src/lib/ai/copilot-client.ts`

- One lazily-started `CopilotClient`, created with `mode: "empty"`, `gitHubToken` from settings,
  `useLoggedInUser: false`, and a server-side idle timeout.
- Export `resetCopilotClient()` to dispose the client when the token changes (call it from the
  settings save path).

```typescript
import { CopilotClient } from "@github/copilot-sdk";
import { getAiConfig } from "@/lib/db/ai-settings";

let clientPromise: Promise<CopilotClient> | null = null;

export async function getCopilotClient(): Promise<CopilotClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { token } = await getAiConfig();
      if (!token) throw new Error("AI Analyst is not configured");
      const client = new CopilotClient({
        mode: "empty",
        gitHubToken: token,
        useLoggedInUser: false,
        sessionIdleTimeoutSeconds: 900,
      });
      await client.start();
      return client;
    })();
  }
  return clientPromise;
}

export async function resetCopilotClient(): Promise<void> {
  const p = clientPromise;
  clientPromise = null;
  try {
    const client = await p;
    await client?.stop();
  } catch {
    /* ignore */
  }
}
```

**Done when:** importing this module never starts a client at import time (lazy), and changing the
token + calling `resetCopilotClient()` forces a fresh client on next use.

---

## Step 3 — Permission guard

**File:** `app/src/lib/ai/tools.ts`

Insights are grounded by passing the computed metrics inline in the prompt, so sessions register
NO tools (`availableTools: []`). All this file needs is a deny-by-default permission handler that
rejects every operation the model might attempt.

```typescript
import type { PermissionRequest, PermissionRequestResult } from "@github/copilot-sdk";

export const denyAllExceptCustomTools = (req: PermissionRequest): PermissionRequestResult =>
  req.kind === "custom-tool"
    ? { kind: "approve-once" }
    : { kind: "reject", feedback: "Tool use is not permitted." };
```

**Done when:** every session sets `availableTools: []` plus this handler, and it denies
`shell`/`write`/`read`/`url`/`mcp`.

---

## Step 3b — Custom agents (one per AI feature)

**File:** `app/src/lib/ai/agents.ts`

Define a Copilot SDK custom agent for each feature — `{ name, displayName, description, prompt }`.
The `prompt` carries the persona + task + grounding rules (this replaces any inline `systemMessage`).
Export `INSIGHT_AGENTS: Record<MetricKind, CustomAgentDef>` (`cost-license-analyst`, `adoption-coach`,
`executive-briefer`, `delivery-analyst`).

Sessions then register + select the agent:

```typescript
const agent = INSIGHT_AGENTS[kind];
const session = await client.createSession({
  ...(model !== "auto" ? { model } : {}),
  customAgents: [agent],
  agent: agent.name,
  onPermissionRequest: denyAllExceptCustomTools,
});
```

**Done when:** each feature resolves to a named custom agent; no route inlines a `systemMessage`.

---

## Step 4 — `ai_insights` cache table

- Add an `aiInsights` table to `app/src/lib/db/schema.ts` (follow `database.instructions.md`;
  this is an app-support table like `savedViews`/`alertRules`, so a plain `ai_insights` name — no
  `dim_`/`fact_` prefix).
- Columns: `id` (bigserial pk), `report` (varchar), `scopeKey` (varchar — hash of filters/window),
  `contentHash` (varchar 64), `model` (varchar), `content` (text), `createdAt` (timestamptz default now).
- Unique index on `(report, scopeKey, contentHash)`.
- Generate the migration: `cd app && pnpm run db:generate`, then commit the generated SQL in
  `app/drizzle/`. Migrations run automatically on startup — do not hand-edit applied migrations.

**Done when:** `pnpm run db:generate` produces a new migration and `pnpm run build` passes.

---

## Step 5 — AI API routes (Node runtime, Zod, locked-down sessions)

All routes start with `export const runtime = "nodejs";`, validate input with Zod, wrap in
try-catch, and return `{ error: "Internal server error" }` (status 500) on failure. Never leak the
token or stack traces.

### 5a. `app/src/app/api/ai/status/route.ts` (GET)
Returns `{ enabled, configured }` for the UI to decide whether to render panels. `configured` is
`Boolean(token)`. Must NOT return the token.

### 5b. `app/src/app/api/ai/models/route.ts` (GET)
Returns `{ models: ["auto", ...] }` for the settings dropdown. Try `client.listModels()`; on any
error, return a static fallback `["auto", "gpt-5", "gpt-4.1", "claude-sonnet-4.5"]`. Always prepend
`"auto"`.

### 5c. `app/src/app/api/ai/insights/route.ts` (POST)
Generate (or return cached) a narrative for a report + window.

```typescript
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidDate } from "@/lib/utils";
import { getAiConfig } from "@/lib/db/ai-settings";
import { getCopilotClient } from "@/lib/ai/copilot-client";
import { denyAllExceptCustomTools } from "@/lib/ai/tools";
import { INSIGHT_AGENTS } from "@/lib/ai/agents";

const bodySchema = z.object({
  kind: z.enum(["cost_license", "adoption", "executive", "delivery"]),
  start: z.string().refine(isValidDate),
  end: z.string().refine(isValidDate),
});

export async function POST(request: NextRequest) {
  try {
    const { enabled, token, model } = await getAiConfig();
    if (!enabled) return NextResponse.json({ error: "feature-disabled" }, { status: 403 });
    if (!token) return NextResponse.json({ error: "not-configured" }, { status: 409 });

    const body = bodySchema.parse(await request.json());

    // 1) Compute KPIs with Drizzle. 2) Check ai_insights cache by hash; return if hit.
    const kpis = await computeKpis(body);
    const cached = await readInsightCache(body, kpis);
    if (cached) return NextResponse.json({ content: cached, cached: true });

    const agent = INSIGHT_AGENTS[body.kind];
    const client = await getCopilotClient();
    const session = await client.createSession({
      ...(model !== "auto" ? { model } : {}),
      customAgents: [agent],
      agent: agent.name,
      onPermissionRequest: denyAllExceptCustomTools,
    });

    const prompt = `Produce your analysis from this data.\nDATA:\n${JSON.stringify(kpis)}`;
    const res = await session.sendAndWait({ prompt });
    await session.disconnect();

    const content = res?.data.content ?? "";
    await writeInsightCache(body, kpis, content, model);
    return NextResponse.json({ content, cached: false });
  } catch (error) {
    console.error("AI insights failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**Done when:** with the feature enabled and a valid token, `/api/ai/insights` returns a grounded
narrative; with it disabled it returns 403; with no token it returns 409.

---

## Step 6 — AI Analyst settings tab

**File:** `app/src/app/settings/ai-analyst/page.tsx` — `"use client"`, **admin-gated** (reuse the
existing admin gate used by other settings pages; see `components/auth/admin-gate.tsx`).

Three controls, all strings via `t()`:
1. **Enable/disable** toggle → persists `ai_enabled`.
2. **Token** masked input → persists `copilot_token`. On save, call server-side
   `validateCopilotToken`; show the returned reason on failure. After a successful token change the
   server MUST call `resetCopilotClient()`.
3. **Model** dropdown → options from `GET /api/ai/models` (Auto first) → persists `ai_model`.

Persist via the existing settings API (`/api/settings` PUT) or a dedicated `POST /api/ai/config`
route. Token validation and `resetCopilotClient()` happen server-side in that handler.

Add the tab to settings navigation and a top-level **AI Analyst** entry in
`components/layout/sidebar.tsx`. Add all new i18n keys to `en/ar/es/fr`.

**Done when:** an admin can enable the feature, paste a token (with `ghp_` rejected), pick a model
(incl. Auto), and the values persist and survive reload.

---

## Step 7 — Surface narratives in reports

- Add a client component (`components/ai/insight-panel.tsx`) rendered on report pages right after
  `ReportBanner`. It first calls `GET /api/ai/status`; when `enabled && configured` it can POST to
  `/api/ai/insights` with the page's current date window (from `ReportFilters`), else it renders
  nothing.
- **Collapsed by default + lazy generation.** The panel is collapsed and does NOT call the model on
  mount. It generates only when the user first expands it, and re-generates when the date window
  changes *while expanded* — never while collapsed. This keeps every premium request opt-in. The
  dedicated AI hub passes `defaultOpen` (that page exists for AI). Guard the generate effect so it
  fires once per window and never loops on error.
- **Always label it.** Every panel shows an always-visible **Experimental** badge (beaker icon) and
  an "AI-generated" cue in the header, plus a footer disclaimer ("AI-generated … verify before
  acting"). Make the card visually distinct from normal report cards (violet/blue gradient +
  Sparkles/topic icon) so readers never mistake the narrative for source data.
- A **Refresh** control forces a cache-bypassing regeneration (`force: true` on the insights route).
- Show a loading skeleton while generating. Theme-aware, i18n (all strings via `t()` in
  `en/ar/es/fr`), dark-mode `dark:` variants, RTL-safe logical classes.

**Done when:** report pages show a collapsed, clearly-labelled experimental AI card that generates
on expand (not on load), tracks the date filter, and renders nothing when the feature is disabled.

---

## Step 8 — Generate narratives on sync (cost control)

- In the sync path (scheduler / `app/src/instrumentation.ts`), after a successful ingest and only
  when `ai_enabled` is true, pre-generate and cache narratives for the default windows so the UI
  serves cache hits. Wrap in try-catch; a model failure must never break ingest.

**Done when:** after a sync, opening a report serves a cached narrative without a new model call.

---

## Step 9 — Build & deploy packaging

- `app/next.config.ts`: add `serverExternalPackages: ["@github/copilot-sdk"]` so Next does not try
  to bundle the native CLI. If the standalone output omits the bundled `copilot` binary, add an
  `outputFileTracingIncludes` entry for the AI routes pointing at the SDK package.
- `app/Dockerfile`: ensure the bundled `copilot` CLI **Linux binary** is present in the runner
  stage (run `pnpm install` in the Linux build stage so the correct arch is fetched, and copy it
  into the standalone runner like `drizzle/` and `public/` are copied). Follow
  `infrastructure.instructions.md`.
- Verify in-container: the process can exec `copilot --version`.

**Done when:** `cd app && pnpm run build` passes and the container can start the SDK client.

---

## Definition of done (whole feature)

- [ ] `pnpm run build` and `pnpm run test` pass; no TypeScript or lint errors.
- [ ] Feature defaults OFF; toggling it on with a valid token enables narratives.
- [ ] All AI routes are Node runtime, Zod-validated, try-catch wrapped, token never leaked.
- [ ] Client is `mode: "empty"`; every session has an allowlist + deny-by-default permission handler.
- [ ] Narratives are cached in `ai_insights`; sync pre-generates them.
- [ ] All new UI strings exist in `en`, `ar`, `es`, `fr`.
- [ ] Token validation rejects `ghp_`; changing the token resets the client.

## Reference

Full rationale, validated SDK facts, risks, and rejected alternatives:
[.workspace/ai-enabled-dashboard-plan.md](../../.workspace/ai-enabled-dashboard-plan.md).
