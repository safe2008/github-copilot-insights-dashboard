import { describe, it, expect } from "vitest";
import {
  rolesToTier,
  canAccessAdmin,
  canAccessDashboard,
  decodeAccessTokenRoles,
  ROLE_ADMIN,
  ROLE_VIEWER,
} from "@/lib/authz";

/** Build a JWT-shaped string with the given payload (signature is irrelevant). */
function makeToken(payload: Record<string, unknown>): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256", typ: "JWT" })}.${enc(payload)}.signature`;
}

describe("rolesToTier", () => {
  it("maps the admin role to the admin tier", () => {
    expect(rolesToTier([ROLE_ADMIN])).toBe("admin");
  });

  it("maps the viewer role to the viewer tier", () => {
    expect(rolesToTier([ROLE_VIEWER])).toBe("viewer");
  });

  it("prefers admin when a user holds both roles", () => {
    expect(rolesToTier([ROLE_VIEWER, ROLE_ADMIN])).toBe("admin");
  });

  it("returns none for unrelated or empty roles", () => {
    expect(rolesToTier(["offline_access", "uma_authorization"])).toBe("none");
    expect(rolesToTier([])).toBe("none");
  });
});

describe("tier capability checks", () => {
  it("grants admin everything", () => {
    expect(canAccessAdmin("admin")).toBe(true);
    expect(canAccessDashboard("admin")).toBe(true);
  });

  it("grants viewer dashboard only", () => {
    expect(canAccessAdmin("viewer")).toBe(false);
    expect(canAccessDashboard("viewer")).toBe(true);
  });

  it("grants none nothing", () => {
    expect(canAccessAdmin("none")).toBe(false);
    expect(canAccessDashboard("none")).toBe(false);
  });
});

describe("decodeAccessTokenRoles", () => {
  it("extracts realm roles from a well-formed access token", () => {
    const token = makeToken({
      realm_access: { roles: [ROLE_ADMIN, "offline_access"] },
    });
    expect(decodeAccessTokenRoles(token)).toEqual([ROLE_ADMIN, "offline_access"]);
  });

  it("returns an empty array when realm_access is absent", () => {
    expect(decodeAccessTokenRoles(makeToken({ sub: "abc" }))).toEqual([]);
  });

  it("filters non-string role entries", () => {
    const token = makeToken({ realm_access: { roles: [ROLE_VIEWER, 42, null] } });
    expect(decodeAccessTokenRoles(token)).toEqual([ROLE_VIEWER]);
  });

  it("returns an empty array for non-array roles", () => {
    expect(decodeAccessTokenRoles(makeToken({ realm_access: { roles: "x" } }))).toEqual([]);
  });

  it("returns an empty array for malformed or missing tokens", () => {
    expect(decodeAccessTokenRoles("not-a-jwt")).toEqual([]);
    expect(decodeAccessTokenRoles("")).toEqual([]);
    expect(decodeAccessTokenRoles(undefined)).toEqual([]);
    expect(decodeAccessTokenRoles(null)).toEqual([]);
    expect(decodeAccessTokenRoles("header.%%%notbase64%%%.sig")).toEqual([]);
  });
});
