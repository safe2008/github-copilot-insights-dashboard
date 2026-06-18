import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessAdmin, canAccessDashboard } from "@/lib/authz";

/**
 * Server-side authorization guards for use inside route handlers / server
 * actions as defense-in-depth behind `proxy.ts`. Each returns `null` when
 * access is allowed, or a ready-to-return error response otherwise:
 *   - 401 when there is no session
 *   - 403 when the session lacks the required tier
 */

export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessAdmin(session.tier)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function requireDashboard(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessDashboard(session.tier)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
