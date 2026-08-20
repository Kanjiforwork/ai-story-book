import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserMock, getOwnedAssetFileMock, withDatabaseMock } =
  vi.hoisted(() => ({
    getAuthenticatedUserMock: vi.fn(),
    getOwnedAssetFileMock: vi.fn(),
    withDatabaseMock: vi.fn(),
  }));

vi.mock("@/server/env", () => ({
  loadServerEnv: () => ({ dataDir: "/tmp/gradion-assets" }),
}));
vi.mock("@/server/request-auth", () => ({
  getAuthenticatedUser: getAuthenticatedUserMock,
}));
vi.mock("@/server/asset-service", () => ({
  getOwnedAssetFile: getOwnedAssetFileMock,
}));
vi.mock("@/server/storage", () => ({
  withDatabase: withDatabaseMock,
}));

import { GET } from "./route";

const temporaryDirectories: string[] = [];

beforeEach(() => {
  getAuthenticatedUserMock.mockReset();
  getOwnedAssetFileMock.mockReset();
  withDatabaseMock.mockReset();
  withDatabaseMock.mockImplementation(
    (callback: (database: unknown) => unknown) => callback({}),
  );
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("authenticated asset route", () => {
  it("prevents private assets from surviving an application identity change in browser cache", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-asset-route-"),
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "portrait.png");
    fs.writeFileSync(filePath, Buffer.from("png-bytes"));
    getAuthenticatedUserMock.mockReturnValue({ id: "owner-1" });
    getOwnedAssetFileMock.mockReturnValue({
      filePath,
      mimeType: "image/png",
    });

    const response = await GET(new Request("http://localhost/api/assets/a1"), {
      params: Promise.resolve({ assetId: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("does not read an asset when the request is unauthenticated", async () => {
    getAuthenticatedUserMock.mockReturnValue(null);

    const response = await GET(new Request("http://localhost/api/assets/a1"), {
      params: Promise.resolve({ assetId: "a1" }),
    });

    expect(response.status).toBe(401);
    expect(getOwnedAssetFileMock).not.toHaveBeenCalled();
  });
});
