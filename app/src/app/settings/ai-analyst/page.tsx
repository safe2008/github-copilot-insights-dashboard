"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  Bot,
  FileText,
  Building2,
  Database,
  Trash2,
  Info,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { TokenField } from "@/components/ui/token-field";

interface AiSettings {
  enabled: boolean;
  model: string;
  additionalInstructions: string;
  configured: boolean;
  maskedToken: string | null;
}

interface AiAccessResult {
  valid: boolean;
  reason?: string;
  login: string | null;
  name: string | null;
  model: string;
  models: { id: string; name: string }[];
  checkedAt: string;
}

interface AiEnterpriseContextStatus {
  seats: {
    latestSnapshotDate: string | null;
    assignments: number;
    uniqueAssignees: number;
  };
  orgMembers: {
    orgs: number;
    members: number;
    lastSyncedAt: string | null;
  };
  accessHealth: {
    checkedAt: string;
    tokenValid: boolean;
    failedChecks: number;
  } | null;
}

export default function AiAnalystSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Editable form state
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("auto");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [models, setModels] = useState<{ id: string; name: string }[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [access, setAccess] = useState<AiAccessResult | null>(null);
  const [cache, setCache] = useState<{ count: number; lastUpdated: string | null } | null>(null);
  const [enterpriseContext, setEnterpriseContext] = useState<AiEnterpriseContextStatus | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ai-analyst");
      if (!res.ok) throw new Error("Failed to load AI settings");
      const data: AiSettings = await res.json();
      setSettings(data);
      setEnabled(data.enabled);
      setModel(data.model);
      setAdditionalInstructions(data.additionalInstructions ?? "");
    } catch {
      setMessage({ type: "error", text: t("aiSettings.loadError") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Lazily fetch the Copilot model catalog the first time the dropdown is opened
  // (avoids spawning the CLI + calling listModels() on every settings visit).
  const loadModels = useCallback(async () => {
    if (models || modelsLoading) return;
    setModelsLoading(true);
    try {
      const res = await fetch("/api/settings/ai-analyst/models");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) setModels(data.models);
      }
    } catch {
      /* keep current selection if the list can't be fetched */
    } finally {
      setModelsLoading(false);
    }
  }, [models, modelsLoading]);

  const loadCache = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ai-analyst/cache");
      if (res.ok) setCache(await res.json());
    } catch {
      /* cache info is best-effort */
    }
  }, []);

  const loadEnterpriseContext = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ai-analyst/context");
      if (res.ok) setEnterpriseContext(await res.json());
    } catch {
      /* enterprise context info is best-effort */
    }
  }, []);

  useEffect(() => {
    load();
    loadCache();
    loadEnterpriseContext();
  }, [load, loadCache, loadEnterpriseContext]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const hadToken = !!tokenInput.trim();
    if (enabled && !hadToken && !settings?.configured) {
      setMessage({ type: "error", text: t("aiSettings.tokenRequired") });
      setSaving(false);
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        enabled,
        model,
        additionalInstructions,
      };
      if (hadToken) payload.token = tokenInput.trim();

      const res = await fetch("/api/settings/ai-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? t("aiSettings.saveError") });
        return;
      }
      setTokenInput("");
      setModels(null);
      setMessage({
        type: "success",
        text: hadToken ? t("aiSettings.tokenVerifiedSaved") : t("aiSettings.saved"),
      });
      await load();
    } catch {
      setMessage({ type: "error", text: t("aiSettings.saveNetworkError") });
    } finally {
      setSaving(false);
    }
  };

  const checkAccess = async () => {
    setChecking(true);
    setAccess(null);
    try {
      const res = await fetch("/api/settings/ai-analyst/check-access");
      const data = await res.json();
      if (res.ok) {
        setAccess(data as AiAccessResult);
        await loadEnterpriseContext();
      } else {
        setMessage({ type: "error", text: data.error ?? t("aiSettings.checkError") });
      }
    } catch {
      setMessage({ type: "error", text: t("aiSettings.saveNetworkError") });
    } finally {
      setChecking(false);
    }
  };

  const clearCache = async () => {
    if (!window.confirm(t("aiSettings.cacheClearConfirm"))) return;
    setClearingCache(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ai-analyst/cache", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: t("aiSettings.cacheCleared") });
        await loadCache();
      } else {
        setMessage({ type: "error", text: data.error ?? t("aiSettings.cacheClearError") });
      }
    } catch {
      setMessage({ type: "error", text: t("aiSettings.saveNetworkError") });
    } finally {
      setClearingCache(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const modelOptions = models ?? [{ id: model, name: model === "auto" ? "Auto" : model }];
  const modelOptionsWithCurrent =
    model && !modelOptions.some((m) => m.id === model)
      ? [{ id: model, name: model }, ...modelOptions]
      : modelOptions;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t("aiSettings.title")}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("aiSettings.subtitle")}
          </p>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-4 py-3 text-sm",
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300",
          )}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Enable / disable */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t("aiSettings.enableTitle")}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("aiSettings.enableDesc")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                enabled ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>
      </section>

      {/* Token */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("aiSettings.tokenTitle")}</h3>
          </div>
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            {t("aiSettings.createToken")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <TokenField
          value={tokenInput}
          onChange={setTokenInput}
          placeholder={t("aiSettings.tokenPlaceholder")}
          maskedToken={settings?.maskedToken ?? null}
          currentLabel={t("aiSettings.current")}
          currentNote={<> — {t("aiSettings.leaveBlank")}</>}
        />
        <div className="mt-2 space-y-2 text-xs text-gray-500 dark:text-gray-400">
          <p className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("aiSettings.tokenHelpIntro")}</span>
          </p>
          <ol className="ms-5 list-decimal space-y-1">
            <li>
              <strong>Token name</strong> {t("aiSettings.stepNameDesc")}
            </li>
            <li>
              <strong>Resource owner</strong> {t("aiSettings.stepOwnerDesc")}
            </li>
            <li>
              <strong>Account permissions</strong> → <strong>Copilot Requests</strong> →{" "}
              <strong>Read-only</strong>.
            </li>
            <li>{t("aiSettings.stepNoRepo")}</li>
          </ol>
          <p>{t("aiSettings.tokenCaveats")}</p>
        </div>
      </section>

      {/* Model */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("aiSettings.modelTitle")}</h3>
        </div>
        <select
          value={model}
          onFocus={loadModels}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          {modelOptionsWithCurrent.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          {modelsLoading && <option disabled>{t("aiSettings.loadingModels")}</option>}
        </select>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t("aiSettings.modelHelp")}
        </p>
      </section>

      {/* Admin instructions / assumptions */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t("aiSettings.instructionsTitle")}
          </h3>
        </div>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          {t("aiSettings.instructionsDesc")}
        </p>
        <textarea
          value={additionalInstructions}
          onChange={(e) => setAdditionalInstructions(e.target.value)}
          maxLength={8000}
          rows={7}
          placeholder={t("aiSettings.instructionsPlaceholder")}
          className="w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{t("aiSettings.instructionsHelp")}</span>
          <span>{additionalInstructions.length}/8000</span>
        </div>
      </section>

      {/* Enterprise context */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t("aiSettings.enterpriseContextTitle")}
          </h3>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {t("aiSettings.enterpriseContextDesc")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("aiSettings.seatSnapshots")}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {enterpriseContext?.seats.assignments ?? 0}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {enterpriseContext?.seats.latestSnapshotDate
                ? t("aiSettings.contextAsOf", enterpriseContext.seats.latestSnapshotDate)
                : t("aiSettings.contextNotAvailable")}
            </p>
          </div>
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("aiSettings.orgMembers")}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {enterpriseContext?.orgMembers.members ?? 0}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {enterpriseContext?.orgMembers.orgs
                ? t("aiSettings.contextAcrossOrgs", enterpriseContext.orgMembers.orgs)
                : t("aiSettings.contextNotAvailable")}
            </p>
          </div>
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("aiSettings.accessHealth")}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {enterpriseContext?.accessHealth
                ? enterpriseContext.accessHealth.tokenValid
                  ? t("aiSettings.accessHealthy")
                  : t("aiSettings.accessNeedsReview")
                : t("aiSettings.contextUnknown")}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {enterpriseContext?.accessHealth
                ? t("aiSettings.failedChecks", enterpriseContext.accessHealth.failedChecks)
                : t("aiSettings.contextNotAvailable")}
            </p>
          </div>
        </div>
      </section>

      {/* Cached data */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("aiSettings.cacheTitle")}</h3>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("aiSettings.cacheDesc")}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{cache?.count ?? 0}</span>{" "}
            {t("aiSettings.cacheRecords")}
            {cache?.lastUpdated && (
              <span className="ms-2 text-xs text-gray-400 dark:text-gray-500">
                {t("aiSettings.cacheLastUpdated")} {new Date(cache.lastUpdated).toLocaleString()}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={clearCache}
            disabled={clearingCache || !cache || cache.count === 0}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            {clearingCache ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {t("aiSettings.clearCache")}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? (tokenInput.trim() ? t("aiSettings.verifying") : t("aiSettings.saving")) : t("aiSettings.saveChanges")}
        </button>
        <button
          type="button"
          onClick={checkAccess}
          disabled={checking || !settings?.configured}
          title={settings?.configured ? t("aiSettings.checkAccessHint") : t("aiSettings.checkAccessNeedsToken")}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {t("aiSettings.checkAccess")}
        </button>
      </div>

      {access && (
        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("aiSettings.accessTitle")}</h3>
            <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(access.checkedAt).toLocaleString()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {access.valid ? (
              <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-300">
                <CheckCircle className="h-4 w-4" /> {t("aiSettings.accessValid")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4" /> {t("aiSettings.accessInvalid")}
              </span>
            )}
            {access.login && (
              <span className="text-gray-600 dark:text-gray-400">
                as <strong className="text-gray-800 dark:text-gray-200">{access.login}</strong>
                {access.name ? ` (${access.name})` : ""}
              </span>
            )}
          </div>
          {!access.valid && access.reason && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{access.reason}</p>
          )}
          {access.valid && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t("aiSettings.availableModels")} ({access.models.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {access.models.map((m) => (
                  <span
                    key={m.id}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                      m.id === access.model
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
                    )}
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
