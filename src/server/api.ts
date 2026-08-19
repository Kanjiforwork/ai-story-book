import { NextResponse } from "next/server";

import { ValidationError } from "@/domain/validation";

export type ApiErrorCode =
  "AUTH_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "INTERNAL_ERROR";

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
  console.error(
    "API request failed",
    error instanceof Error ? error.message : error,
  );
  return jsonError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}
