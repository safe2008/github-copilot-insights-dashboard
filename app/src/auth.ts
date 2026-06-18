import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { decodeAccessTokenRoles, rolesToTier, type Tier } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Auth.js (NextAuth v5) configuration — Keycloak OIDC is the single identity
 * provider. JWT session strategy (no database adapter): the analytics Postgres
 * stays dedicated to reporting data.
 *
 * Provider credentials are read from the environment by the Keycloak provider:
 *   AUTH_KEYCLOAK_ID, AUTH_KEYCLOAK_SECRET, AUTH_KEYCLOAK_ISSUER
 * plus AUTH_SECRET for session signing. See `.env.example`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Keycloak],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin" },
  callbacks: {
    jwt({ token, account }) {
      // `account` is only present on the initial sign-in. Keycloak realm roles
      // live in the access token's `realm_access.roles` claim.
      if (account?.access_token) {
        const roles = decodeAccessTokenRoles(account.access_token);
        token.roles = roles;
        token.tier = rolesToTier(roles);
      }
      return token;
    },
    session({ session, token }) {
      session.roles = (token.roles as string[] | undefined) ?? [];
      session.tier = (token.tier as Tier | undefined) ?? "none";
      return session;
    },
  },
  events: {
    async signIn({ profile }) {
      await logAudit({
        action: "user_login",
        category: "auth",
        actor: profile?.preferred_username ?? profile?.email ?? "unknown",
      });
    },
    async signOut() {
      await logAudit({ action: "user_logout", category: "auth" });
    },
  },
});
