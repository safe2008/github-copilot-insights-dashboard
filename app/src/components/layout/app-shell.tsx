"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Application shell. Renders the sidebar + content frame for authenticated
 * surfaces, but bypasses the chrome on the standalone /signin route so the
 * sign-in screen fills the viewport. Request-time auth enforcement lives in
 * `proxy.ts`; this component only handles layout.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith("/signin")) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  );
}
