import type Database from "better-sqlite3";

import { SESSION_COOKIE_NAME, findUserBySessionToken } from "@/server/auth";

export function readCookieValue(
  cookieHeader: string | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function getSessionToken(request: Request): string | undefined {
  return readCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
}

export function getAuthenticatedUser(
  database: Database.Database,
  request: Request,
) {
  return findUserBySessionToken(database, getSessionToken(request));
}
