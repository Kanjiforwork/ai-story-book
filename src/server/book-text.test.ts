import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeBookText,
  readBookText,
  writeBookTextAtomically,
} from "@/server/book-text";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("book text storage", () => {
  it("normalizes line endings and writes an opaque text key", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-book-text-test-"),
    );
    temporaryDirectories.push(directory);

    const text = normalizeBookText("First line\r\nSecond line");
    const key = writeBookTextAtomically(directory, text);

    expect(key).toMatch(/^books\/[0-9a-f-]+\.txt$/);
    expect(readBookText(directory, key)).toBe("First line\nSecond line");
  });

  it("rejects traversal and missing text", () => {
    expect(() => normalizeBookText("  \n\t")).toThrow(/required/);
    expect(() => readBookText("/tmp", "books/../../secret.txt")).toThrow(
      /Invalid book text asset key/,
    );
  });
});
