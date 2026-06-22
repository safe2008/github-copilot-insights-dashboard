/**
 * GitHub access probe used by the Settings page "Check access" action.
 *
 * Validates the configured token, reads its classic OAuth scopes, and probes
 * every GitHub REST/GraphQL endpoint this dashboard depends on — enterprise
 * metrics/billing/teams, organization metrics/members (validated against one
 * representative org rather than fanning out across all of them), and the
 * display-name lookups. Every probe is best-effort and isolated — one failing
 * endpoint never blocks the others — and the token is never returned to the
 * caller.
 */

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";

export type AccessStatus = "ok" | "unauthorized" | "forbidden" | "not_found" | "error";

export type AccessGroup = "enterprise" | "organization" | "discovery";

export interface AccessCheckItem {
  id: string;
  group: AccessGroup;
  label: string;
  endpoint: string;
  requiredScope: string;
  status: AccessStatus;
  httpStatus: number;
  detail: string;
}

export interface AccessCheckResult {
  token: {
    valid: boolean;
    login: string | null;
    name: string | null;
    type: "classic" | "fine-grained" | "unknown";
    scopes: string[];
  };
  enterpriseSlug: string | null;
  representativeOrg: string | null;
  representativeTeam: string | null;
  orgs: Array<{ login: string; id: number }>;
  checks: AccessCheckItem[];
  checkedAt: string;
}

function ghHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
}

/** Best-effort classification from the GitHub token prefix. */
function classifyTokenType(token: string): "classic" | "fine-grained" | "unknown" {
  if (token.startsWith("github_pat_")) return "fine-grained";
  if (/^gh[posur]_/.test(token)) return "classic";
  return "unknown";
}

/** Map an HTTP status to a coarse access outcome with a human-readable detail. */
function classify(httpStatus: number, notFoundOk = false): { status: AccessStatus; detail: string } {
  if (httpStatus >= 200 && httpStatus < 300) return { status: "ok", detail: "Accessible" };
  // The token is authorized — the request only failed because of missing/invalid
  // query params, which proves the endpoint itself is reachable.
  if (httpStatus === 400 || httpStatus === 422) return { status: "ok", detail: "Authorized (endpoint reachable)" };
  if (httpStatus === 401) return { status: "unauthorized", detail: "Invalid or expired token" };
  if (httpStatus === 403) return { status: "forbidden", detail: "Forbidden — missing scope or SSO not authorized" };
  if (httpStatus === 404) {
    // For day/period-scoped reports a 404 means "authorized, no data for the
    // probe period" — auth/scope failures surface as 401/403 instead.
    return notFoundOk
      ? { status: "ok", detail: "Authorized (no data for probe period)" }
      : { status: "not_found", detail: "Not found — wrong slug or no access" };
  }
  return { status: "error", detail: `HTTP ${httpStatus}` };
}

type ProbeMeta = Pick<AccessCheckItem, "id" | "group" | "label" | "endpoint" | "requiredScope">;

interface ProbeOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  /** Treat a 404 as authorized — the resource/day simply has no data. */
  notFoundOk?: boolean;
  /** Extra context appended to the result detail (e.g. "via acme-org"). */
  note?: string;
}

/** Probe a single endpoint for reachability without downloading its body. */
async function probe(
  token: string,
  meta: ProbeMeta,
  url: string,
  opts: ProbeOptions = {},
): Promise<AccessCheckItem> {
  const { method, body, headers, notFoundOk, note } = opts;
  try {
    const res = await fetch(url, {
      method,
      body,
      headers: { ...ghHeaders(token), ...headers },
    });
    // Discard the body without reading it — we only care about the status.
    void res.body?.cancel();
    const { status, detail } = classify(res.status, notFoundOk);
    return { ...meta, status, httpStatus: res.status, detail: note ? `${detail} — ${note}` : detail };
  } catch {
    return { ...meta, status: "error", httpStatus: 0, detail: "Network error" };
  }
}

