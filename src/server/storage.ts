import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { loadServerEnv } from "@/server/env";

const DATABASE_FILENAME = "gradion.sqlite";

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

  return database;
}
