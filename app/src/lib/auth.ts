import "server-only";

/**
 * Error-message sanitization helpers shared across API routes.
 *
 * Authentication/authorization now lives in Auth.js (`@/auth`), the request
 * gate `proxy.ts`, and the server guards in `@/lib/auth-guards`. This module
 * retains only the error helpers that ~30 route handlers import.
 */

/** Return a safe error message — real message in dev, generic fallback in prod. */
export function safeErrorMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV === "development") {
    return err instanceof Error ? err.message : fallback;
  }
  return fallback;
}

/**
 * Return the real error message, suitable for admin-gated UIs where users
 * need diagnostic detail (e.g. Settings → Data Sync). Do NOT use for
 * endpoints reachable by non-admin users.
 */
export function adminErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
