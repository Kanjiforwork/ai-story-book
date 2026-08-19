import { NextResponse } from "next/server";

import { isPipelineStep } from "@/domain/pipeline";
import { ValidationError } from "@/domain/validation";
import { jsonError, errorResponse } from "@/server/api";
import { loadServerEnv } from "@/server/env";
import { recoverStalePipelineStep } from "@/server/pipeline-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; step: string }> },
) {
  try {
    const { projectId, step: rawStep } = await params;
    if (!isPipelineStep(rawStep)) {
      throw new ValidationError("Unknown pipeline step.");
    }
    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      recoverStalePipelineStep(database, {
        projectId,
        staleRunMs: env.staleRunMs,
        step: rawStep,
        userId: user.id,
      });
      return true;
    });
    if (!result) {
      return jsonError("AUTH_REQUIRED", "Sign in to recover this step.", 401);
    }
    return NextResponse.json({ recovered: true });
  } catch (error) {
    return errorResponse(error);
  }
}
