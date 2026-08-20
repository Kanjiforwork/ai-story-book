import fs from "node:fs";

import { NextResponse } from "next/server";

import { jsonError, errorResponse } from "@/server/api";
import { getOwnedAssetFile } from "@/server/asset-service";
import { loadServerEnv } from "@/server/env";
import { getAuthenticatedUser } from "@/server/request-auth";
import { withDatabase } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const env = loadServerEnv();
    const result = withDatabase((database) => {
      const user = getAuthenticatedUser(database, request);
      if (!user) return { kind: "unauthenticated" as const };
      const asset = getOwnedAssetFile(database, {
        assetId,
        dataDir: env.dataDir,
        userId: user.id,
      });
      if (!asset) return { kind: "not_found" as const };
      return { asset, kind: "ok" as const };
    });

    if (result.kind === "unauthenticated") {
      return jsonError("AUTH_REQUIRED", "Sign in to view this asset.", 401);
    }
    if (result.kind === "not_found") {
      return jsonError("NOT_FOUND", "Asset not found.", 404);
    }

    const bytes = fs.readFileSync(result.asset.filePath);
    return new NextResponse(bytes, {
      headers: {
        "cache-control": "private, no-store",
        "content-length": String(bytes.byteLength),
        "content-type": result.asset.mimeType,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
