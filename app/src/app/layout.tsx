import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import "./globals.css";

// Render every page per-request so the CSP nonce injected by src/proxy.ts is
// fresh each time; static prerendering would bake in a stale (blocked) nonce
// and let responses be CDN-cached (ZAP: "Re-examine Cache-control Directives").
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GitHub Copilot Insights",
  description:
    "Enterprise analytics dashboard for GitHub Copilot usage and impact",
  icons: {
    icon: [
      { url: "/copilot-insights-icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 antialiased dark:bg-gray-900 dark:text-gray-100">
        <SessionProvider>
          <ThemeProvider>
            <LocaleProvider>
              <AppShell>{children}</AppShell>
            </LocaleProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
