import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGitHubConfig } from "@/lib/db/settings";
import { listEnterpriseOrgs } from "@/lib/github/copilot-api";
import { safeErrorMessage } from "@/lib/auth";

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";

const querySchema = z.object({});

interface OrgAccessResult {
  login: string;
  id: number;
  status: "authorized" | "saml_required" | "forbidden" | "not_found" | "error";
  httpStatus: number;
  detail: string;
}

function headers(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
}

function classifyOrgAccess(httpStatus: number, body: string): Pick<OrgAccessResult, "status" | "detail"> {
  if (httpStatus >= 200 && httpStatus < 300) {
    return { status: "authorized", detail: "Organization members endpoint is accessible." };
  }

  const lower = body.toLowerCase();
  if (httpStatus === 403 && (lower.includes("saml") || lower.includes("single sign-on"))) {
    return {
      status: "saml_required",
      detail: "SAML SSO authorization is required for this organization.",
    };
  }

  if (httpStatus === 403) {
    return { status: "forbidden", detail: "Forbidden — check read:org scope and organization access." };
  }

  if (httpStatus === 404) {
    return { status: "not_found", detail: "Organization was not found or the token cannot see it." };
  }

  return { status: "error", detail: `GitHub returned HTTP ${httpStatus}.` };
}

async function probeOrgMembers(org: { login: string; id: number }, token: string): Promise<OrgAccessResult> {
  const url = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(org.login)}/members?per_page=1`;
  try {
    const response = await fetch(url, {
      headers: headers(token),
      next: { revalidate: 0 },
    });
    const body = await response.text().catch(() => "");
    const classified = classifyOrgAccess(response.status, body);
    return {
      login: org.login,
      id: org.id,
      httpStatus: response.status,
      ...classified,
    };
  } catch (error) {
    console.error(`Failed to probe organization member access for ${org.login}:`, error);
    return {
      login: org.login,
      id: org.id,
      status: "error",
      httpStatus: 0,
      detail: "Network error while probing organization access.",
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const { token, enterpriseSlug } = await getGitHubConfig();
    if (!token || !enterpriseSlug) {
      return NextResponse.json(
        { error: "GitHub token and enterprise slug must be configured first." },
        { status: 400 },
      );
    }

    const { orgs, apiRequestCount } = await listEnterpriseOrgs({ enterpriseSlug, token });
    const results = await Promise.all(orgs.map((org) => probeOrgMembers(org, token)));

    return NextResponse.json({
      enterpriseSlug,
      checkedAt: new Date().toISOString(),
      apiRequests: apiRequestCount + orgs.length,
      orgs: results,
    });
  } catch (error) {
    console.error("Failed to check organization token setup:", error);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to check organization token setup") },
      { status: 500 },
    );
  }
}