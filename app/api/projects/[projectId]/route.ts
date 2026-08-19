import { NextResponse } from "next/server";

import { jsonError, errorResponse } from "@/server/api";
import { loadServerEnv } from "@/server/env";
import { getProjectDetail } from "@/server/project-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return { kind: "unauthenticated" as const };
      const project = getProjectDetail(
        database,
        user.id,
        projectId,
        env.dataDir,
        env.staleRunMs,
      );
      if (!project) return { kind: "not_found" as const };
      return { kind: "ok" as const, project };
    });

    if (result.kind === "unauthenticated") {
      return jsonError("AUTH_REQUIRED", "Sign in to view this project.", 401);
    }
    if (result.kind === "not_found") {
      return jsonError("NOT_FOUND", "Project not found.", 404);
    }
    return NextResponse.json({ project: result.project });
  } catch (error) {
    return errorResponse(error);
  }
}
