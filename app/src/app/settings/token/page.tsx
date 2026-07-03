"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Save,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  KeyRound,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import type { AccessCheckResult } from "@/lib/github/access-check";
import { TokenField } from "@/components/ui/token-field";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

interface SettingState {
  configured: boolean;
  masked?: string;
  value?: string;
}
interface SettingsData {
  settings: {
    github_token: SettingState;
    github_enterprise_slug: SettingState;
  };
}

interface OrgAccessResult {
  login: string;
  id: number;
  status: "authorized" | "saml_required" | "forbidden" | "not_found" | "error";
  httpStatus: number;
  detail: string;
}
interface OrgAccessResponse {
  enterpriseSlug: string;
  checkedAt: string;
  apiRequests: number;
  orgs: OrgAccessResult[];
}

const CLASSIC_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=manage_billing:copilot,manage_billing:enterprise,read:enterprise,read:org&description=Copilot+Insights+Dashboard";
const FINE_GRAINED_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
const TOKEN_SETTINGS_URL = "https://github.com/settings/tokens";
const SAML_DOCS_URL =
  "https://docs.github.com/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on";

/** Extract the enterprise slug from a pasted URL, else return the trimmed input. */
function extractSlug(input: string): string {
  const v = input.trim();
  const m = v.match(/enterprises\/([^/?#\s]+)/i);
  return m ? m[1] : v;
}

/** Rough client-side check that a value looks like a GitHub token. */
function looksLikeToken(v: string): boolean {
  return /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/.test(v.trim());
}

export default function TokenPage() {
  const { t } = useTranslation();

  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [slugInput, setSlugInput] = useState("");

  const [validating, setValidating] = useState(false);
  const [access, setAccess] = useState<AccessCheckResult | null>(null);

  const [orgAccess, setOrgAccess] = useState<OrgAccessResponse | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [autoChecked, setAutoChecked] = useState(false);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const result: SettingsData = await res.json();
        setData(result);
        if (result.settings.github_enterprise_slug.value) {
          setSlugInput(result.settings.github_enterprise_slug.value);
        }
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const tokenConfigured = data?.settings.github_token.configured ?? false;
  const slugConfigured = data?.settings.github_enterprise_slug.configured ?? false;

  const validateToken = useCallback(
    async (silent = false) => {
      setValidating(true);
      if (!silent) setAccess(null);
      try {
        const res = await fetch("/api/settings/check-access");
        const json = await res.json();
        if (res.ok) setAccess(json as AccessCheckResult);
        else if (!silent) showMessage("error", json.error ?? t("tokenPage.validationFailed"));
      } catch {
        if (!silent) showMessage("error", t("tokenPage.networkError"));
      } finally {
        setValidating(false);
      }
    },
    [showMessage, t],
  );

  const loadOrgAccess = useCallback(
    async (silent = false) => {
      setOrgError(null);
      setOrgLoading(true);
      try {
        const res = await fetch("/api/settings/token-setup/org-access");
        const json = await res.json();
        if (!res.ok) {
          if (!silent) setOrgError(json.error ?? t("tokenPage.failedOrgAccess"));
          setOrgAccess(null);
          return;
        }
        setOrgAccess(json as OrgAccessResponse);
      } catch {
        if (!silent) setOrgError(t("tokenPage.networkError"));
        setOrgAccess(null);
      } finally {
        setOrgLoading(false);
      }
    },
    [t],
  );

  const runChecks = useCallback(() => {
    validateToken(true);
    loadOrgAccess(true);
  }, [validateToken, loadOrgAccess]);

  // Auto-check on load when a token is already configured.
  useEffect(() => {
    if (!loading && tokenConfigured && !autoChecked) {
      setAutoChecked(true);
      runChecks();
    }
  }, [loading, tokenConfigured, autoChecked, runChecks]);

  const handleSave = async () => {
    const token = tokenInput.trim();
    const slug = extractSlug(slugInput);
    if (slug !== slugInput) setSlugInput(slug);
    if (!slug) {
      showMessage("error", t("tokenPage.slugRequired"));
      return;
    }
    if (!token && !tokenConfigured) {
      showMessage("error", t("tokenPage.tokenRequired"));
      return;
    }
    const settings: Array<{ key: string; value: string }> = [{ key: "github_enterprise_slug", value: slug }];
    if (token) settings.unshift({ key: "github_token", value: token });

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        showMessage("success", token ? t("tokenPage.savedBoth") : t("tokenPage.savedSlug"));
        setTokenInput("");
        await fetchSettings();
        runChecks(); // auto-validate after saving
      } else {
        const err = await res.json();
        showMessage("error", err.error ?? t("tokenPage.failedSave"));
      }
    } catch {
      showMessage("error", t("tokenPage.networkError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    setDeleting(key);
    try {
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        showMessage("success", t("tokenPage.settingRemoved"));
        if (key === "github_enterprise_slug") setSlugInput("");
        if (key === "github_token") {
          setAccess(null);
          setOrgAccess(null);
        }
        await fetchSettings();
      } else {
        const err = await res.json();
        showMessage("error", err.error ?? t("tokenPage.failedDelete"));
      }
    } catch {
      showMessage("error", t("tokenPage.networkError"));
    } finally {
      setDeleting(null);
    }
  };

  const timeAgo = useCallback(
    (iso: string) => {
      const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      if (min < 1) return t("tokenPage.justNow");
      if (min < 60) return t("tokenPage.minutesAgo", min);
      const hr = Math.floor(min / 60);
      if (hr < 24) return t("tokenPage.hoursAgo", hr);
      return t("tokenPage.daysAgo", Math.floor(hr / 24));
    },
    [t],
  );

  const orgSummary = useMemo(() => {
    const orgs = orgAccess?.orgs ?? [];
    return { total: orgs.length, authorized: orgs.filter((o) => o.status === "authorized").length };
  }, [orgAccess]);

  const tokenTypeLabel =
    access?.token.type === "fine-grained"
      ? t("tokenPage.typeFineGrained")
      : access?.token.type === "classic"
        ? t("tokenPage.typeClassic")
        : t("tokenPage.typeUnknown");

  const orgStatusLabel: Record<OrgAccessResult["status"], string> = {
    authorized: t("tokenPage.statusAuthorized"),
    saml_required: t("tokenPage.statusSamlRequired"),
    forbidden: t("tokenPage.statusForbidden"),
    not_found: t("tokenPage.statusNotFound"),
    error: t("tokenPage.statusError"),
  };

  const tokenFormatWarn = tokenInput.trim().length > 0 && !looksLikeToken(tokenInput);
  const lastCheckedAt = orgAccess?.checkedAt ?? access?.checkedAt ?? null;

  const headerState: "none" | "checking" | "ok" | "invalid" | "configured" = !tokenConfigured
    ? "none"
    : validating && !access
      ? "checking"
      : access
        ? access.token.valid
          ? "ok"
          : "invalid"
        : "configured";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-72 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300",
          )}
        >
          {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Status header */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            headerState === "ok"
              ? "bg-green-500"
              : headerState === "invalid"
                ? "bg-red-500"
                : headerState === "checking"
                  ? "animate-pulse bg-gray-400"
                  : headerState === "configured"
                    ? "bg-amber-500"
                    : "bg-gray-300 dark:bg-gray-600",
          )}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {headerState === "none"
              ? t("tokenPage.notConnected")
              : headerState === "checking"
                ? t("tokenPage.checking")
                : headerState === "invalid"
                  ? t("tokenPage.invalidToken")
                  : headerState === "ok" && access?.token.login
                    ? t("tokenPage.connectedAs", access.token.login)
                    : t("tokenPage.tokenConfigured")}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
            {headerState === "none" ? (
              <span>{t("tokenPage.addTokenHint")}</span>
            ) : (
              <>
                <span>
                  {slugConfigured
                    ? t("tokenPage.enterpriseLabel", data?.settings.github_enterprise_slug.value ?? "")
                    : t("tokenPage.noEnterprise")}
                </span>
                {orgAccess && <span>· {t("tokenPage.orgsAuthorized", orgSummary.authorized, orgSummary.total)}</span>}
                {lastCheckedAt && <span>· {t("tokenPage.checkedAgo", timeAgo(lastCheckedAt))}</span>}
              </>
            )}
          </div>
        </div>
        {tokenConfigured && (
          <button
            type="button"
            onClick={runChecks}
            disabled={validating || orgLoading}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {validating || orgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("tokenPage.recheck")}
          </button>
        )}
      </div>

      {/* Intro */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        <p className="font-medium">{t("tokenPage.introTitle")}</p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">{t("tokenPage.introBody")}</p>
      </div>

      {/* GitHub screens */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StepCard icon={<KeyRound className="h-5 w-5" />} title={t("tokenPage.step1Title")} description={t("tokenPage.step1Desc")}>
          <div className="flex flex-wrap gap-2">
            <ScopeChip label="manage_billing:copilot" />
            <ScopeChip label="manage_billing:enterprise" />
            <ScopeChip label="read:enterprise" />
            <ScopeChip label="read:org" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ExternalButton href={CLASSIC_TOKEN_URL} label={t("tokenPage.generateClassic")} />
            <ExternalButton href={FINE_GRAINED_TOKEN_URL} label={t("tokenPage.generateFineGrained")} secondary />
          </div>
        </StepCard>
        <StepCard icon={<ShieldCheck className="h-5 w-5" />} title={t("tokenPage.step2Title")} description={t("tokenPage.step2Desc")}>
          <div className="flex flex-wrap gap-2">
            <ExternalButton href={TOKEN_SETTINGS_URL} label={t("tokenPage.openTokenSettings")} />
            <ExternalButton href={SAML_DOCS_URL} label={t("tokenPage.openSamlDocs")} secondary />
          </div>
        </StepCard>
      </div>

      {/* GitHub Connection */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <KeyRound className="h-4 w-4" /> {t("tokenPage.connectionTitle")}
        </h2>

        <label htmlFor="pat-input" className="mb-2 mt-3 block text-xs font-semibold text-gray-700 dark:text-gray-300">
          {t("tokenPage.patLabel")}
        </label>
        <div className="mb-1">
          <TokenField
            value={tokenInput}
            onChange={setTokenInput}
            placeholder={tokenConfigured ? t("tokenPage.enterNewToken") : "ghp_xxxxxxxxxxxx"}
            maskedToken={tokenConfigured ? data?.settings.github_token.masked ?? null : null}
            trailing={
              tokenConfigured ? (
                <button
                  onClick={() => handleDelete("github_token")}
                  disabled={deleting === "github_token"}
                  aria-label={t("tokenPage.removeToken")}
                  title={t("tokenPage.removeToken")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  {deleting === "github_token" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              ) : undefined
            }
          />
        </div>
        {tokenFormatWarn && (
          <p className="mb-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t("tokenPage.formatWarning")}
          </p>
        )}
        <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">{t("tokenPage.securityNote")}</p>

        <label htmlFor="enterprise-slug" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
          {t("tokenPage.slugLabel")}
        </label>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("tokenPage.slugHelp")}</p>
        <div className="mb-4 flex gap-2">
          <input
            id="enterprise-slug"
            type="text"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            onBlur={() => setSlugInput((s) => extractSlug(s))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="my-enterprise"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          {slugConfigured && (
            <button
              onClick={() => handleDelete("github_enterprise_slug")}
              disabled={deleting === "github_enterprise_slug"}
              aria-label={t("tokenPage.removeSlug")}
              title={t("tokenPage.removeSlug")}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              {deleting === "github_enterprise_slug" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? t("tokenPage.saving") : t("tokenPage.save")}
          </button>
          <button
            onClick={() => validateToken(false)}
            disabled={validating || !tokenConfigured}
            title={tokenConfigured ? t("tokenPage.validateTooltip") : t("tokenPage.saveTokenFirst")}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {validating ? t("tokenPage.validating") : t("tokenPage.validate")}
          </button>
        </div>

        {/* Token identity result */}
        {access && (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-wrap items-center gap-2">
              {access.token.valid ? (
                <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-300">
                  <CheckCircle className="h-4 w-4" /> {t("tokenPage.tokenValid")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
                  <XCircle className="h-4 w-4" /> {t("tokenPage.invalidToken")}
                </span>
              )}
              {access.token.login && (
                <span className="text-gray-600 dark:text-gray-400">
                  {t("tokenPage.identityAs", access.token.login)}
                  {access.token.name ? ` (${access.token.name})` : ""}
                </span>
              )}
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {t("tokenPage.tokenType", tokenTypeLabel)}
              </span>
            </div>
            <div className="mt-2">
              {access.token.type === "fine-grained" ? (
                <span className="text-gray-500 dark:text-gray-400">{t("tokenPage.fineGrainedNote")}</span>
              ) : access.token.scopes.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-gray-500 dark:text-gray-400">{t("tokenPage.scopes")}</span>
                  {access.token.scopes.map((s) => (
                    <code key={s} className="rounded-sm bg-gray-200 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {s}
                    </code>
                  ))}
                </div>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">{t("tokenPage.noScopes")}</span>
              )}
            </div>
            {access.token.valid && <p className="mt-2 text-gray-500 dark:text-gray-400">{t("tokenPage.nextCheckOrg")}</p>}
          </div>
        )}

        {!tokenConfigured && !access && (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">{t("tokenPage.addTokenHint")}</p>
        )}
      </div>

      {/* Per-org SAML authorization */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <ShieldCheck className="h-4 w-4" /> {t("tokenPage.orgTitle")}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {orgAccess
                ? t("tokenPage.orgSummary", orgAccess.enterpriseSlug, orgSummary.authorized, orgSummary.total)
                : t("tokenPage.orgHint")}
              {orgAccess ? ` · ${t("tokenPage.checkedAgo", timeAgo(orgAccess.checkedAt))}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadOrgAccess(false)}
            disabled={orgLoading || !tokenConfigured}
            className="inline-flex items-center gap-2 self-start rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {orgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {orgAccess ? t("tokenPage.recheck") : t("tokenPage.checkOrgAccess")}
          </button>
        </div>

        {orgError ? (
          <div className="p-5">
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{orgError}</p>
            </div>
          </div>
        ) : orgAccess ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {orgAccess.orgs.map((org) => {
              const authorized = org.status === "authorized";
              return (
                <div key={org.login} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{org.login}</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          authorized
                            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                            : org.status === "saml_required"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                        )}
                      >
                        {authorized ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {orgStatusLabel[org.status]}
                      </span>
                      {org.httpStatus > 0 && <span className="text-xs text-gray-400 dark:text-gray-500">HTTP {org.httpStatus}</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{org.detail}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <a
                      href={`https://github.com/orgs/${encodeURIComponent(org.login)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {t("tokenPage.openOrg")} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {!authorized && (
                      <a
                        href={TOKEN_SETTINGS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                      >
                        {t("tokenPage.configureSso")} <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t("tokenPage.orgEmpty")}</div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center gap-2 text-blue-600 dark:text-blue-400">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">{description}</p>
      {children}
    </section>
  );
}

function ScopeChip({ label }: { label: string }) {
  return (
    <code className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">
      {label}
    </code>
  );
}

function ExternalButton({ href, label, secondary = false }: { href: string; label: string; secondary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium",
        secondary
          ? "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          : "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white",
      )}
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
