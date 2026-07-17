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

/**
 * Builds the Content-Security-Policy for a request. Production uses a
 * per-request nonce (Next.js reads it from the request's CSP header and
 * stamps it onto its inline scripts/styles); development stays relaxed
 * because HMR relies on eval and inline injection.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // The unsafe-hashes entry allows exactly one inline style attribute:
    // next/image's style="color:transparent" placeholder.
    isDev
      ? "style-src 'self' 'unsafe-inline'"
      : `style-src 'self' 'nonce-${nonce}' 'unsafe-hashes' 'sha256-zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk='`,
    "img-src 'self' data:",
    "font-src 'self' data:",
    isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** Attaches the CSP header to any outgoing response. */
function withCsp<T extends NextResponse>(res: T, csp: string): T {
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

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

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forward the CSP on the request so Next.js picks up the nonce for the
  // inline scripts/styles it emits during server rendering.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);
  const next = () =>
    withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return next();
  }

  // Unauthenticated. The Auth.js middleware sets `req.auth` to an empty object
  // (not null) when there is no session, so key off the presence of a user.
  if (!session?.user) {
    if (isApi)
      return withCsp(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), csp);
    const url = new URL("/signin", origin);
    url.searchParams.set("callbackUrl", pathname);
    return withCsp(NextResponse.redirect(url), csp);
  }

  // Authenticated but lacking any recognized role.
  if (!canAccessDashboard(session.tier)) {
    if (isApi)
      return withCsp(NextResponse.json({ error: "Forbidden" }, { status: 403 }), csp);
    return withCsp(NextResponse.redirect(new URL("/signin?error=AccessDenied", origin)), csp);
  }

  // Admin-only surfaces.
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminRoute && !canAccessAdmin(session.tier)) {
    if (isApi)
      return withCsp(NextResponse.json({ error: "Forbidden" }, { status: 403 }), csp);
    return withCsp(NextResponse.redirect(new URL("/", origin)), csp);
  }

  return next();
});

export const config = {
  // Match everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
