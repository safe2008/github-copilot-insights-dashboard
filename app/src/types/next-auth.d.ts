import type { Tier } from "@/lib/authz";

/**
 * Augment Auth.js types with the Keycloak-derived authorization fields we
 * persist on the session token and expose on the session.
 */
declare module "next-auth" {
  interface Session {
    /** Raw Keycloak realm roles for the signed-in user. */
    roles: string[];
    /** Effective access tier derived from {@link roles}. */
    tier: Tier;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: string[];
    tier?: Tier;
  }
}
