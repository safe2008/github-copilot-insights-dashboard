"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

function SignInPanel() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error");
  const [pending, setPending] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-6 flex flex-col items-center text-center">
            <Image
              src="/copilot-insights-icon.svg"
              alt=""
              width={48}
              height={48}
              className="mb-4"
            />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {t("auth.signInTitle")}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("auth.signInSubtitle")}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("auth.accessDenied")}</span>
            </div>
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void signIn("keycloak", { callbackUrl });
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 dark:focus-visible:ring-offset-gray-800"
          >
            <LogIn className="h-4 w-4" />
            {pending ? t("auth.signingIn") : t("auth.signInButton")}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  // useSearchParams must be wrapped in a Suspense boundary.
  return (
    <Suspense>
      <SignInPanel />
    </Suspense>
  );
}
