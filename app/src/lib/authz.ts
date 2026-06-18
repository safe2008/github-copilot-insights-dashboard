/**
 * Authorization primitives — pure, dependency-free, and unit-testable.
 *
 * Keycloak realm roles drive access tiers:
 *   - `insights-admin`  → full access (dashboards + Settings/admin APIs)
 *   - `insights-viewer` → dashboards only
 *   - no recognized role → no access
 *
 * Keep this file free of `next-auth`/server imports so it can be tested in the
 * plain node vitest environment. Server-side guards live in `auth-guards.ts`.
 */

export type Tier = "admin" | "viewer" | "none";

export const ROLE_ADMIN = "insights-admin";
export const ROLE_VIEWER = "insights-viewer";

/** Map a set of Keycloak realm roles to a single effective access tier. */
export function rolesToTier(roles: readonly string[]): Tier {
  if (roles.includes(ROLE_ADMIN)) return "admin";
  if (roles.includes(ROLE_VIEWER)) return "viewer";
  return "none";
}

/** True if the tier may reach dashboard (read) surfaces. */
export function canAccessDashboard(tier: Tier): boolean {
  return tier === "admin" || tier === "viewer";
}

/** True if the tier may reach admin surfaces (Settings, ingest, admin APIs). */
export function canAccessAdmin(tier: Tier): boolean {
  return tier === "admin";
}

/**
 * Decode the Keycloak realm roles from a JWT access token without verifying its
 * signature. Verification is unnecessary here: the token came straight from the
 * OIDC token endpoint over TLS inside the Auth.js `jwt` callback, and Auth.js
 * signs the session cookie we ultimately trust. Returns `[]` on any malformed
 * input — never throws.
 */
export function decodeAccessTokenRoles(accessToken: string | undefined | null): string[] {
  if (!accessToken) return [];
  const parts = accessToken.split(".");
  if (parts.length < 2) return [];

  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson) as {
      realm_access?: { roles?: unknown };
    };
    const roles = payload.realm_access?.roles;
    if (!Array.isArray(roles)) return [];
    return roles.filter((r): r is string => typeof r === "string");
  } catch {
    return [];
  }
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  // `atob` exists in both the Next.js nodejs runtime and the test environment.
  const binary = atob(padded);
  // Decode UTF-8 bytes (usernames/emails may be non-ASCII).
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
