import { NextResponse } from "next/server";

import {
  normalizeEmail,
  normalizeName,
  ValidationError,
} from "@/domain/validation";
import {
  createUserSession,
  revokeSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/server/auth";
import { errorResponse } from "@/server/api";
import { getSessionToken } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      throw new ValidationError("Send a valid JSON identity payload.");
    }
    if (!parsedBody || typeof parsedBody !== "object") {
      throw new ValidationError("Send a valid JSON identity payload.");
    }
    const body = parsedBody as Record<string, unknown>;
    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const result = withDatabase((database) =>
      createUserSession(database, { name, email }),
    );
    const response = NextResponse.json({ user: result.user });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    withDatabase((database) =>
      revokeSession(database, getSessionToken(request)),
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
