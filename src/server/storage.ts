import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { loadServerEnv } from "@/server/env";

const DATABASE_FILENAME = "gradion.sqlite";
const CURRENT_SCHEMA_VERSION = 5;

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

  if (currentVersion < 3) {
    const migrateToVersionThree = database.transaction(() => {
      database.exec(`
        ALTER TABLE projects ADD COLUMN gemini_file_name TEXT;
        ALTER TABLE projects ADD COLUMN gemini_file_uri TEXT;
        ALTER TABLE projects ADD COLUMN gemini_context_interaction_id TEXT;
        ALTER TABLE projects ADD COLUMN style_text TEXT;

        ALTER TABLE project_steps ADD COLUMN active_run_id TEXT;
        ALTER TABLE project_steps ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE project_steps ADD COLUMN claimed_at TEXT;
        ALTER TABLE project_steps ADD COLUMN heartbeat_at TEXT;

        CREATE TABLE IF NOT EXISTS pipeline_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          step_key TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('RUNNING', 'FAILED', 'COMPLETED')),
          claimed_at TEXT NOT NULL,
          heartbeat_at TEXT NOT NULL,
          finished_at TEXT,
          error_code TEXT,
          error_message TEXT,
          UNIQUE (project_id, step_key, attempt)
        );

        CREATE INDEX IF NOT EXISTS pipeline_runs_project_step_idx
          ON pipeline_runs(project_id, step_key, claimed_at DESC);

        CREATE TABLE IF NOT EXISTS gemini_interactions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          step_key TEXT NOT NULL,
          interaction_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          previous_interaction_id TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (project_id, step_key, interaction_id)
        );

        CREATE INDEX IF NOT EXISTS gemini_interactions_project_step_idx
          ON gemini_interactions(project_id, step_key, created_at ASC);

        CREATE TABLE IF NOT EXISTS characters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (project_id, position)
        );

        CREATE INDEX IF NOT EXISTS characters_project_position_idx
          ON characters(project_id, position);
      `);

      database
        .prepare("UPDATE schema_meta SET value = ? WHERE key = ?")
        .run(String(CURRENT_SCHEMA_VERSION), "schema_version");
    });

    migrateToVersionThree();
  }

  if (currentVersion < 4) {
    const migrateToVersionFour = database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('PORTRAIT', 'ILLUSTRATION')),
          storage_key TEXT NOT NULL UNIQUE,
          mime_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS assets_project_kind_idx
          ON assets(project_id, kind, created_at ASC);

        ALTER TABLE characters ADD COLUMN portrait_status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (portrait_status IN ('PENDING', 'RUNNING', 'FAILED', 'COMPLETED'));
        ALTER TABLE characters ADD COLUMN portrait_active_run_id TEXT;
        ALTER TABLE characters ADD COLUMN portrait_attempt_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE characters ADD COLUMN portrait_claimed_at TEXT;
        ALTER TABLE characters ADD COLUMN portrait_heartbeat_at TEXT;
        ALTER TABLE characters ADD COLUMN portrait_error_code TEXT;
        ALTER TABLE characters ADD COLUMN portrait_error_message TEXT;
        ALTER TABLE characters ADD COLUMN portrait_asset_id TEXT
          REFERENCES assets(id) ON DELETE SET NULL;

        CREATE INDEX IF NOT EXISTS characters_portrait_status_idx
          ON characters(project_id, portrait_status);
      `);

      database
        .prepare("UPDATE schema_meta SET value = ? WHERE key = ?")
        .run(String(CURRENT_SCHEMA_VERSION), "schema_version");
    });

    migrateToVersionFour();
  }

  if (currentVersion < 5) {
    const migrateToVersionFive = database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS chapters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          illustration_status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK (illustration_status IN ('PENDING', 'RUNNING', 'FAILED', 'COMPLETED')),
          illustration_active_run_id TEXT,
          illustration_attempt_count INTEGER NOT NULL DEFAULT 0,
          illustration_claimed_at TEXT,
          illustration_heartbeat_at TEXT,
          illustration_error_code TEXT,
          illustration_error_message TEXT,
          illustration_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (project_id, position)
        );

        CREATE INDEX IF NOT EXISTS chapters_project_position_idx
          ON chapters(project_id, position);

        CREATE INDEX IF NOT EXISTS chapters_illustration_status_idx
          ON chapters(project_id, illustration_status);
      `);

      database
        .prepare("UPDATE schema_meta SET value = ? WHERE key = ?")
        .run(String(CURRENT_SCHEMA_VERSION), "schema_version");
    });

    migrateToVersionFive();
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
