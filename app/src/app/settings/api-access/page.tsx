"use client";

import { useState } from "react";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Building2,
  Loader2,
} from "lucide-react";
import type { AccessCheckResult, AccessCheckItem, AccessStatus } from "@/lib/github/access-check";
import { useTranslation } from "@/lib/i18n/locale-provider";

interface ApiRow {
  endpoint: string;
  purposeKey: string;
  version: string;
  scope: string;
}

const API_ROWS: ApiRow[] = [
  { endpoint: "GET /enterprises/{slug}/copilot/metrics/reports/users-28-day/latest", purposeKey: "apiAccess.rows.enterpriseUsers28Day", version: "2026-03-10", scope: "manage_billing:copilot" },
  { endpoint: "GET /enterprises/{slug}/copilot/metrics/reports/users-1-day", purposeKey: "apiAccess.rows.enterpriseUsers1Day", version: "2026-03-10", scope: "manage_billing:copilot" },
  { endpoint: "GET /enterprises/{slug}/copilot/metrics/reports/enterprise-28-day/latest", purposeKey: "apiAccess.rows.enterpriseAggregate28Day", version: "2026-03-10", scope: "manage_billing:copilot" },
  { endpoint: "GET /enterprises/{slug}/copilot/metrics/reports/enterprise-1-day", purposeKey: "apiAccess.rows.enterpriseAggregate1Day", version: "2026-03-10", scope: "manage_billing:copilot" },
  { endpoint: "GET /enterprises/{slug}/copilot/metrics/reports/user-teams-1-day", purposeKey: "apiAccess.rows.enterpriseUserTeams", version: "2026-03-10", scope: "manage_billing:copilot" },
  { endpoint: "GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest", purposeKey: "apiAccess.rows.orgUsers28Day", version: "2026-03-10", scope: "manage_billing:copilot / read:org" },
  { endpoint: "GET /orgs/{org}/copilot/metrics/reports/users-1-day", purposeKey: "apiAccess.rows.orgUsers1Day", version: "2026-03-10", scope: "manage_billing:copilot / read:org" },
  { endpoint: "GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest", purposeKey: "apiAccess.rows.orgAggregate28Day", version: "2026-03-10", scope: "manage_billing:copilot / read:org" },
  { endpoint: "GET /orgs/{org}/copilot/metrics/reports/organization-1-day", purposeKey: "apiAccess.rows.orgAggregate1Day", version: "2026-03-10", scope: "manage_billing:copilot / read:org" },
  { endpoint: "GET /orgs/{org}/copilot/metrics/reports/user-teams-1-day", purposeKey: "apiAccess.rows.orgUserTeams", version: "2026-03-10", scope: "manage_billing:copilot / read:org" },
  { endpoint: "GET /enterprises/{slug}/copilot/billing/seats", purposeKey: "apiAccess.rows.seats", version: "2026-03-10", scope: "manage_billing:copilot / read:org" },
  { endpoint: "GET /enterprises/{slug}/settings/billing/premium_request/usage", purposeKey: "apiAccess.rows.premiumRequests", version: "2026-03-10", scope: "manage_billing:copilot" },
  { endpoint: "GET /enterprises/{slug}/settings/billing/ai_credit/usage", purposeKey: "apiAccess.rows.aiCredits", version: "2026-03-10", scope: "manage_billing:copilot" },
  { endpoint: "GET /user", purposeKey: "apiAccess.rows.user", version: "2026-03-10", scope: "No scope required (any valid token)" },
  { endpoint: "GET /user/orgs", purposeKey: "apiAccess.rows.userOrgs", version: "2026-03-10", scope: "read:org" },
  { endpoint: "POST /graphql enterprise.organizations", purposeKey: "apiAccess.rows.enterpriseOrganizations", version: "GraphQL", scope: "read:org / read:enterprise" },
  { endpoint: "GET /orgs/{org}/members", purposeKey: "apiAccess.rows.orgMembers", version: "2026-03-10", scope: "read:org + SAML SSO" },
  { endpoint: "GET /enterprises/{slug}/teams", purposeKey: "apiAccess.rows.enterpriseTeams", version: "2026-03-10", scope: "read:enterprise" },
  { endpoint: "GET /enterprises/{slug}/teams/{team}/memberships", purposeKey: "apiAccess.rows.enterpriseTeamMemberships", version: "2026-03-10", scope: "read:enterprise" },
  { endpoint: "POST /graphql", purposeKey: "apiAccess.rows.displayNamesGraphql", version: "GraphQL", scope: "No scope required" },
  { endpoint: "GET /users/{login}", purposeKey: "apiAccess.rows.displayNamesRest", version: "2026-03-10", scope: "No scope required (public endpoint)" },
];

