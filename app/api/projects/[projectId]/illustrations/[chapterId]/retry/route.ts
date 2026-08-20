import { NextResponse } from "next/server";

import {
  normalizeGenerationPrompt,
  ValidationError,
} from "@/domain/validation";
import { jsonError, errorResponse } from "@/server/api";
import { loadServerEnv } from "@/server/env";
import { claimPipelineStep, startPipelineRun } from "@/server/pipeline-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; chapterId: string }>;
  },
) {
  try {
    const { chapterId, projectId } = await params;
    if (!request.body) {
      throw new ValidationError("Generation run and prompt are required.");
    }

    let generationRunId: string;
    let prompt: string;
    try {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new ValidationError("Generation run and prompt are required.");
      }
      const value = (body as Record<string, unknown>).generationRunId;
      if (typeof value !== "string" || !value.trim()) {
        throw new ValidationError("Generation run is invalid.");
      }
      generationRunId = value;
      prompt = normalizeGenerationPrompt(
        (body as Record<string, unknown>).prompt,
      );
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError("Send a valid illustration payload.");
    }

    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      return claimPipelineStep(database, {
        allowCompletedItemRetry: true,
        editedPrompt: prompt,
        generationRunId,
        illustrationChapterId: chapterId,
        projectId,
        staleRunMs: env.staleRunMs,
        step: "ILLUSTRATIONS",
        userId: user.id,
      });
    });

    if (!result) {
      return jsonError(
        "AUTH_REQUIRED",
        "Sign in to retry this illustration.",
        401,
      );
    }

    startPipelineRun({
      claim: result,
      dataDir: env.dataDir,
      staleRunMs: env.staleRunMs,
    });
    return NextResponse.json(
      {
        run: {
          attempt: result.attempt,
          id: result.runId,
          status: "RUNNING",
          step: result.step,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
