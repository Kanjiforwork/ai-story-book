import { describe, expect, it } from "vitest";

import { ValidationError } from "@/domain/validation";
import { decodeTextUpload } from "@/server/book-text";
import { parseProjectInput } from "@/server/project-input";

describe("project request parsing", () => {
  it("accepts a text/plain media type with parameters", async () => {
    const bytes = new TextEncoder().encode("First line\r\nSecond line");
    const file = {
      arrayBuffer: async () => bytes.buffer,
      name: "book.txt",
      size: bytes.byteLength,
      type: "text/plain;charset=utf-8",
    } as File;

    await expect(decodeTextUpload(file)).resolves.toBe(
      "First line\nSecond line",
    );
  });

  it("turns malformed multipart bodies into validation errors", async () => {
    const request = new Request("http://localhost/api/projects", {
      body: "not a multipart body",
      headers: {
        "content-type": "multipart/form-data; boundary=missing-boundary",
      },
      method: "POST",
    });

    await expect(parseProjectInput(request)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
