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

export type PortraitReference = {
  assetId: string;
  characterName: string;
  characterPrompt: string;
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
  generateIllustration(input: {
    chapterName: string;
    chapterPrompt: string;
    style: string;
    portraitReferences: PortraitReference[];
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

function buildIllustrationPrompt(input: {
  chapterName: string;
  chapterPrompt: string;
  style: string;
  portraitReferences: PortraitReference[];
}): string {
  const references = input.portraitReferences
    .map(
      (reference) =>
        `Character ${reference.characterName} (portrait asset ${reference.assetId}): ${reference.characterPrompt}`,
    )
    .join("\n\n");

  return [
    "Create one landscape scene illustration for a book chapter.",
    "Use the provided portrait images as explicit visual references so the adult characters remain consistent.",
    "Create a single full illustration with no text, title, labels, logos, border, watermark, panels, or decorative lettering.",
    "Keep the scene suitable for a general audience and use the saved art style as the visual language.",
    `Saved art style: ${input.style}`,
    `Chapter name: ${input.chapterName}`,
    `Chapter illustration prompt: ${input.chapterPrompt}`,
    `Persisted portrait references:\n${references}`,
  ].join("\n\n");
}

function readImageResult(
  response: unknown,
  kind: "portrait" | "illustration",
): GeminiImageResult {
  const record =
    response && typeof response === "object"
      ? (response as Record<string, unknown>)
      : {};
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const imagePart = candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as Record<string, unknown>).content;
      if (!content || typeof content !== "object") return [];
      const parts = (content as Record<string, unknown>).parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) =>
      part && typeof part === "object" ? (part as Record<string, unknown>) : {},
    )
    .map((part) => part.inlineData)
    .find(
      (inlineData) =>
        inlineData &&
        typeof inlineData === "object" &&
        (inlineData as Record<string, unknown>).data,
    );
  const outputImage = record.output_image ?? record.outputImage;
  const outputRecord =
    outputImage && typeof outputImage === "object"
      ? (outputImage as Record<string, unknown>)
      : undefined;
  const inlineRecord =
    imagePart && typeof imagePart === "object"
      ? (imagePart as Record<string, unknown>)
      : undefined;
  const base64 =
    (inlineRecord?.data as string | undefined) ??
    (outputRecord?.data as string | undefined) ??
    (record.data as string | undefined);
  const mimeType =
    (inlineRecord?.mimeType as string | undefined) ??
    (inlineRecord?.mime_type as string | undefined) ??
    (outputRecord?.mimeType as string | undefined) ??
    (outputRecord?.mime_type as string | undefined) ??
    "image/png";

  if (!base64) {
    throw new GeminiError(
      `Gemini did not return a ${kind} image. The prompt may have been filtered.`,
    );
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new GeminiError(`Gemini returned an unsupported ${kind} image type.`);
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    throw new GeminiError(`Gemini returned an empty ${kind} image.`);
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
        return readImageResult(response, "portrait");
      } catch (error) {
        if (error instanceof GeminiError) throw error;
        throw new GeminiError("Gemini portrait generation failed.", {
          cause: error,
        });
      }
    },

    async generateIllustration(input) {
      try {
        const contents = [
          {
            role: "user",
            parts: [
              { text: buildIllustrationPrompt(input) },
              ...input.portraitReferences.map((reference) => ({
                inlineData: {
                  data: reference.bytes.toString("base64"),
                  mimeType: reference.mimeType,
                },
              })),
            ],
          },
        ];
        const response = await client.models.generateContent({
          contents,
          model: modelId,
          config: {
            imageConfig: {
              aspectRatio: "16:9",
              personGeneration: "ALLOW_ADULT",
            },
            responseModalities: ["IMAGE"],
          },
        } as never);
        return readImageResult(response, "illustration");
      } catch (error) {
        if (error instanceof GeminiError) throw error;
        throw new GeminiError(
          "Gemini chapter illustration generation failed.",
          {
            cause: error,
          },
        );
      }
    },
  };
}

export { buildIllustrationPrompt, buildPortraitPrompt };
