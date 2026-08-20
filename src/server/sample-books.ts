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
    storyStart: "MARLEY was dead: to begin with.",
  },
  "jekyll-and-hyde": {
    filename: "jekyll-and-hyde.txt",
    storyStart: "Mr. Utterson the lawyer was a man of a rugged countenance",
  },
};

function isSampleBookId(value: string): value is SampleBookId {
  return SAMPLE_BOOKS.some((book) => book.id === value);
}

function reflowSampleBookText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.some((line) => /^\s/.test(line))) {
        return lines.map((line) => line.trimEnd()).join("\n");
      }

      return lines.reduce((paragraph, line) => {
        const text = line.trim();
        if (!paragraph) return text;
        return paragraph.endsWith("-")
          ? `${paragraph}${text}`
          : `${paragraph} ${text}`;
      }, "");
    })
    .join("\n\n");
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
  return normalizeBookText(
    reflowSampleBookText(rawText.slice(storyStart, end)),
  );
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
