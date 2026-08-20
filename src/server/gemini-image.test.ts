import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function () {
    return {
      models: { generateContent: generateContentMock },
    };
  }),
}));

import { createGeminiImageAdapter } from "@/server/gemini-image";

const imageResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              data: Buffer.from("png-bytes").toString("base64"),
              mimeType: "image/png",
            },
          },
        ],
      },
    },
  ],
};

function createAdapter() {
  return createGeminiImageAdapter({
    dataDir: "/tmp/gradion-test-data",
    geminiApiKey: "test-api-key-with-more-than-20-chars",
    geminiImageModel: "gemini-image-model",
    staleRunMs: 120_000,
  });
}

describe("Gemini image adapter", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValue(imageResponse);
  });

  it("uses Developer API-compatible image config for portraits and illustrations", async () => {
    const adapter = createAdapter();

    await adapter.generatePortrait({
      characterName: "Mole",
      characterPrompt: "A detailed adult character portrait.",
      style: "Warm painted watercolour.",
    });
    await adapter.generateIllustration({
      chapterName: "The River",
      chapterPrompt: "A single river scene.",
      portraitReferences: [
        {
          assetId: "portrait-1",
          bytes: Buffer.from("portrait-bytes"),
          characterName: "Mole",
          characterPrompt: "A detailed adult character portrait.",
          mimeType: "image/png",
        },
      ],
      style: "Warm painted watercolour.",
    });

    expect(
      generateContentMock.mock.calls.map(
        (call) =>
          (
            call[0] as {
              config: { imageConfig: Record<string, unknown> };
            }
          ).config.imageConfig,
      ),
    ).toEqual([{ aspectRatio: "3:4" }, { aspectRatio: "1:1" }]);
    expect(
      (
        generateContentMock.mock.calls[1][0] as {
          contents: Array<{ parts: Array<{ text?: string }> }>;
        }
      ).contents[0].parts[0].text,
    ).toContain("central safe area");
  });
});
