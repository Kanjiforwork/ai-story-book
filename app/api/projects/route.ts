import { NextResponse } from "next/server";

import { jsonError, errorResponse } from "@/server/api";
import { parseProjectInput } from "@/server/project-input";
import { createProject, listProjects } from "@/server/project-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";
import { loadServerEnv } from "@/server/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      return listProjects(database, user.id);
    });
    if (!result)
      return jsonError("AUTH_REQUIRED", "Sign in to view projects.", 401);
    return NextResponse.json({ projects: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseProjectInput(request);
    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      return createProject(database, {
        bookText: input.bookText,
        dataDir: env.dataDir,
        title: input.title,
        userId: user.id,
      });
    });
    if (!result)
      return jsonError("AUTH_REQUIRED", "Sign in to create a project.", 401);
    return NextResponse.json({ project: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
