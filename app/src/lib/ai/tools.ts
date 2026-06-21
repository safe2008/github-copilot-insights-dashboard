import type { PermissionRequest, PermissionRequestResult } from "@github/copilot-sdk";

/**
 * Deny-by-default permission guard for AI Analyst sessions. Insight generation
 * registers no tools — the grounding data is passed inline — so this rejects
 * every operation the model might attempt (shell, write, read, url, mcp).
 */
export const denyAllExceptCustomTools = (
  req: PermissionRequest,
): PermissionRequestResult =>
  req.kind === "custom-tool"
    ? { kind: "approve-once" }
    : { kind: "reject", feedback: "Tool use is not permitted." };
