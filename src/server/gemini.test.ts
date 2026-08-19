import { beforeEach, describe, expect, it, vi } from "vitest";

const { filesGetMock, filesUploadMock } = vi.hoisted(() => ({
  filesGetMock: vi.fn(),
  filesUploadMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function () {
    return {
      files: {
        get: filesGetMock,
        upload: filesUploadMock,
      },
      interactions: { create: vi.fn() },
    };
  }),
}));

import { createGeminiTextAdapter } from "@/server/gemini";

describe("Gemini text adapter", () => {
  beforeEach(() => {
    filesGetMock.mockReset();
    filesUploadMock.mockReset();
  });

  it("waits for an uploaded book to become active before returning its URI", async () => {
    filesUploadMock.mockResolvedValue({
      name: "files/book-1",
      state: "PROCESSING",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
    });
    filesGetMock.mockResolvedValue({
      name: "files/book-1",
      state: "ACTIVE",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
    });

    const adapter = createGeminiTextAdapter({
      dataDir: "/tmp/gradion-test-data",
      geminiApiKey: "test-api-key-with-more-than-20-chars",
      geminiTextModel: "gemini-text-model",
      staleRunMs: 120_000,
    });

    await expect(adapter.uploadBook("/tmp/book.txt")).resolves.toEqual({
      mimeType: "text/plain",
      name: "files/book-1",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
    });
    expect(filesGetMock).toHaveBeenCalledWith({ name: "files/book-1" });
  });

  it("surfaces a failed file-processing state without retrying upload", async () => {
    filesUploadMock.mockResolvedValue({
      error: { message: "Unsupported book encoding." },
      name: "files/book-1",
      state: "FAILED",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
    });

    const adapter = createGeminiTextAdapter({
      dataDir: "/tmp/gradion-test-data",
      geminiApiKey: "test-api-key-with-more-than-20-chars",
      geminiTextModel: "gemini-text-model",
      staleRunMs: 120_000,
    });

    await expect(adapter.uploadBook("/tmp/book.txt")).rejects.toThrow(
      "Unsupported book encoding.",
    );
    expect(filesUploadMock).toHaveBeenCalledTimes(1);
    expect(filesGetMock).not.toHaveBeenCalled();
  });
});
