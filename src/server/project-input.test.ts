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

  it("loads an allowlisted public-domain sample on the server", async () => {
    const formData = new FormData();
    formData.set("title", "A Christmas Carol");
    formData.set("sampleBookId", "a-christmas-carol");

    const input = await parseProjectInput(
      new Request("http://localhost/api/projects", {
        body: formData,
        method: "POST",
      }),
    );

    expect(input.bookText).toMatch(/^MARLEY was dead: to begin with\./);
    expect(input.bookText).not.toContain("STAVE I:  MARLEY'S GHOST");
    expect(input.bookText).not.toContain("PROJECT GUTENBERG EBOOK");
    expect(input.bookText).not.toContain("PREFACE");
    expect(input.bookText).not.toContain("CONTENTS");
    expect(input.bookText.split("\n\n", 1)[0]).not.toContain("\n");
    expect(input.bookText).toContain(
      "There is no doubt whatever about that. The register of his burial was signed",
    );
    expect(input.bookText).toContain("door-nail.\n\nMind!");
    expect(input.bookText.length).toBeLessThanOrEqual(200_000);
  });

  it("removes the title page and contents from every bundled sample", async () => {
    const formData = new FormData();
    formData.set("title", "Jekyll and Hyde");
    formData.set("sampleBookId", "jekyll-and-hyde");

    const input = await parseProjectInput(
      new Request("http://localhost/api/projects", {
        body: formData,
        method: "POST",
      }),
    );

    expect(input.bookText).toMatch(/^Mr\. Utterson the lawyer/);
    expect(input.bookText).not.toContain("STORY OF THE DOOR");
    expect(input.bookText).not.toContain("Project Gutenberg");
    expect(input.bookText).not.toContain("Contents");
    expect(input.bookText.split("\n\n", 1)[0]).not.toContain("\n");
    expect(input.bookText).toContain(
      "rugged countenance that was never lighted by a smile",
    );
    expect(input.bookText).toContain("demeanour.\n\nNo doubt");
  });

  it("rejects unknown sample IDs and ambiguous book sources", async () => {
    const unknown = new FormData();
    unknown.set("title", "Unknown");
    unknown.set("sampleBookId", "../../secret");
    await expect(
      parseProjectInput(
        new Request("http://localhost/api/projects", {
          body: unknown,
          method: "POST",
        }),
      ),
    ).rejects.toThrow("Choose a valid sample book.");

    const ambiguous = new FormData();
    ambiguous.set("title", "Ambiguous");
    ambiguous.set("sampleBookId", "jekyll-and-hyde");
    ambiguous.set("bookText", "Pasted text");
    await expect(
      parseProjectInput(
        new Request("http://localhost/api/projects", {
          body: ambiguous,
          method: "POST",
        }),
      ),
    ).rejects.toThrow("Choose one book source.");
  });
});
