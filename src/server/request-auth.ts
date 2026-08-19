import type Database from "better-sqlite3";

import { SESSION_COOKIE_NAME, findUserBySessionToken } from "@/server/auth";

function readCookieHeader(
  cookieHeader: string | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function getAuthenticatedUser(
  database: Database.Database,
  request: Request,
) {
  return findUserBySessionToken(
    database,
    readCookieHeader(request.headers.get("cookie"), SESSION_COOKIE_NAME),
  );
}
