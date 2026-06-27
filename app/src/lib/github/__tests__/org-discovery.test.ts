import { describe, it, expect, vi, afterEach } from "vitest";
import { listEnterpriseOrgs } from "../copilot-api";

/** Minimal Response-like stub for mocking global fetch. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: { cancel: () => {} },
  } as unknown as Response;
}

describe("listEnterpriseOrgs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses GraphQL enterprise.organizations as the primary source (never the dead REST route)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/graphql")) {
        return jsonResponse({
          data: {
            enterprise: {
              organizations: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  { login: "org-a", databaseId: 1 },
                  { login: "org-b", databaseId: 2 },
                ],
              },
            },
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { orgs } = await listEnterpriseOrgs({ enterpriseSlug: "shield-corp", token: "t" });

    expect(orgs).toEqual([
      { login: "org-a", id: 1 },
      { login: "org-b", id: 2 },
    ]);
    // The REST route GET /enterprises/{slug}/organizations is dead (404 for all
    // tokens) and must never be called.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/organizations"))).toBe(false);
  });

  it("falls back to GET /user/orgs when the GraphQL query returns errors", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/graphql")) {
        return jsonResponse({ errors: [{ message: "Resource not accessible by personal access token" }] });
      }
      if (String(url).includes("/user/orgs")) {
        return jsonResponse([{ login: "org-c", id: 3 }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { orgs } = await listEnterpriseOrgs({ enterpriseSlug: "shield-corp", token: "t" });

    expect(orgs).toEqual([{ login: "org-c", id: 3 }]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/graphql"))).toBe(true);
  });

  it("retries transient GraphQL failures before using the fallback", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === "function") handler();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    let graphqlCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/graphql")) {
        graphqlCalls++;
        if (graphqlCalls === 1) return jsonResponse({ message: "temporary" }, 500);
        return jsonResponse({
          data: {
            enterprise: {
              organizations: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ login: "org-recovered", databaseId: 9 }],
              },
            },
          },
        });
      }
      throw new Error(`fallback should not be called: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { orgs, apiRequestCount } = await listEnterpriseOrgs({ enterpriseSlug: "e", token: "t" });

    expect(orgs).toEqual([{ login: "org-recovered", id: 9 }]);
    expect(graphqlCalls).toBe(2);
    expect(apiRequestCount).toBe(2);
  });

  it("paginates GraphQL via pageInfo.endCursor", async () => {
    let graphqlCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/graphql")) {
        graphqlCalls++;
        if (graphqlCalls === 1) {
          return jsonResponse({
            data: {
              enterprise: {
                organizations: {
                  pageInfo: { hasNextPage: true, endCursor: "CURSOR1" },
                  nodes: [{ login: "org-a", databaseId: 1 }],
                },
              },
            },
          });
        }
        return jsonResponse({
          data: {
            enterprise: {
              organizations: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ login: "org-b", databaseId: 2 }],
              },
            },
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { orgs } = await listEnterpriseOrgs({ enterpriseSlug: "e", token: "t" });

    expect(orgs.map((o) => o.login)).toEqual(["org-a", "org-b"]);
    expect(graphqlCalls).toBe(2);
  });
});
