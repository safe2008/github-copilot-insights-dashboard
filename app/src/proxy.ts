import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessAdmin, canAccessDashboard } from "@/lib/authz";

/**
 * Next.js proxy (formerly "middleware") — the single request-time auth gate.
 * Backed by the Auth.js session (`req.auth`), set by wrapping the handler in
 * `auth()`. Runs on the nodejs runtime in Next 16.
 *
 *   - Public paths            → always allowed
 *   - No session              → redirect pages to /signin, 401 for /api/*
 *   - Admin paths, non-admin  → redirect pages home, 403 for /api/*
 *   - Authenticated, no role  → bounced to /signin (or 403 for /api/*)
 */

/** Paths that never require authentication. */
const PUBLIC_PREFIXES = ["/api/auth", "/signin", "/api/health"];

/** Paths that require the admin tier (`insights-admin`). */
const ADMIN_PREFIXES = [
  "/api/admin",
  "/api/settings",
  "/api/ingest",
  "/api/audit-log",
  "/settings",
];

export const proxy = auth((req) => {
  const { pathname, origin } = req.nextUrl;
  const session = req.auth;
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Unauthenticated. The Auth.js middleware sets `req.auth` to an empty object
  // (not null) when there is no session, so key off the presence of a user.
  if (!session?.user) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL("/signin", origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated but lacking any recognized role.
  if (!canAccessDashboard(session.tier)) {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/signin?error=AccessDenied", origin));
  }

  // Admin-only surfaces.
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminRoute && !canAccessAdmin(session.tier)) {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/", origin));
  }

  return NextResponse.next();
});

export const config = {
  // Match everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