/** GET /user/orgs — orgs the token's user belongs to, plus the check row. */
async function discoverUserOrgs(
  token: string,
): Promise<{ check: AccessCheckItem; orgs: Array<{ login: string; id: number }> }> {
  const meta: ProbeMeta = {
    id: "user_orgs",
    group: "discovery",
    label: "Organizations visible to token",
    endpoint: "GET /user/orgs",
    requiredScope: "read:org",
  };
  try {
    const res = await fetch(`${GITHUB_API_BASE}/user/orgs?per_page=100`, { headers: ghHeaders(token) });
    const { status, detail } = classify(res.status);
    if (res.ok) {
      const list = (await res.json()) as Array<{ login: string; id: number }>;
      return {
        check: { ...meta, status, httpStatus: res.status, detail: `${list.length} organization(s) accessible` },
        orgs: list.map((o) => ({ login: o.login, id: o.id })),
      };
    }
    void res.body?.cancel();
    return { check: { ...meta, status, httpStatus: res.status, detail }, orgs: [] };
  } catch {
    return { check: { ...meta, status: "error", httpStatus: 0, detail: "Network error" }, orgs: [] };
  }
}

/** GET /enterprises/{slug}/organizations — first org (representative) + check row. */
async function discoverEnterpriseOrgs(
  token: string,
  encodedSlug: string,
  displaySlug: string,
): Promise<{ check: AccessCheckItem; firstOrg: string | null }> {
  const meta: ProbeMeta = {
    id: "ent_orgs",
    group: "enterprise",
    label: "Enterprise organizations",
    endpoint: `GET /enterprises/${displaySlug}/organizations`,
    requiredScope: "read:enterprise",
  };
  try {
    const res = await fetch(`${GITHUB_API_BASE}/enterprises/${encodedSlug}/organizations?per_page=100`, {
      headers: ghHeaders(token),
    });
    const { status, detail } = classify(res.status);
    if (res.ok) {
      const list = (await res.json()) as Array<{ login: string; id: number }>;
      return {
        check: { ...meta, status, httpStatus: res.status, detail: `${list.length} organization(s) in enterprise` },
        firstOrg: list[0]?.login ?? null,
      };
    }
    void res.body?.cancel();
    return { check: { ...meta, status, httpStatus: res.status, detail }, firstOrg: null };
  } catch {
    return { check: { ...meta, status: "error", httpStatus: 0, detail: "Network error" }, firstOrg: null };
  }
}

/** GET /enterprises/{slug}/teams — first team (representative) + check row. */
async function discoverFirstTeam(
  token: string,
  encodedSlug: string,
  displaySlug: string,
): Promise<{ check: AccessCheckItem; team: { id: number; slug: string } | null }> {
  const meta: ProbeMeta = {
    id: "ent_teams",
    group: "enterprise",
    label: "Enterprise teams",
    endpoint: `GET /enterprises/${displaySlug}/teams`,
    requiredScope: "read:enterprise",
  };
  try {
    const res = await fetch(`${GITHUB_API_BASE}/enterprises/${encodedSlug}/teams?per_page=100`, {
      headers: ghHeaders(token),
    });
    const { status, detail } = classify(res.status);
    if (res.ok) {
      const list = (await res.json()) as Array<{ id: number; slug: string }>;
      const first = list[0] ?? null;
      return {
        check: { ...meta, status, httpStatus: res.status, detail: `${list.length} team(s) found` },
        team: first ? { id: first.id, slug: first.slug } : null,
      };
    }
    void res.body?.cancel();
    return { check: { ...meta, status, httpStatus: res.status, detail }, team: null };
  } catch {
    return { check: { ...meta, status: "error", httpStatus: 0, detail: "Network error" }, team: null };
  }
}

/**
 * Run the comprehensive access probe for the given token and (optional)
 * enterprise slug. Identity is resolved first (to read classic scopes), then
 * discovery runs (orgs + a representative team), then every dashboard endpoint —
 * enterprise, organization (validated against one representative org), and the
 * display-name lookups — is probed in parallel.
 */
