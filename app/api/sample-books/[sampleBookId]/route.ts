import { NextResponse } from "next/server";

import { errorResponse } from "@/server/api";
import { loadSampleBook } from "@/server/sample-books";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sampleBookId: string }> },
) {
  try {
    const { sampleBookId } = await params;
    const sample = loadSampleBook(sampleBookId);
    return NextResponse.json(sample, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
