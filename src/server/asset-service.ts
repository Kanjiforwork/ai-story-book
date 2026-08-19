import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

const ASSET_DIRECTORY = "assets";
const ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ASSET_KEY_PATTERN =
  /^assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$/;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type AssetRow = {
  byte_size: number;
  id: string;
  mime_type: string;
  storage_key: string;
};

export type StoredImageAsset = {
  byteSize: number;
  checksum: string;
  filePath: string;
  id: string;
  mimeType: string;
  storageKey: string;
};

export type OwnedAssetFile = {
  byteSize: number;
  filePath: string;
  id: string;
  mimeType: string;
};

export class AssetError extends Error {
  readonly code = "ASSET_WRITE_FAILED" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AssetError";
  }
}

function resolveDataRoot(dataDir: string): string {
  const root = path.resolve(dataDir);
  if (root === path.parse(root).root || root.includes("\0")) {
    throw new AssetError("The application data directory is invalid.");
  }
  return root;
}

export function resolveStoredAssetPath(
  dataDir: string,
  storageKey: string,
): string {
  if (!ASSET_KEY_PATTERN.test(storageKey)) {
    throw new AssetError("The generated asset key is invalid.");
  }

  const root = resolveDataRoot(dataDir);
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new AssetError(
      "The generated asset path escaped the data directory.",
    );
  }
  return resolved;
}

function extensionForMimeType(mimeType: string): string {
  const extension = IMAGE_EXTENSIONS[mimeType.toLowerCase()];
  if (!extension) {
    throw new AssetError("Gemini returned an unsupported portrait image type.");
  }
  return extension;
}

export function writeImageAsset(
  dataDir: string,
  input: { bytes: Buffer; mimeType: string },
): StoredImageAsset {
  if (input.bytes.length === 0) {
    throw new AssetError("Gemini returned an empty portrait image.");
  }

  const root = resolveDataRoot(dataDir);
  const directory = path.join(root, ASSET_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  const id = crypto.randomUUID();
  const extension = extensionForMimeType(input.mimeType);
  const storageKey = `${ASSET_DIRECTORY}/${id}.${extension}`;
  const filePath = resolveStoredAssetPath(root, storageKey);
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const fileDescriptor = fs.openSync(temporaryPath, "wx", 0o600);

  try {
    fs.writeFileSync(fileDescriptor, input.bytes);
    fs.fsyncSync(fileDescriptor);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw new AssetError("The portrait image could not be written.", {
      cause: error,
    });
  } finally {
    fs.closeSync(fileDescriptor);
  }

  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw new AssetError("The portrait image could not be finalized.", {
      cause: error,
    });
  }

  return {
    byteSize: input.bytes.byteLength,
    checksum: crypto.createHash("sha256").update(input.bytes).digest("hex"),
    filePath,
    id,
    mimeType: input.mimeType,
    storageKey,
  };
}

export function removeImageAsset(asset: StoredImageAsset): void {
  fs.rmSync(asset.filePath, { force: true });
}

function isSafeAssetId(assetId: string): boolean {
  return ASSET_ID_PATTERN.test(assetId);
}

export function getOwnedAssetFile(
  database: Database.Database,
  input: { assetId: string; dataDir: string; userId: string },
): OwnedAssetFile | null {
  if (!isSafeAssetId(input.assetId)) return null;

  const row = database
    .prepare(
      `
        SELECT a.id, a.storage_key, a.mime_type, a.byte_size
        FROM assets a
        INNER JOIN projects p ON p.id = a.project_id
        WHERE a.id = ? AND p.user_id = ?
      `,
    )
    .get(input.assetId, input.userId) as AssetRow | undefined;
  if (!row) return null;

  let filePath: string;
  try {
    filePath = resolveStoredAssetPath(input.dataDir, row.storage_key);
    const stats = fs.lstatSync(filePath);
    if (!stats.isFile()) return null;
    const realPath = fs.realpathSync(filePath);
    const root = fs.realpathSync(resolveDataRoot(input.dataDir));
    if (!realPath.startsWith(`${root}${path.sep}`)) return null;
  } catch {
    return null;
  }

  return {
    byteSize: row.byte_size,
    filePath,
    id: row.id,
    mimeType: row.mime_type,
  };
}

export function getProjectAssetFile(
  database: Database.Database,
  input: {
    assetId: string;
    dataDir: string;
    projectId: string;
    generationRunId: string;
  },
): OwnedAssetFile | null {
  if (!isSafeAssetId(input.assetId)) return null;

  const row = database
    .prepare(
      `
        SELECT a.id, a.storage_key, a.mime_type, a.byte_size
        FROM assets a
        WHERE a.id = ? AND a.project_id = ?
          AND a.generation_run_id = ?
      `,
    )
    .get(input.assetId, input.projectId, input.generationRunId) as
    AssetRow | undefined;
  if (!row) return null;

  let filePath: string;
  try {
    filePath = resolveStoredAssetPath(input.dataDir, row.storage_key);
    const stats = fs.lstatSync(filePath);
    if (!stats.isFile()) return null;
    const realPath = fs.realpathSync(filePath);
    const root = fs.realpathSync(resolveDataRoot(input.dataDir));
    if (!realPath.startsWith(`${root}${path.sep}`)) return null;
  } catch {
    return null;
  }

  return {
    byteSize: row.byte_size,
    filePath,
    id: row.id,
    mimeType: row.mime_type,
  };
}
