import { NextResponse } from "next/server";

import { jsonError, errorResponse } from "@/server/api";
import { loadServerEnv } from "@/server/env";
import { claimPipelineStep, startPipelineRun } from "@/server/pipeline-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";
import {
  normalizeGenerationPrompt,
  ValidationError,
} from "@/domain/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; characterId: string }>;
  },
) {
  try {
    const { characterId, projectId } = await params;
    let generationRunId: string;
    let prompt: string;
    if (!request.body) {
      throw new ValidationError("Generation run is required.");
    }
    {
      try {
        const body: unknown = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new ValidationError("Generation run is required.");
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
        throw new ValidationError("Send a valid portrait payload.");
      }
    }
    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      const claim = claimPipelineStep(database, {
        generationRunId,
        allowCompletedItemRetry: true,
        editedPrompt: prompt,
        portraitCharacterId: characterId,
        projectId,
        staleRunMs: env.staleRunMs,
        step: "PORTRAITS",
        userId: user.id,
      });
      return claim;
    });

    if (!result) {
      return jsonError("AUTH_REQUIRED", "Sign in to retry this portrait.", 401);
    }

    startPipelineRun({
      claim: result,
      dataDir: env.dataDir,
      portraitCharacterId: characterId,
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
