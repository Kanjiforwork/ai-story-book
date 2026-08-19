import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { loadServerEnv } from "@/server/env";

const DATABASE_FILENAME = "gradion.sqlite";
const CURRENT_SCHEMA_VERSION = 2;

export function ensureDataDirectory(dataDir?: string): string {
  const resolved = path.resolve(
    /* turbopackIgnore: true */ dataDir ?? loadServerEnv().dataDir,
  );
  const root = path.parse(resolved).root;

  if (resolved === root || resolved.includes("\0")) {
    throw new Error("The application data directory must be a non-root path.");
  }

  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  return resolved;
}

export function openDatabase(dataDir?: string): Database.Database {
  const directory = ensureDataDirectory(dataDir);
  const database = new Database(path.join(directory, DATABASE_FILENAME));

  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  database
    .prepare(
      "INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    )
    .run("schema_version", "1");

  const currentVersion = Number(
    (
      database
        .prepare("SELECT value FROM schema_meta WHERE key = ?")
        .get("schema_version") as { value: string } | undefined
    )?.value ?? 0,
  );

  if (currentVersion < 2) {
    const migrateToVersionTwo = database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT
        );

        CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          book_text_key TEXT NOT NULL,
          book_text_characters INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS projects_user_created_idx
          ON projects(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS project_steps (
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          step_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'FAILED', 'COMPLETED')),
          error_code TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (project_id, step_key),
          UNIQUE (project_id, position)
        );

        CREATE INDEX IF NOT EXISTS project_steps_project_position_idx
          ON project_steps(project_id, position);
      `);

      database
        .prepare("UPDATE schema_meta SET value = ? WHERE key = ?")
        .run(String(CURRENT_SCHEMA_VERSION), "schema_version");
    });

    migrateToVersionTwo();
  }

  return database;
}

export function withDatabase<T>(
  callback: (database: Database.Database) => T,
): T {
  const database = openDatabase();
  try {
    return callback(database);
  } finally {
    database.close();
  }
}