export async function checkGitHubAccess(
  token: string,
  enterpriseSlug: string | null,
): Promise<AccessCheckResult> {
  const checkedAt = new Date().toISOString();
  const type = classifyTokenType(token);
  const slug = enterpriseSlug ? encodeURIComponent(enterpriseSlug) : null;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); // yesterday (UTC)

  // 1. Identity + classic OAuth scopes via GET /user.
  let valid = false;
  let login: string | null = null;
  let name: string | null = null;
  let scopes: string[] = [];
  let userStatus = 0;
  try {
    const res = await fetch(`${GITHUB_API_BASE}/user`, { headers: ghHeaders(token) });
    userStatus = res.status;
    valid = res.ok;
    const scopeHeader = res.headers.get("x-oauth-scopes") ?? "";
    scopes = scopeHeader.split(",").map((s) => s.trim()).filter(Boolean);
    if (res.ok) {
      const u = (await res.json()) as { login?: string; name?: string | null };
      login = u.login ?? null;
      name = u.name ?? null;
    } else {
      void res.body?.cancel();
    }
  } catch {
    // Network failure — leave valid=false; remaining probes still run.
  }
  const identityCheck: AccessCheckItem = {
    id: "user",
    group: "discovery",
    label: "Token identity",
    endpoint: "GET /user",
    requiredScope: "—",
    httpStatus: userStatus,
    ...classify(userStatus),
  };

  // 2. Discovery — orgs (membership), enterprise orgs, and a representative team.
  const [userOrgsDisc, entOrgsDisc, teamDisc] = await Promise.all([
    discoverUserOrgs(token),
    slug ? discoverEnterpriseOrgs(token, slug, enterpriseSlug as string) : Promise.resolve(null),
    slug ? discoverFirstTeam(token, slug, enterpriseSlug as string) : Promise.resolve(null),
  ]);

  const orgs = userOrgsDisc.orgs;
  const representativeOrg = entOrgsDisc?.firstOrg ?? orgs[0]?.login ?? null;
  const representativeTeam = teamDisc?.team ?? null;
  const encodedOrg = representativeOrg ? encodeURIComponent(representativeOrg) : null;

  // 3. Probe every dashboard endpoint in parallel.
  const enterpriseProbes: Promise<AccessCheckItem>[] = slug
    ? [
        probe(token, { id: "ent_users_28d", group: "enterprise", label: "Enterprise Copilot user metrics (28-day)", endpoint: `GET /enterprises/${enterpriseSlug}/copilot/metrics/reports/users-28-day/latest`, requiredScope: "manage_billing:copilot" }, `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/users-28-day/latest`),
        probe(token, { id: "ent_users_1d", group: "enterprise", label: "Enterprise Copilot user metrics (daily)", endpoint: `GET /enterprises/${enterpriseSlug}/copilot/metrics/reports/users-1-day`, requiredScope: "manage_billing:copilot" }, `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/users-1-day?day=${day}`, { notFoundOk: true }),
        probe(token, { id: "ent_agg_28d", group: "enterprise", label: "Enterprise aggregate metrics (28-day)", endpoint: `GET /enterprises/${enterpriseSlug}/copilot/metrics/reports/enterprise-28-day/latest`, requiredScope: "manage_billing:copilot" }, `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/enterprise-28-day/latest`),
        probe(token, { id: "ent_agg_1d", group: "enterprise", label: "Enterprise aggregate metrics (daily)", endpoint: `GET /enterprises/${enterpriseSlug}/copilot/metrics/reports/enterprise-1-day`, requiredScope: "manage_billing:copilot" }, `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/enterprise-1-day?day=${day}`, { notFoundOk: true }),
        probe(token, { id: "ent_user_teams", group: "enterprise", label: "Enterprise user→team mapping", endpoint: `GET /enterprises/${enterpriseSlug}/copilot/metrics/reports/user-teams-1-day`, requiredScope: "manage_billing:copilot" }, `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/user-teams-1-day?day=${day}`, { notFoundOk: true }),
        probe(token, { id: "ent_seats", group: "enterprise", label: "Enterprise Copilot seats", endpoint: `GET /enterprises/${enterpriseSlug}/copilot/billing/seats`, requiredScope: "manage_billing:copilot / read:org" }, `${GITHUB_API_BASE}/enterprises/${slug}/copilot/billing/seats?per_page=1`),
        probe(token, { id: "ent_premium", group: "enterprise", label: "Enterprise premium request billing (historical)", endpoint: `GET /enterprises/${enterpriseSlug}/settings/billing/premium_request/usage`, requiredScope: "manage_billing:copilot" }, `${GITHUB_API_BASE}/enterprises/${slug}/settings/billing/premium_request/usage?year=${year}&month=${month}`, { notFoundOk: true }),
        probe(token, { id: "ent_ai_credit", group: "enterprise", label: "Enterprise AI Credit billing", endpoint: `GET /enterprises/${enterpriseSlug}/settings/billing/ai_credit/usage`, requiredScope: "manage_billing:copilot" }, `${GITHUB_API_BASE}/enterprises/${slug}/settings/billing/ai_credit/usage?year=${year}&month=${month}`, { notFoundOk: true }),
      ]
    : [];

  if (slug && representativeTeam) {
    enterpriseProbes.push(
      probe(
        token,
        { id: "ent_team_members", group: "enterprise", label: "Enterprise team members", endpoint: `GET /enterprises/${enterpriseSlug}/teams/{team}/memberships`, requiredScope: "read:enterprise" },
        `${GITHUB_API_BASE}/enterprises/${slug}/teams/${representativeTeam.id}/memberships?per_page=1`,
        { note: `via ${representativeTeam.slug}` },
      ),
    );
  }

  const orgProbes: Promise<AccessCheckItem>[] = encodedOrg
    ? [
        probe(token, { id: "org_users_28d", group: "organization", label: "Org Copilot user metrics (28-day)", endpoint: "GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest", requiredScope: "manage_billing:copilot / read:org" }, `${GITHUB_API_BASE}/orgs/${encodedOrg}/copilot/metrics/reports/users-28-day/latest`, { note: `via ${representativeOrg}` }),
        probe(token, { id: "org_users_1d", group: "organization", label: "Org Copilot user metrics (daily)", endpoint: "GET /orgs/{org}/copilot/metrics/reports/users-1-day", requiredScope: "manage_billing:copilot / read:org" }, `${GITHUB_API_BASE}/orgs/${encodedOrg}/copilot/metrics/reports/users-1-day?day=${day}`, { notFoundOk: true, note: `via ${representativeOrg}` }),
        probe(token, { id: "org_agg_28d", group: "organization", label: "Org aggregate metrics (28-day)", endpoint: "GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest", requiredScope: "manage_billing:copilot / read:org" }, `${GITHUB_API_BASE}/orgs/${encodedOrg}/copilot/metrics/reports/organization-28-day/latest`, { note: `via ${representativeOrg}` }),
        probe(token, { id: "org_agg_1d", group: "organization", label: "Org aggregate metrics (daily)", endpoint: "GET /orgs/{org}/copilot/metrics/reports/organization-1-day", requiredScope: "manage_billing:copilot / read:org" }, `${GITHUB_API_BASE}/orgs/${encodedOrg}/copilot/metrics/reports/organization-1-day?day=${day}`, { notFoundOk: true, note: `via ${representativeOrg}` }),
        probe(token, { id: "org_user_teams", group: "organization", label: "Org user→team mapping", endpoint: "GET /orgs/{org}/copilot/metrics/reports/user-teams-1-day", requiredScope: "manage_billing:copilot / read:org" }, `${GITHUB_API_BASE}/orgs/${encodedOrg}/copilot/metrics/reports/user-teams-1-day?day=${day}`, { notFoundOk: true, note: `via ${representativeOrg}` }),
        probe(token, { id: "org_members", group: "organization", label: "Org members", endpoint: "GET /orgs/{org}/members", requiredScope: "read:org" }, `${GITHUB_API_BASE}/orgs/${encodedOrg}/members?per_page=1`, { note: `via ${representativeOrg}` }),
      ]
    : [];

  const displayNameProbes: Promise<AccessCheckItem>[] = [
    probe(token, { id: "graphql", group: "discovery", label: "Display names (GraphQL)", endpoint: "POST /graphql", requiredScope: "—" }, `${GITHUB_API_BASE}/graphql`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "query { viewer { login } }" }) }),
    probe(token, { id: "users_login", group: "discovery", label: "Display names (REST fallback)", endpoint: "GET /users/{login}", requiredScope: "—" }, `${GITHUB_API_BASE}/users/${encodeURIComponent(login ?? "github")}`),
  ];

  const [enterpriseChecks, orgChecks, displayChecks] = await Promise.all([
    Promise.all(enterpriseProbes),
    Promise.all(orgProbes),
    Promise.all(displayNameProbes),
  ]);

  // Assemble in display order; the UI groups rows by `group`.
  const checks: AccessCheckItem[] = [
    ...enterpriseChecks,
    ...(teamDisc ? [teamDisc.check] : []),
    ...(entOrgsDisc ? [entOrgsDisc.check] : []),
    ...orgChecks,
    identityCheck,
    userOrgsDisc.check,
    ...displayChecks,
  ];

  return {
    token: { valid, login, name, type, scopes },
    enterpriseSlug,
    representativeOrg,
    representativeTeam: representativeTeam?.slug ?? null,
    orgs,
    checks,
    checkedAt,
  };
}
