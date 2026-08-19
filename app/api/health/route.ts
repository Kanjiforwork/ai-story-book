import { NextResponse } from "next/server";

import { openDatabase } from "@/server/storage";

export const runtime = "nodejs";

export function GET() {
  let database: ReturnType<typeof openDatabase> | undefined;

  try {
    database = openDatabase();
    database.prepare("SELECT 1 AS healthy").get();

    return NextResponse.json({
      database: "ok",
      service: "gradion-book-illustration-studio",
      status: "ok",
    });
  } catch (error) {
    console.error(
      "Health check failed",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      {
        database: "error",
        service: "gradion-book-illustration-studio",
        status: "error",
      },
      { status: 503 },
    );
  } finally {
    database?.close();
  }
}
