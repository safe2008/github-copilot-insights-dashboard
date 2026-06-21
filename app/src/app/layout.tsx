import type { Metadata } from "next";
import { Sora, Cairo, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { AuthGate } from "@/components/auth/auth-gate";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import "./globals.css";

// Primary UI typeface — a geometric sans-serif used for all Latin scripts
// (English, Spanish, French). Exposed as the `--font-sora` CSS variable.
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

// Arabic companion typeface — Cairo shares Sora's geometric, low-contrast,
// modern character, keeping the RTL experience visually consistent.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

// Monospace typeface for code, identifiers, API paths, and tabular figures.
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sora.variable} ${cairo.variable} ${jetBrainsMono.variable}`}
    >
      <body className="bg-gray-50 text-gray-900 antialiased dark:bg-gray-900 dark:text-gray-100">
        <ThemeProvider>
          <LocaleProvider>
            <AuthGate>
              <div className="flex h-screen">
                <Sidebar />
                <main className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6">{children}</div>
                </main>
              </div>
            </AuthGate>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
