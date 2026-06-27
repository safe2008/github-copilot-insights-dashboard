export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAiConfig, setAiConfig, validateCopilotToken } from "@/lib/db/ai-settings";
import { resetCopilotClient, validateCopilotTokenLive } from "@/lib/ai/copilot-client";
import { logAudit, getClientIp } from "@/lib/audit";
import { safeErrorMessage } from "@/lib/auth";

function maskToken(value: string): string {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}

export async function GET() {
  try {
    const { enabled, token, model, additionalInstructions } = await getAiConfig();
    return NextResponse.json({
      enabled,
      model: model ?? "auto",
      additionalInstructions,
      configured: Boolean(token),
      maskedToken: token ? maskToken(token) : null,
    });
  } catch (err) {
    console.error("AI settings GET error:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to read AI settings") },
      { status: 500 },
    );
  }
}

const postSchema = z.object({
  enabled: z.boolean().optional(),
  token: z.string().max(1000).optional(),
  model: z.string().max(255).optional(),
  additionalInstructions: z.string().max(8000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = postSchema.parse(await request.json());
    const existing = await getAiConfig();
    const submittedToken = body.token?.trim();
    const hasSubmittedToken = submittedToken !== undefined && submittedToken.length > 0;

    if (!existing.token && !hasSubmittedToken) {
      return NextResponse.json({ error: "Copilot token is required." }, { status: 400 });
    }

    if (hasSubmittedToken) {
      const formatReason = validateCopilotToken(submittedToken);
      if (formatReason) return NextResponse.json({ error: formatReason }, { status: 400 });

      // Verify the token with a minimal live Copilot call before persisting it.
      const live = await validateCopilotTokenLive(submittedToken);
      if (!live.ok) return NextResponse.json({ error: live.reason }, { status: 400 });
    }

    await setAiConfig({
      enabled: body.enabled,
      token: hasSubmittedToken ? submittedToken : undefined,
      model: body.model,
      additionalInstructions: body.additionalInstructions,
    });

    // A new token means the in-process client must be recreated.
    const tokenChanged = hasSubmittedToken;
    if (tokenChanged) await resetCopilotClient();

    logAudit({
      action: "ai_settings_updated",
      category: "settings",
      details: {
        enabled: body.enabled,
        model: body.model,
        tokenChanged,
        additionalInstructionsChanged: body.additionalInstructions !== undefined,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.issues }, { status: 400 });
    }
    console.error("AI settings POST error:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to save AI settings") },
      { status: 500 },
    );
  }
}
