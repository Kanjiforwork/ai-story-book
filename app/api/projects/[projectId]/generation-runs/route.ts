import { NextResponse } from "next/server";

import { ValidationError } from "@/domain/validation";
import { errorResponse, jsonError } from "@/server/api";
import {
  createGenerationRun,
  listGenerationRuns,
} from "@/server/generation-run-service";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Send a valid generation run payload.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Send a valid generation run payload.");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return { kind: "unauthenticated" as const };
      const runs = listGenerationRuns(database, user.id, projectId);
      if (!runs) return { kind: "not_found" as const };
      return { kind: "ok" as const, runs };
    });
    if (result.kind === "unauthenticated") {
      return jsonError(
        "AUTH_REQUIRED",
        "Sign in to view generation runs.",
        401,
      );
    }
    if (result.kind === "not_found") {
      return jsonError("NOT_FOUND", "Project not found.", 404);
    }
    return NextResponse.json({ runs: result.runs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const body = await readBody(request);
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return null;
      return createGenerationRun(database, {
        projectId,
        style: body.style,
        userId: user.id,
      });
    });
    if (!result) {
      return jsonError(
        "AUTH_REQUIRED",
        "Sign in to create a generation run.",
        401,
      );
    }
    return NextResponse.json({ run: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
