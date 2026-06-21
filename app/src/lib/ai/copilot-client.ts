import { tmpdir } from "node:os";
import { join } from "node:path";
import { CopilotClient } from "@github/copilot-sdk";
import { getAiConfig } from "@/lib/db/ai-settings";
import { denyAllExceptCustomTools } from "./tools";

/** COPILOT_HOME used by empty-mode clients for session persistence. */
const SDK_BASE_DIR = process.env.COPILOT_HOME ?? join(tmpdir(), "copilot-insights-sdk");

/**
 * Single, lazily-started in-process Copilot client. The SDK spawns the bundled
 * Copilot CLI as a child of the Next.js server (no sidecar). Created with
 * `mode: "empty"` so no ambient OS/shell/file tools are exposed — sessions must
 * opt into our own allow-listed tools.
 *
 * The client is memoized for the life of the process. Call `resetCopilotClient`
 * after the token changes so the next call picks up the new credential.
 */
let clientPromise: Promise<CopilotClient> | null = null;

export async function getCopilotClient(): Promise<CopilotClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { token } = await getAiConfig();
      if (!token) {
        throw new Error("AI Analyst is not configured: missing Copilot token");
      }
      const client = new CopilotClient({
        mode: "empty",
        baseDirectory: SDK_BASE_DIR,
        gitHubToken: token,
        useLoggedInUser: false,
        sessionIdleTimeoutSeconds: 900,
      });
      await client.start();
      return client;
    })();
  }
  return clientPromise;
}

/** Dispose the current client (e.g. after the token changes). */
export async function resetCopilotClient(): Promise<void> {
  const pending = clientPromise;
  clientPromise = null;
  if (!pending) return;
  try {
    const client = await pending;
    await client.stop();
  } catch {
    /* never started or already stopping — nothing to clean up */
  }
}

function describeTokenError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/authoriz|unauthor|\b401\b|\b403\b|login/i.test(msg)) {
    return "Copilot rejected this token. Use a token from a Copilot-licensed account, and make sure your organization allows it.";
  }
  return `Token validation failed: ${msg.slice(0, 200)}`;
}

/**
 * Verify a candidate token with a minimal live Copilot call. Uses a throwaway
 * client (never the cached singleton) and always tears it down. Returns
 * `{ ok: false, reason }` with a user-facing message when Copilot rejects it.
 */
export async function validateCopilotTokenLive(
  token: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let client: CopilotClient | null = null;
  try {
    client = new CopilotClient({
      mode: "empty",
      baseDirectory: SDK_BASE_DIR,
      gitHubToken: token,
      useLoggedInUser: false,
      sessionIdleTimeoutSeconds: 120,
    });
    await client.start();
    const session = await client.createSession({
      availableTools: [],
      onPermissionRequest: denyAllExceptCustomTools,
    });
    try {
      const res = await session.sendAndWait({ prompt: "Reply with the single word: OK" }, 30000);
      if (!res?.data?.content) {
        return { ok: false, reason: "No response from Copilot — the token may lack Copilot access." };
      }
      return { ok: true };
    } finally {
      await session.disconnect();
    }
  } catch (err) {
    return { ok: false, reason: describeTokenError(err) };
  } finally {
    if (client) {
      try {
        await client.stop();
      } catch {
        /* ignore */
      }
    }
  }
}
