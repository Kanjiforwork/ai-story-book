import { createHash, randomBytes, randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

export const SESSION_COOKIE_NAME = "gradion_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};

type UserRow = AuthenticatedUser & {
  expires_at: string;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createUserSession(
  database: Database.Database,
  input: { name: string; email: string },
): { token: string; user: AuthenticatedUser } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const timestamp = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();

  const createSession = database.transaction(() => {
    const existingUser = database
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(input.email) as { id: string } | undefined;
    const userId = existingUser?.id ?? randomUUID();

    if (existingUser) {
      database
        .prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
        .run(input.name, timestamp, userId);
    } else {
      database
        .prepare(
          "INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(userId, input.email, input.name, timestamp, timestamp);
    }

    database
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(tokenHash, userId, timestamp, timestamp, expiresAt);

    return database
      .prepare("SELECT id, name, email FROM users WHERE id = ?")
      .get(userId) as AuthenticatedUser;
  });

  return { token, user: createSession() };
}

export function findUserBySessionToken(
  database: Database.Database,
  token: string | undefined,
): AuthenticatedUser | null {
  if (!token) return null;

  const now = new Date().toISOString();
  const tokenHash = hashSessionToken(token);
  const row = database
    .prepare(
      `
        SELECT u.id, u.name, u.email, s.expires_at
        FROM sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL
      `,
    )
    .get(tokenHash) as UserRow | undefined;

  if (!row) return null;
  if (row.expires_at <= now) {
    database
      .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?")
      .run(now, tokenHash);
    return null;
  }

  database
    .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
    .run(now, tokenHash);

  return { id: row.id, name: row.name, email: row.email };
}

export function revokeSession(
  database: Database.Database,
  token: string | undefined,
): void {
  if (!token) return;
  database
    .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?")
    .run(new Date().toISOString(), hashSessionToken(token));
}
