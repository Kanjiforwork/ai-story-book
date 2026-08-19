import { NextResponse } from "next/server";

import { errorResponse, jsonError } from "@/server/api";
import { selectGenerationRun } from "@/server/generation-run-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> },
) {
  try {
    const { projectId, runId } = await params;
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      return selectGenerationRun(database, {
        generationRunId: runId,
        projectId,
        userId: user.id,
      });
    });
    if (!result) {
      return jsonError(
        "AUTH_REQUIRED",
        "Sign in to select a generation run.",
        401,
      );
    }
    return NextResponse.json({ run: result });
  } catch (error) {
    return errorResponse(error);
  }
}
