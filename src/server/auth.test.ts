import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createUserSession,
  findUserBySessionToken,
  hashSessionToken,
  revokeSession,
} from "@/server/auth";
import { getAuthenticatedUser } from "@/server/request-auth";
import { openDatabase } from "@/server/storage";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("passwordless session persistence", () => {
  it("stores only the token hash and supports explicit revocation", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-auth-test-"),
    );
    temporaryDirectories.push(directory);
    const database = openDatabase(path.join(directory, "data"));

    const first = createUserSession(database, {
      email: "mira@example.com",
      name: "Mira Hassan",
    });
    const second = createUserSession(database, {
      email: "mira@example.com",
      name: "Mira Updated",
    });

    expect(first.user.id).toBe(second.user.id);
    expect(findUserBySessionToken(database, first.token)?.email).toBe(
      "mira@example.com",
    );
    expect(
      database
        .prepare("SELECT token_hash FROM sessions WHERE token_hash = ?")
        .get(first.token),
    ).toBeUndefined();
    expect(
      database
        .prepare("SELECT token_hash FROM sessions WHERE token_hash = ?")
        .get(hashSessionToken(first.token)),
    ).toBeTruthy();

    revokeSession(database, first.token);
    expect(findUserBySessionToken(database, first.token)).toBeNull();
    database.close();
  });

  it("treats malformed cookie encoding as an anonymous request", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-auth-cookie-test-"),
    );
    temporaryDirectories.push(directory);
    const database = openDatabase(path.join(directory, "data"));

    const request = new Request("http://localhost/api/projects", {
      headers: { cookie: "gradion_session=%E0%A4%A" },
    });

    expect(() => getAuthenticatedUser(database, request)).not.toThrow();
    expect(getAuthenticatedUser(database, request)).toBeNull();
    database.close();
  });
});
