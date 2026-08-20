import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { loadServerEnv } from "@/server/env";
import { readBookText } from "@/server/book-text";

const DATABASE_FILENAME = "gradion.sqlite";
const CURRENT_SCHEMA_VERSION = 6;

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
        .run("2", "schema_version");
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
        .run("3", "schema_version");
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
        .run("4", "schema_version");
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
        .run("5", "schema_version");
    });

    migrateToVersionFive();
  }

  if (currentVersion < 6) {
    const migrateToVersionSix = database.transaction(() => {
      const hasTable = (tableName: string): boolean =>
        Boolean(
          database
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            )
            .get(tableName),
        );
      if (!hasTable("projects") || !hasTable("project_steps")) {
        database
          .prepare("UPDATE schema_meta SET value = ? WHERE key = ?")
          .run(String(CURRENT_SCHEMA_VERSION), "schema_version");
        return;
      }

      const projectColumns = database
        .prepare("PRAGMA table_info(projects)")
        .all() as Array<{ name: string }>;
      const hasProjectColumn = (columnName: string): boolean =>
        projectColumns.some((column) => column.name === columnName);
      database.exec(`
        ${hasProjectColumn("style_text") ? "" : "ALTER TABLE projects ADD COLUMN style_text TEXT;"}
        ALTER TABLE projects ADD COLUMN source_snapshot_hash TEXT;
        ALTER TABLE projects ADD COLUMN active_generation_run_id TEXT;

        CREATE TABLE generation_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          source_snapshot_hash TEXT NOT NULL,
          style_text TEXT,
          style_revision TEXT,
          prompt_version TEXT NOT NULL,
          text_model_id TEXT,
          image_model_id TEXT,
          root_interaction_id TEXT,
          status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'COMPLETED')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE INDEX generation_runs_project_created_idx
          ON generation_runs(project_id, created_at DESC);
      `);

      const projects = database
        .prepare(
          `SELECT id, book_text_key, style_text, created_at, updated_at
           FROM projects
           ORDER BY created_at ASC, id ASC`,
        )
        .all() as Array<{
        id: string;
        book_text_key: string;
        style_text: string | null;
        created_at: string;
        updated_at: string;
      }>;

      const insertRun = database.prepare(
        `INSERT INTO generation_runs
          (id, project_id, source_snapshot_hash, style_text, style_revision,
           prompt_version, text_model_id, image_model_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const updateProject = database.prepare(
        `UPDATE projects
         SET source_snapshot_hash = ?, active_generation_run_id = ?, updated_at = ?
         WHERE id = ?`,
      );

      for (const project of projects) {
        let sourceSnapshotHash: string;
        try {
          sourceSnapshotHash = crypto
            .createHash("sha256")
            .update(
              readBookText(
                path.dirname(path.resolve(database.name)),
                project.book_text_key,
              ),
            )
            .digest("hex");
        } catch {
          sourceSnapshotHash = crypto
            .createHash("sha256")
            .update(project.book_text_key)
            .digest("hex");
        }

        const runId = randomUUID();
        const styleRevision = project.style_text
          ? crypto.createHash("sha256").update(project.style_text).digest("hex")
          : null;
        const statuses = database
          .prepare(
            `SELECT status FROM project_steps WHERE project_id = ? ORDER BY position ASC`,
          )
          .all(project.id) as Array<{ status: string }>;
        const completed =
          statuses.length > 0 &&
          statuses.every((step) => step.status === "COMPLETED");
        insertRun.run(
          runId,
          project.id,
          sourceSnapshotHash,
          project.style_text,
          styleRevision,
          "book-illustration-v1",
          null,
          null,
          completed ? "COMPLETED" : "ACTIVE",
          project.created_at,
          project.updated_at,
        );
        updateProject.run(
          sourceSnapshotHash,
          runId,
          project.updated_at,
          project.id,
        );
      }

      database.exec(`
        ALTER TABLE project_steps RENAME TO project_steps_legacy;
        CREATE TABLE project_steps (
          generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          step_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'FAILED', 'COMPLETED')),
          active_run_id TEXT,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          claimed_at TEXT,
          heartbeat_at TEXT,
          error_code TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (generation_run_id, step_key),
          UNIQUE (generation_run_id, position)
        );
        INSERT INTO project_steps
          (generation_run_id, project_id, step_key, position, status, active_run_id,
           attempt_count, claimed_at, heartbeat_at, error_code, error_message, created_at, updated_at)
        SELECT gr.id, legacy.project_id, legacy.step_key, legacy.position, legacy.status,
          legacy.active_run_id, legacy.attempt_count, legacy.claimed_at, legacy.heartbeat_at,
          legacy.error_code, legacy.error_message, legacy.created_at, legacy.updated_at
        FROM project_steps_legacy legacy
        INNER JOIN generation_runs gr ON gr.project_id = legacy.project_id;
        CREATE INDEX project_steps_run_position_idx
          ON project_steps(generation_run_id, position);
        DROP TABLE project_steps_legacy;

        ALTER TABLE assets RENAME TO assets_legacy;
        CREATE TABLE assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('PORTRAIT', 'ILLUSTRATION')),
          storage_key TEXT NOT NULL UNIQUE,
          mime_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO assets
          (id, project_id, generation_run_id, kind, storage_key, mime_type, byte_size, checksum, created_at, updated_at)
        SELECT legacy.id, legacy.project_id, gr.id, legacy.kind, legacy.storage_key,
          legacy.mime_type, legacy.byte_size, legacy.checksum, legacy.created_at, legacy.updated_at
        FROM assets_legacy legacy
        INNER JOIN generation_runs gr ON gr.project_id = legacy.project_id;
        CREATE INDEX assets_run_kind_idx
          ON assets(generation_run_id, kind, created_at ASC);

        ALTER TABLE characters RENAME TO characters_legacy;
        CREATE TABLE characters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          portrait_status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK (portrait_status IN ('PENDING', 'RUNNING', 'FAILED', 'COMPLETED')),
          portrait_active_run_id TEXT,
          portrait_attempt_count INTEGER NOT NULL DEFAULT 0,
          portrait_claimed_at TEXT,
          portrait_heartbeat_at TEXT,
          portrait_error_code TEXT,
          portrait_error_message TEXT,
          portrait_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (generation_run_id, position)
        );
        INSERT INTO characters
          (id, project_id, generation_run_id, position, name, prompt, portrait_status,
           portrait_active_run_id, portrait_attempt_count, portrait_claimed_at, portrait_heartbeat_at,
           portrait_error_code, portrait_error_message, portrait_asset_id, created_at, updated_at)
        SELECT legacy.id, legacy.project_id, gr.id, legacy.position, legacy.name, legacy.prompt,
          legacy.portrait_status, legacy.portrait_active_run_id, legacy.portrait_attempt_count,
          legacy.portrait_claimed_at, legacy.portrait_heartbeat_at, legacy.portrait_error_code,
          legacy.portrait_error_message, legacy.portrait_asset_id, legacy.created_at, legacy.updated_at
        FROM characters_legacy legacy
        INNER JOIN generation_runs gr ON gr.project_id = legacy.project_id;
        CREATE INDEX characters_run_position_idx
          ON characters(generation_run_id, position);
        DROP TABLE characters_legacy;

        ALTER TABLE chapters RENAME TO chapters_legacy;
        CREATE TABLE chapters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
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
          UNIQUE (generation_run_id, position)
        );
        INSERT INTO chapters
          (id, project_id, generation_run_id, position, name, prompt, illustration_status,
           illustration_active_run_id, illustration_attempt_count, illustration_claimed_at,
           illustration_heartbeat_at, illustration_error_code, illustration_error_message,
           illustration_asset_id, created_at, updated_at)
        SELECT legacy.id, legacy.project_id, gr.id, legacy.position, legacy.name, legacy.prompt,
          legacy.illustration_status, legacy.illustration_active_run_id, legacy.illustration_attempt_count,
          legacy.illustration_claimed_at, legacy.illustration_heartbeat_at, legacy.illustration_error_code,
          legacy.illustration_error_message, legacy.illustration_asset_id, legacy.created_at, legacy.updated_at
        FROM chapters_legacy legacy
        INNER JOIN generation_runs gr ON gr.project_id = legacy.project_id;
        CREATE INDEX chapters_run_position_idx
          ON chapters(generation_run_id, position);
        DROP TABLE chapters_legacy;
        DROP TABLE assets_legacy;

        ALTER TABLE pipeline_runs RENAME TO pipeline_runs_legacy;
        CREATE TABLE pipeline_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
          step_key TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('RUNNING', 'FAILED', 'COMPLETED')),
          claimed_at TEXT NOT NULL,
          heartbeat_at TEXT NOT NULL,
          finished_at TEXT,
          error_code TEXT,
          error_message TEXT,
          input_fingerprint TEXT,
          UNIQUE (generation_run_id, step_key, attempt)
        );
        INSERT INTO pipeline_runs
          (id, project_id, generation_run_id, step_key, attempt, status, claimed_at,
           heartbeat_at, finished_at, error_code, error_message)
        SELECT legacy.id, legacy.project_id, gr.id, legacy.step_key, legacy.attempt,
          legacy.status, legacy.claimed_at, legacy.heartbeat_at, legacy.finished_at,
          legacy.error_code, legacy.error_message
        FROM pipeline_runs_legacy legacy
        INNER JOIN generation_runs gr ON gr.project_id = legacy.project_id;
        CREATE INDEX pipeline_runs_run_step_idx
          ON pipeline_runs(generation_run_id, step_key, claimed_at DESC);
        DROP TABLE pipeline_runs_legacy;

        ALTER TABLE gemini_interactions RENAME TO gemini_interactions_legacy;
        CREATE TABLE gemini_interactions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
          step_key TEXT NOT NULL,
          interaction_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          previous_interaction_id TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (generation_run_id, step_key, interaction_id)
        );
        INSERT INTO gemini_interactions
          (id, project_id, generation_run_id, step_key, interaction_id, model_id,
           previous_interaction_id, created_at)
        SELECT legacy.id, legacy.project_id, gr.id, legacy.step_key, legacy.interaction_id,
          legacy.model_id, legacy.previous_interaction_id, legacy.created_at
        FROM gemini_interactions_legacy legacy
        INNER JOIN generation_runs gr ON gr.project_id = legacy.project_id;
        CREATE INDEX gemini_interactions_run_step_idx
          ON gemini_interactions(generation_run_id, step_key, created_at ASC);
        DROP TABLE gemini_interactions_legacy;
      `);

      database
        .prepare("UPDATE schema_meta SET value = ? WHERE key = ?")
        .run(String(CURRENT_SCHEMA_VERSION), "schema_version");
    });

    migrateToVersionSix();
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
