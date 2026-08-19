import { NextResponse } from "next/server";

import { ValidationError } from "@/domain/validation";
import { GeminiError } from "@/server/gemini";
import { GeminiOutputError } from "@/server/gemini-output";
import { PipelineStateError } from "@/server/pipeline-service";

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "STEP_ORDER"
  | "STEP_ALREADY_COMPLETED"
  | "RUN_ALREADY_ACTIVE"
  | "STALE_RUN"
  | "STEP_NOT_AVAILABLE"
  | "GEMINI_FAILED"
  | "GEMINI_INVALID_OUTPUT"
  | "INTERNAL_ERROR";

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ code, message }, { status });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return jsonError("VALIDATION", error.message, 400);
  }
  if (error instanceof PipelineStateError) {
    const status = error.code === "NOT_FOUND" ? 404 : 409;
    return jsonError(error.code, error.message, status);
  }
  if (error instanceof GeminiOutputError) {
    return jsonError(error.code, error.message, 502);
  }
  if (error instanceof GeminiError) {
    return jsonError(error.code, error.message, 502);
  }
  console.error(
    "API request failed",
    error instanceof Error ? error.message : error,
  );
  return jsonError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}
