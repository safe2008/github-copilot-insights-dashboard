"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  KeyRound,
  Bot,
  Info,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

interface AiSettings {
  enabled: boolean;
  model: string;
  configured: boolean;
  maskedToken: string | null;
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
  const [tokenInput, setTokenInput] = useState("");
  const [models, setModels] = useState<{ id: string; name: string }[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ai-analyst");
      if (!res.ok) throw new Error("Failed to load AI settings");
      const data: AiSettings = await res.json();
      setSettings(data);
      setEnabled(data.enabled);
      setModel(data.model);
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

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const hadToken = !!tokenInput.trim();
    try {
      const payload: Record<string, unknown> = { enabled, model };
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
      setTokenInput("");      setModels(null);      setMessage({
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
        {settings?.configured && (
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            {t("aiSettings.current")}{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">{settings.maskedToken}</code>
            {" "}— {t("aiSettings.leaveBlank")}
          </p>
        )}
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder={t("aiSettings.tokenPlaceholder")}
          autoComplete="off"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? (tokenInput.trim() ? t("aiSettings.verifying") : t("aiSettings.saving")) : t("aiSettings.saveChanges")}
        </button>
      </div>
    </div>
  );
}
