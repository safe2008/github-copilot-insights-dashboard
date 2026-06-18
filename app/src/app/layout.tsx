import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import "./globals.css";

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
