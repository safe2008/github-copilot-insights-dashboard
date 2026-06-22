export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/db/ai-settings";
import { validateCopilotTokenLive } from "@/lib/ai/copilot-client";
import { listAvailableModels } from "@/lib/ai/models";
import { safeErrorMessage } from "@/lib/auth";

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";

/** Resolve the token's GitHub identity (best-effort; the AI token is a PAT). */
async function fetchIdentity(token: string): Promise<{ login: string | null; name: string | null }> {
  try {
    const res = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
    if (!res.ok) {
      void res.body?.cancel();
      return { login: null, name: null };
    }
    const u = (await res.json()) as { login?: string; name?: string | null };
    return { login: u.login ?? null, name: u.name ?? null };
  } catch {
    return { login: null, name: null };
  }
}

/**
 * GET — Verify what the saved AI Analyst (Copilot) token can access: a live
 * Copilot validation call, the token's GitHub identity, and the available
 * model catalog. Mirrors the Config tab's "Check access" experience for the
 * Copilot SDK token. The token itself is never returned.
 */
export async function GET() {
  try {
    const { token, model } = await getAiConfig();

    if (!token) {
      return NextResponse.json(
        { error: "AI token must be configured first." },
        { status: 400 },
      );
    }

    const [live, identity] = await Promise.all([
      validateCopilotTokenLive(token),
      fetchIdentity(token),
    ]);

    let models: { id: string; name: string }[] = [];
    if (live.ok) {
      try {
        models = await listAvailableModels(true);
      } catch (err) {
        console.debug("AI check-access: model listing failed:", err);
      }
    }

    return NextResponse.json({
      valid: live.ok,
      reason: live.ok ? undefined : live.reason,
      login: identity.login,
      name: identity.name,
      model: model ?? "auto",
      models,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("AI access check error:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to check access") },
      { status: 500 },
    );
  }
}
