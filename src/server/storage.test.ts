import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/server/storage";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("local SQLite bootstrap", () => {
  it("creates the safe data directory and schema metadata", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-book-studio-"),
    );
    temporaryDirectories.push(directory);

    const database = openDatabase(path.join(directory, "data"));
    const row = database
      .prepare("SELECT value FROM schema_meta WHERE key = ?")
      .get("schema_version") as { value: string } | undefined;

    expect(row?.value).toBe("4");
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("project_steps"),
    ).toBeTruthy();
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("assets"),
    ).toBeTruthy();
    const portraitColumns = database
      .prepare("PRAGMA table_info(characters)")
      .all() as Array<{ name: string }>;
    expect(portraitColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "portrait_status",
        "portrait_attempt_count",
        "portrait_active_run_id",
        "portrait_asset_id",
      ]),
    );
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("pipeline_runs"),
    ).toBeTruthy();
    expect(fs.existsSync(path.join(directory, "data", "gradion.sqlite"))).toBe(
      true,
    );
    database.close();
  });

  it("upgrades a version three database with portrait metadata", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-book-studio-migration-"),
    );
    temporaryDirectories.push(directory);
    const dataDir = path.join(directory, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    const legacyDatabase = new Database(path.join(dataDir, "gradion.sqlite"));
    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '3');
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        book_text_key TEXT NOT NULL,
        book_text_characters INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE characters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (project_id, position)
      );
    `);
    legacyDatabase.close();

    const database = openDatabase(dataDir);
    expect(
      database
        .prepare("SELECT value FROM schema_meta WHERE key = ?")
        .get("schema_version"),
    ).toEqual({ value: "4" });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("assets"),
    ).toBeTruthy();
    expect(
      (
        database.prepare("PRAGMA table_info(characters)").all() as Array<{
          name: string;
        }>
      ).map((column) => column.name),
    ).toEqual(expect.arrayContaining(["portrait_status", "portrait_asset_id"]));
    database.close();
  });
});
