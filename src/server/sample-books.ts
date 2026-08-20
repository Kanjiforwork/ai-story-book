import fs from "node:fs";
import path from "node:path";

import { SAMPLE_BOOKS, type SampleBookId } from "@/domain/sample-books";
import { ValidationError } from "@/domain/validation";
import { normalizeBookText } from "@/server/book-text";

const SAMPLE_BOOK_SOURCES: Record<
  SampleBookId,
  { filename: string; storyStart: string }
> = {
  "a-christmas-carol": {
    filename: "a-christmas-carol.txt",
    storyStart: "STAVE I:  MARLEY'S GHOST",
  },
  "jekyll-and-hyde": {
    filename: "jekyll-and-hyde.txt",
    storyStart: "STORY OF THE DOOR",
  },
};

function isSampleBookId(value: string): value is SampleBookId {
  return SAMPLE_BOOKS.some((book) => book.id === value);
}

function extractStoryText(rawText: string, storyStartMarker: string): string {
  const startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK";
  const endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK";
  const start = rawText.indexOf(startMarker);
  const end = rawText.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Sample book markers are invalid.");
  }
  const storyStart = rawText.indexOf(storyStartMarker, start);
  if (storyStart < 0 || storyStart >= end) {
    throw new Error("Sample book story marker is invalid.");
  }
  return normalizeBookText(rawText.slice(storyStart, end));
}

export function loadSampleBook(sampleBookId: string): {
  bookText: string;
  title: string;
} {
  if (!isSampleBookId(sampleBookId)) {
    throw new ValidationError("Choose a valid sample book.");
  }
  const metadata = SAMPLE_BOOKS.find((book) => book.id === sampleBookId);
  if (!metadata) throw new Error("Sample book metadata is missing.");
  const source = SAMPLE_BOOK_SOURCES[sampleBookId];
  const filePath = path.join(
    process.cwd(),
    "samples",
    "books",
    source.filename,
  );
  return {
    bookText: extractStoryText(
      fs.readFileSync(filePath, "utf8"),
      source.storyStart,
    ),
    title: metadata.title,
  };
}
