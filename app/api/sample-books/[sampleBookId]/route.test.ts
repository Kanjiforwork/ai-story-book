import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("sample book route", () => {
  it("returns the curated text for an allowlisted sample", async () => {
    const response = await GET(
      new Request("http://localhost/api/sample-books/a-christmas-carol"),
      {
        params: Promise.resolve({ sampleBookId: "a-christmas-carol" }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      bookText: expect.stringMatching(/^MARLEY was dead: to begin with\./),
      title: "A Christmas Carol",
    });
  });

  it("rejects IDs outside the sample allowlist", async () => {
    const response = await GET(
      new Request("http://localhost/api/sample-books/not-allowed"),
      {
        params: Promise.resolve({ sampleBookId: "not-allowed" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION",
      message: "Choose a valid sample book.",
    });
  });
});
