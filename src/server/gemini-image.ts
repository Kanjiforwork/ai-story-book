import { GoogleGenAI } from "@google/genai";

import { GeminiError } from "@/server/gemini";
import type { ServerEnv } from "@/server/env";

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type GeminiImageResult = {
  bytes: Buffer;
  mimeType: string;
};

export type GeminiImageAdapter = {
  readonly modelId: string;
  generatePortrait(input: {
    characterName: string;
    characterPrompt: string;
    style: string;
  }): Promise<GeminiImageResult>;
};

function buildPortraitPrompt(input: {
  characterName: string;
  characterPrompt: string;
  style: string;
}): string {
  return [
    "Create one vertical 3:4 character portrait for a book illustration project.",
    "The subject is an adult character. Keep the portrait suitable for a general audience.",
    "Use the saved art style as the visual language and the character prompt as the source of truth.",
    "Show the character clearly from the chest up with a readable face, expressive posture, coherent lighting, and no text, logos, border, watermark, or decorative lettering.",
    `Saved art style: ${input.style}`,
    `Character name: ${input.characterName}`,
    `Character prompt: ${input.characterPrompt}`,
  ].join("\n\n");
}

function readImageResult(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
  data?: string;
}): GeminiImageResult {
  const imagePart = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data);
  const base64 = imagePart?.inlineData?.data ?? response.data;
  const mimeType = imagePart?.inlineData?.mimeType ?? "image/png";

  if (!base64) {
    throw new GeminiError(
      "Gemini did not return a portrait image. The prompt may have been filtered.",
    );
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new GeminiError(
      "Gemini returned an unsupported portrait image type.",
    );
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    throw new GeminiError("Gemini returned an empty portrait image.");
  }

  return { bytes, mimeType };
}

export function createGeminiImageAdapter(env: ServerEnv): GeminiImageAdapter {
  if (!env.geminiApiKey || !env.geminiImageModel) {
    throw new GeminiError(
      "Gemini image generation is not configured. Add GEMINI_API_KEY and GEMINI_IMAGE_MODEL.",
    );
  }

  const modelId = env.geminiImageModel;
  const client = new GoogleGenAI({ apiKey: env.geminiApiKey });

  return {
    modelId,

    async generatePortrait(input) {
      try {
        const response = await client.models.generateContent({
          contents: buildPortraitPrompt(input),
          model: modelId,
          config: {
            imageConfig: {
              aspectRatio: "3:4",
              personGeneration: "ALLOW_ADULT",
            },
            responseModalities: ["IMAGE"],
          },
        });
        return readImageResult(response);
      } catch (error) {
        if (error instanceof GeminiError) throw error;
        throw new GeminiError("Gemini portrait generation failed.", {
          cause: error,
        });
      }
    },
  };
}

export { buildPortraitPrompt };
