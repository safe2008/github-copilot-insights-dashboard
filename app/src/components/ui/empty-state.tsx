"use client";

import Link from "next/link";
import { Database, Search, Settings, AlertCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

interface EmptyStateProps {
  /** When true, data has been synced but no results match the current filters. */
  hasData?: boolean;
  /** When true, the sync has been configured (token + slug set). */
  isConfigured?: boolean;
  /** When true, at least one sync has completed. */
  hasSynced?: boolean;
}

/**
 * Empty state shown on dashboard pages.
 * Provides clear messaging based on the sync/configuration status:
 * - Not configured: "Data sync is not configured" + link to Settings.
 * - Configured but not synced: "Data sync has not been started yet" + link to Data Sync.
 * - Synced but no data for filters: "No results for this date range / filters".
 * - Default (hasData=false): "No data has been synced yet" + link to Settings.
 */
export function EmptyState({ hasData = false, isConfigured, hasSynced }: EmptyStateProps) {
  const { t } = useTranslation();

  // Synced but no results for current filters
  if (hasData) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 rounded-full bg-gray-100 p-4 dark:bg-gray-700">
          <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("common.noResultsForFilters")}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t("common.noResultsForFiltersDesc")}
        </p>
      </div>
    );
  }

  // Not configured: token or slug missing
  if (isConfigured === false) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 rounded-full bg-amber-100 p-4 dark:bg-amber-900/30">
          <AlertCircle className="h-8 w-8 text-amber-500 dark:text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("common.syncNotConfigured")}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t("common.syncNotConfiguredDesc")}
        </p>
        <Link
          href="/settings"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
        >
          <Settings className="h-4 w-4" />
          {t("configBanner.goToSettings")}
        </Link>
      </div>
    );
  }

  // Configured but never synced
  if (hasSynced === false) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 rounded-full bg-blue-100 p-4 dark:bg-blue-900/30">
          <Database className="h-8 w-8 text-blue-500 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("common.syncNotStarted")}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t("common.syncNotStartedDesc")}
        </p>
        <Link
          href="/settings/data-sync"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
        >
          <Settings className="h-4 w-4" />
          {t("configBanner.goToSettings")}
        </Link>
      </div>
    );
  }

  // Default: no synced data
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 rounded-full bg-gray-100 p-4 dark:bg-gray-700">
        <Database className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t("common.noSyncedData")}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {t("common.noSyncedDataDesc")}
      </p>
      <Link
        href="/settings"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
      >
        <Settings className="h-4 w-4" />
        {t("configBanner.goToSettings")}
      </Link>
    </div>
  );
}
