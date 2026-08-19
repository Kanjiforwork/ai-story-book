import { NextResponse } from "next/server";

import { isPipelineStep } from "@/domain/pipeline";
import { ValidationError, normalizeOptionalStyle } from "@/domain/validation";
import { jsonError, errorResponse } from "@/server/api";
import { loadServerEnv } from "@/server/env";
import { claimPipelineStep, startPipelineRun } from "@/server/pipeline-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Send a valid step payload.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Send a valid step payload.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; step: string }> },
) {
  try {
    const { projectId, step: rawStep } = await params;
    if (!isPipelineStep(rawStep)) {
      throw new ValidationError("Unknown pipeline step.");
    }
    const body = await readBody(request);
    const requestedStyle = normalizeOptionalStyle(body.style);
    if (rawStep !== "STYLE" && requestedStyle) {
      throw new ValidationError(
        "Art style is only accepted on the Style step.",
      );
    }

    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      const claim = claimPipelineStep(database, {
        projectId,
        staleRunMs: env.staleRunMs,
        step: rawStep,
        userId: user.id,
      });
      return { claim, userId: user.id };
    });
    if (!result) {
      return jsonError("AUTH_REQUIRED", "Sign in to run this step.", 401);
    }

    startPipelineRun({
      claim: result.claim,
      dataDir: env.dataDir,
      requestedStyle,
      staleRunMs: env.staleRunMs,
    });

    return NextResponse.json(
      {
        run: {
          attempt: result.claim.attempt,
          id: result.claim.runId,
          status: "RUNNING",
          step: result.claim.step,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
