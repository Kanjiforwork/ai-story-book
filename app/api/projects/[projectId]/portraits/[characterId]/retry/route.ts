import { NextResponse } from "next/server";

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
    params: Promise<{ projectId: string; characterId: string }>;
  },
) {
  try {
    const { characterId, projectId } = await params;
    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      const claim = claimPipelineStep(database, {
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
