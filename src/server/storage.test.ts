import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

    expect(row?.value).toBe("3");
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
        .get("pipeline_runs"),
    ).toBeTruthy();
    expect(fs.existsSync(path.join(directory, "data", "gradion.sqlite"))).toBe(
      true,
    );
    database.close();
  });
});
