"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface TokenFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Masked representation of the currently-saved token (e.g. "ghp_••••abcd"). */
  maskedToken?: string | null;
  /** Label shown before the masked token. Defaults to "Current:". */
  currentLabel?: string;
  /** Extra note rendered after the masked token (e.g. "— leave blank to keep"). */
  currentNote?: ReactNode;
  /** Optional trailing control rendered next to the input (e.g. a delete button). */
  trailing?: ReactNode;
  autoComplete?: string;
  id?: string;
  showLabel?: string;
  hideLabel?: string;
}

/**
 * Shared password-style token input with a show/hide toggle and an optional
 * masked "current value" line. Used by the GitHub Connection (Config) and AI
 * Analyst settings so the save-token UX is identical across both.
 */
export function TokenField({
  value,
  onChange,
  placeholder,
  maskedToken,
  currentLabel = "Current:",
  currentNote,
  trailing,
  autoComplete = "off",
  id,
  showLabel = "Show token",
  hideLabel = "Hide token",
}: TokenFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <div>
      {maskedToken && (
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          {currentLabel}{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">{maskedToken}</code>
          {currentNote}
        </p>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={id}
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete}
            className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            aria-label={show ? hideLabel : showLabel}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {trailing}
      </div>
    </div>
  );
}
