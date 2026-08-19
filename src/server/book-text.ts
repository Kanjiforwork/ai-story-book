import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { ValidationError } from "@/domain/validation";

export const MAX_BOOK_TEXT_CHARACTERS = 200_000;
export const MAX_TEXT_UPLOAD_BYTES = 2 * 1024 * 1024;

const BOOK_DIRECTORY = "books";
const BOOK_KEY_PATTERN = /^books\/[0-9a-f-]+\.txt$/;

export function normalizeBookText(value: string): string {
  const text = value.replace(/\r\n?/g, "\n");
  if (!text.trim()) {
    throw new ValidationError("Book text is required.");
  }
  if (text.includes("\0")) {
    throw new ValidationError("Book text contains an unsupported character.");
  }
  if (text.length > MAX_BOOK_TEXT_CHARACTERS) {
    throw new ValidationError(
      `Book text must be ${MAX_BOOK_TEXT_CHARACTERS.toLocaleString()} characters or fewer.`,
    );
  }
  return text;
}

export async function decodeTextUpload(file: File): Promise<string> {
  const filename = file.name.toLowerCase();
  if (!filename.endsWith(".txt")) {
    throw new ValidationError("Upload a plain .txt file.");
  }
  if (file.type && file.type !== "text/plain") {
    throw new ValidationError("Upload a plain text file.");
  }
  if (file.size > MAX_TEXT_UPLOAD_BYTES) {
    throw new ValidationError("Text uploads must be 2 MB or smaller.");
  }

  try {
    return normalizeBookText(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      ),
    );
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("The uploaded file is not valid UTF-8 text.");
  }
}

function resolveBookPath(dataDir: string, key: string): string {
  if (!BOOK_KEY_PATTERN.test(key)) {
    throw new Error("Invalid book text asset key.");
  }

  const root = path.resolve(dataDir);
  const resolved = path.resolve(/* turbopackIgnore: true */ root, key);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Book text asset path escaped the data directory.");
  }
  return resolved;
}

export function writeBookTextAtomically(dataDir: string, text: string): string {
  const root = path.resolve(dataDir);
  const directory = path.join(root, BOOK_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  const filename = `${randomUUID()}.txt`;
  const key = `${BOOK_DIRECTORY}/${filename}`;
  const finalPath = resolveBookPath(root, key);
  const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
  const fileDescriptor = fs.openSync(temporaryPath, "wx", 0o600);

  try {
    fs.writeFileSync(fileDescriptor, text, "utf8");
    fs.fsyncSync(fileDescriptor);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  } finally {
    fs.closeSync(fileDescriptor);
  }

  fs.renameSync(temporaryPath, finalPath);
  return key;
}

export function readBookText(dataDir: string, key: string): string {
  return fs.readFileSync(resolveBookPath(dataDir, key), "utf8");
}

export function removeBookText(dataDir: string, key: string): void {
  fs.rmSync(resolveBookPath(dataDir, key), { force: true });
}
