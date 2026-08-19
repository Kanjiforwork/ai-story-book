import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createUserSession } from "@/server/auth";
import {
  getOwnedAssetFile,
  resolveStoredAssetPath,
  writeImageAsset,
} from "@/server/asset-service";
import { createProject } from "@/server/project-service";
import { openDatabase } from "@/server/storage";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("generated asset security", () => {
  it("streams only an owned generated asset and rejects traversal keys", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-asset-test-"),
    );
    temporaryDirectories.push(directory);
    const dataDir = path.join(directory, "data");
    const database = openDatabase(dataDir);
    const owner = createUserSession(database, {
      email: "owner@example.com",
      name: "Owner",
    }).user;
    const foreignUser = createUserSession(database, {
      email: "foreign@example.com",
      name: "Foreign",
    }).user;
    const project = createProject(database, {
      bookText: "A book with a portrait.",
      dataDir,
      title: "Portrait security",
      userId: owner.id,
    });
    const asset = writeImageAsset(dataDir, {
      bytes: Buffer.from("png-bytes"),
      mimeType: "image/png",
    });
    const timestamp = new Date().toISOString();
    database
      .prepare(
        `
          INSERT INTO assets
            (id, project_id, kind, storage_key, mime_type, byte_size, checksum, created_at, updated_at)
          VALUES (?, ?, 'PORTRAIT', ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        asset.id,
        project.id,
        asset.storageKey,
        asset.mimeType,
        asset.byteSize,
        asset.checksum,
        timestamp,
        timestamp,
      );

    const owned = getOwnedAssetFile(database, {
      assetId: asset.id,
      dataDir,
      userId: owner.id,
    });
    expect(owned).toEqual(
      expect.objectContaining({
        id: asset.id,
        mimeType: "image/png",
      }),
    );
    expect(fs.readFileSync(owned!.filePath)).toEqual(Buffer.from("png-bytes"));
    expect(
      getOwnedAssetFile(database, {
        assetId: asset.id,
        dataDir,
        userId: foreignUser.id,
      }),
    ).toBeNull();
    expect(
      getOwnedAssetFile(database, {
        assetId: "../../books/secret.txt",
        dataDir,
        userId: owner.id,
      }),
    ).toBeNull();
    expect(() =>
      resolveStoredAssetPath(dataDir, "assets/../../secret.txt"),
    ).toThrow(/asset key is invalid/);
    database.close();
  });
});
