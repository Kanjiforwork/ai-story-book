import { beforeEach, describe, expect, it, vi } from "vitest";

const { filesGetMock, filesUploadMock, interactionsCreateMock } = vi.hoisted(
  () => ({
    filesGetMock: vi.fn(),
    filesUploadMock: vi.fn(),
    interactionsCreateMock: vi.fn(),
  }),
);

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function () {
    return {
      files: {
        get: filesGetMock,
        upload: filesUploadMock,
      },
      interactions: { create: interactionsCreateMock },
    };
  }),
}));

import { createGeminiTextAdapter } from "@/server/gemini";

describe("Gemini text adapter", () => {
  beforeEach(() => {
    filesGetMock.mockReset();
    filesUploadMock.mockReset();
    interactionsCreateMock.mockReset();
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

  it("returns null only when a stored Gemini file has expired", async () => {
    filesGetMock.mockRejectedValue({ status: 404 });
    const adapter = createGeminiTextAdapter({
      dataDir: "/tmp/gradion-test-data",
      geminiApiKey: "test-api-key-with-more-than-20-chars",
      geminiTextModel: "gemini-text-model",
      staleRunMs: 120_000,
    });

    await expect(
      adapter.getUploadedBook?.("files/expired"),
    ).resolves.toBeNull();
  });

  it("returns an active stored Gemini file for reuse", async () => {
    filesGetMock.mockResolvedValue({
      mimeType: "text/plain",
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

    await expect(adapter.getUploadedBook?.("files/book-1")).resolves.toEqual({
      mimeType: "text/plain",
      name: "files/book-1",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
    });
  });

  it("does not treat a transient file lookup failure as expiry", async () => {
    filesGetMock.mockRejectedValue({ status: 503 });
    const adapter = createGeminiTextAdapter({
      dataDir: "/tmp/gradion-test-data",
      geminiApiKey: "test-api-key-with-more-than-20-chars",
      geminiTextModel: "gemini-text-model",
      staleRunMs: 120_000,
    });

    await expect(adapter.getUploadedBook?.("files/book-1")).rejects.toThrow(
      "Gemini could not verify the book file.",
    );
  });

  it("accepts an ID-only interaction when bootstrapping book context", async () => {
    interactionsCreateMock.mockResolvedValue({
      id: "context-1",
      output_text: "",
    });
    const adapter = createGeminiTextAdapter({
      dataDir: "/tmp/gradion-test-data",
      geminiApiKey: "test-api-key-with-more-than-20-chars",
      geminiTextModel: "gemini-text-model",
      staleRunMs: 120_000,
    });

    await expect(adapter.createBookContext("files/book-1")).resolves.toEqual({
      id: "context-1",
      outputText: "",
    });
  });

  it("still rejects empty output from a generated text interaction", async () => {
    interactionsCreateMock.mockResolvedValue({
      id: "characters-1",
      output_text: "",
    });
    const adapter = createGeminiTextAdapter({
      dataDir: "/tmp/gradion-test-data",
      geminiApiKey: "test-api-key-with-more-than-20-chars",
      geminiTextModel: "gemini-text-model",
      staleRunMs: 120_000,
    });

    await expect(
      adapter.createTextInteraction({
        previousInteractionId: "context-1",
        prompt: "Generate characters.",
      }),
    ).rejects.toThrow("Gemini returned an empty text interaction.");
  });
});