export default function ApiAccessPage() {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [access, setAccess] = useState<AccessCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckAccess = async () => {
    setChecking(true);
    setError(null);
    setAccess(null);
    try {
      const res = await fetch("/api/settings/check-access");
      const json = await res.json();
      if (res.ok) {
        setAccess(json as AccessCheckResult);
      } else {
        setError(json.error ?? t("apiAccess.accessCheckFailed"));
      }
    } catch {
      setError(t("apiAccess.networkError"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        <p className="font-medium">{t("apiAccess.infoTitle")}</p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
          {t("apiAccess.infoDescriptionPrefix")} <strong>{t("apiAccess.githubToken")}</strong>{t("apiAccess.infoDescriptionSuffix")}
        </p>
      </div>

      {/* Run check */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleCheckAccess}
          disabled={checking}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {t("apiAccess.checkAccess")}
        </button>
        {error && (
          <span className="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" /> {error}
          </span>
        )}
      </div>

      {access && <AccessResults result={access} />}

      {/* API inventory */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{t("apiAccess.apisUsedTitle")}</h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          {t("apiAccess.apisUsedDescription")}
        </p>
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.table.endpoint")}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.table.purpose")}</th>
                <th className="w-28 whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.table.apiVersion")}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.table.classicPatScopes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {API_ROWS.map((row) => (
                <tr key={row.endpoint}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{row.endpoint}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{t(row.purposeKey)}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.version}</td>
                  <td className="px-3 py-2">
                    <code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{row.scope}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          {t("apiAccess.footerPrefix")} <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">Bearer</code> {t("apiAccess.footerRecommendedScopes")} {" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">manage_billing:copilot</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">read:enterprise</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">read:org</code>.
        </p>
      </div>
    </div>
  );
}

function statusIcon(status: AccessStatus) {
  switch (status) {
    case "ok":
      return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "unauthorized":
    case "forbidden":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "not_found":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
  }
}

function translatedStrongSentence(text: string, value: string) {
  const [before, after = ""] = text.split(value);
  return (
    <>
      {before}<strong className="text-gray-700 dark:text-gray-300">{value}</strong>{after}
    </>
  );
}

function AccessResults({ result }: { result: AccessCheckResult }) {
  const { t } = useTranslation();
  const { token, orgs, checks, enterpriseSlug, representativeOrg, representativeTeam, checkedAt } = result;
  const tokenTypeLabel =
    token.type === "fine-grained" ? t("apiAccess.tokenTypes.fineGrained") : token.type === "classic" ? t("apiAccess.tokenTypes.classic") : t("apiAccess.tokenTypes.unknown");

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("apiAccess.accessCheckTitle")}</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">{t("apiAccess.checkedAt", new Date(checkedAt).toLocaleString())}</span>
      </div>

      <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-2">
          {token.valid ? (
            <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4" /> {t("apiAccess.tokenValid")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
              <XCircle className="h-4 w-4" /> {t("apiAccess.tokenInvalid")}
            </span>
          )}
          {token.login && (
            <span className="text-gray-600 dark:text-gray-400">
              {t("apiAccess.as")} <strong className="text-gray-800 dark:text-gray-200">{token.login}</strong>
              {token.name ? ` (${token.name})` : ""}
            </span>
          )}
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{t("apiAccess.tokenType", tokenTypeLabel)}</span>
        </div>
        <div className="mt-2">
          {token.type === "fine-grained" ? (
            <span className="text-gray-500 dark:text-gray-400">
              {t("apiAccess.fineGrainedExplanation")}
            </span>
          ) : token.scopes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-gray-500 dark:text-gray-400">{t("apiAccess.scopes")}</span>
              {token.scopes.map((s) => (
                <code key={s} className="rounded-sm bg-gray-200 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  {s}
                </code>
              ))}
            </div>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">{t("apiAccess.noScopes")}</span>
          )}
        </div>
      </div>

      {(representativeOrg || representativeTeam) && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {representativeOrg && (
            <>
              {translatedStrongSentence(t("apiAccess.representativeOrg", representativeOrg), representativeOrg)}{" "}
            </>
          )}
          {representativeTeam && (
            <>
              {translatedStrongSentence(t("apiAccess.representativeTeam", representativeTeam), representativeTeam)}
            </>
          )}
        </p>
      )}

      <div className="space-y-4">
        <CheckTable title={t("apiAccess.groups.enterprise")} rows={checks.filter((c) => c.group === "enterprise")} />
        <CheckTable title={t("apiAccess.groups.organization")} rows={checks.filter((c) => c.group === "organization")} />
        <CheckTable title={t("apiAccess.groups.discovery")} rows={checks.filter((c) => c.group === "discovery")} />
      </div>

      {orgs.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">{t("apiAccess.organizationsAccessible", orgs.length)}</p>
          <div className="flex flex-wrap gap-1">
            {orgs.map((o) => (
              <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                <Building2 className="h-3 w-3" />
                {o.login}
              </span>
            ))}
          </div>
        </div>
      )}
      {!enterpriseSlug && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{t("apiAccess.noEnterpriseSlug")}</p>
      )}
    </div>
  );
}

function CheckTable({ title, rows }: { title: string; rows: AccessCheckItem[] }) {
  const { t } = useTranslation();

  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</p>
      <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.checkTable.access")}</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.checkTable.capability")}</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.checkTable.endpoint")}</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.checkTable.requiredScope")}</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">{t("apiAccess.checkTable.result")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">{statusIcon(c.status)}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{c.label}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{c.endpoint}</td>
                <td className="px-3 py-2">
                  <code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{c.requiredScope}</code>
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
