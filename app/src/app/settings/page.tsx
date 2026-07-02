"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  KeyRound,
  PlugZap,
  Database,
  Sparkles,
  DatabaseZap,
  Info,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
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
interface SyncEntry {
  status?: string;
  completedAt?: string | null;
  startedAt?: string | null;
  recordsInserted?: number | null;
}
interface AiStatus {
  enabled?: boolean;
  configured?: boolean;
  model?: string;
}
interface MigrationStatus {
  pendingCount?: number;
  latestTag?: string | null;
  drift?: { hasDrift?: boolean };
}
interface AppInfo {
  app?: { version?: string; buildId?: string };
}

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function SettingsOverviewPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [sync, setSync] = useState<SyncEntry | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [migrations, setMigrations] = useState<MigrationStatus | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, h, a, m, info] = await Promise.all([
      safeJson<SettingsData>("/api/settings"),
      safeJson<{ history: SyncEntry[] }>("/api/settings/sync-history"),
      safeJson<AiStatus>("/api/settings/ai-analyst"),
      safeJson<MigrationStatus>("/api/admin/migrate"),
      safeJson<AppInfo>("/api/settings/app-info"),
    ]);
    setSettings(s);
    setSync(h?.history?.[0] ?? null);
    setAi(a);
    setMigrations(m);
    setAppInfo(info);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const tokenOk = settings?.settings.github_token.configured ?? false;
  const slugOk = settings?.settings.github_enterprise_slug.configured ?? false;
  const lastSyncOk = (sync?.status ?? "").toLowerCase() === "success";
  const aiOn = Boolean(ai?.enabled && ai?.configured);
  const pending = migrations?.pendingCount ?? 0;
  const drift = migrations?.drift?.hasDrift ?? false;

  const checklist = [
    { done: tokenOk, label: "Add a GitHub token", href: "/settings/token" },
    { done: slugOk, label: "Set the enterprise slug", href: "/settings/token" },
    { done: lastSyncOk, label: "Run the first data sync", href: "/settings/data-sync" },
    { done: aiOn, label: "Enable AI Analyst (optional)", href: "/settings/ai-analyst", optional: true },
  ];
  const completed = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-6">
      {/* Setup checklist */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Setup checklist</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {completed}/{checklist.length} complete
          </span>
        </div>
        <ul className="space-y-2">
          {checklist.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className={cn("h-4 w-4", item.optional ? "text-gray-300 dark:text-gray-600" : "text-amber-500")} />
                )}
                <span className={cn(item.done && "text-gray-400 line-through dark:text-gray-500")}>{item.label}</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          icon={<KeyRound className="h-5 w-5" />}
          title="GitHub Token"
          href="/settings/token"
          state={tokenOk && slugOk ? "ok" : "warn"}
          lines={[
            tokenOk ? "Token configured" : "No token saved",
            slugOk ? `Enterprise: ${settings?.settings.github_enterprise_slug.value ?? "set"}` : "No enterprise slug",
          ]}
        />
        <StatusCard
          icon={<PlugZap className="h-5 w-5" />}
          title="API Access"
          href="/settings/api-access"
          state={tokenOk ? "neutral" : "warn"}
          lines={[tokenOk ? "Run a check to validate endpoints" : "Save a token first", "Per-endpoint & per-org coverage"]}
        />
        <StatusCard
          icon={<Database className="h-5 w-5" />}
          title="Data Sync"
          href="/settings/data-sync"
          state={lastSyncOk ? "ok" : "warn"}
          lines={[
            sync ? `Last: ${(sync.status ?? "unknown").toUpperCase()}` : "No sync yet",
            sync?.completedAt ? new Date(sync.completedAt).toLocaleString() : "—",
          ]}
        />
        <StatusCard
          icon={<Sparkles className="h-5 w-5" />}
          title="AI Analyst"
          href="/settings/ai-analyst"
          state={aiOn ? "ok" : "neutral"}
          lines={[aiOn ? "Enabled" : "Off", ai?.model ? `Model: ${ai.model}` : "—"]}
        />
        <StatusCard
          icon={<DatabaseZap className="h-5 w-5" />}
          title="Migrations"
          href="/settings/migrations"
          state={pending > 0 || drift ? "warn" : "ok"}
          lines={[
            pending > 0 ? `${pending} pending` : "Up to date",
            drift ? "Schema drift detected" : migrations?.latestTag ? `Latest: ${migrations.latestTag}` : "—",
          ]}
        />
        <StatusCard
          icon={<Info className="h-5 w-5" />}
          title="App Info"
          href="/settings/app-info"
          state="neutral"
          lines={[`Version ${appInfo?.app?.version ?? "—"}`, `Build ${appInfo?.app?.buildId ?? "—"}`]}
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/settings/token"
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <KeyRound className="h-4 w-4" /> Manage token
        </Link>
        <Link
          href="/settings/api-access"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <PlugZap className="h-4 w-4" /> Check access
        </Link>
        <Link
          href="/settings/data-sync"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Database className="h-4 w-4" /> Data sync
        </Link>
        <button
          type="button"
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  href,
  state,
  lines,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  state: "ok" | "warn" | "neutral";
  lines: string[];
}) {
  const dot =
    state === "ok"
      ? "bg-green-500"
      : state === "warn"
        ? "bg-amber-500"
        : "bg-gray-300 dark:bg-gray-600";
  return (
    <Link
      href={href}
      className="group rounded-lg border border-gray-200 bg-white p-4 shadow-xs transition-colors hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <span className={cn("ml-auto h-2.5 w-2.5 rounded-full", dot)} />
      </div>
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className={cn("text-xs", i === 0 ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-400")}>
            {line}
          </p>
        ))}
      </div>
      <div className="mt-2 flex items-center text-xs font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-blue-400">
        Open <ArrowRight className="ml-1 h-3 w-3" />
      </div>
    </Link>
  );
}
