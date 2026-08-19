import { GoogleGenAI } from "@google/genai";

import type { ServerEnv } from "@/server/env";

export type GeminiUploadedFile = {
  name: string;
  uri: string;
  mimeType: string;
};

export type GeminiTextInteraction = {
  id: string;
  outputText: string;
};

export type GeminiTextAdapter = {
  readonly modelId: string;
  uploadBook(filePath: string): Promise<GeminiUploadedFile>;
  createBookContext(fileUri: string): Promise<GeminiTextInteraction>;
  createTextInteraction(input: {
    prompt: string;
    previousInteractionId: string;
    responseFormat?: Record<string, unknown>;
  }): Promise<GeminiTextInteraction>;
};

export class GeminiError extends Error {
  readonly code = "GEMINI_FAILED" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GeminiError";
  }
}

function readInteractionText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as { output_text?: unknown; outputText?: unknown };
  const outputText = record.output_text ?? record.outputText;
  return typeof outputText === "string" ? outputText.trim() : "";
}

function readInteractionId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : "";
}

function toTextInteraction(value: unknown): GeminiTextInteraction {
  const id = readInteractionId(value);
  const outputText = readInteractionText(value);
  if (!id || !outputText) {
    throw new GeminiError("Gemini returned an empty text interaction.");
  }
  return { id, outputText };
}

export function createGeminiTextAdapter(env: ServerEnv): GeminiTextAdapter {
  if (!env.geminiApiKey || !env.geminiTextModel) {
    throw new GeminiError(
      "Gemini text generation is not configured. Add GEMINI_API_KEY and GEMINI_TEXT_MODEL.",
    );
  }

  const modelId = env.geminiTextModel;
  const client = new GoogleGenAI({ apiKey: env.geminiApiKey });

  return {
    modelId,

    async uploadBook(filePath) {
      try {
        const file = await client.files.upload({
          file: filePath,
          config: { displayName: "source-book.txt", mimeType: "text/plain" },
        });
        if (!file.name || !file.uri) {
          throw new GeminiError("Gemini did not return a reusable file URI.");
        }
        return {
          name: file.name,
          uri: file.uri,
          mimeType: file.mimeType ?? "text/plain",
        };
      } catch (error) {
        if (error instanceof GeminiError) throw error;
        throw new GeminiError("Gemini could not upload the book text.", {
          cause: error,
        });
      }
    },

    async createBookContext(fileUri) {
      try {
        const interaction = await client.interactions.create({
          model: modelId,
          input: [
            {
              type: "text",
              text: "Here is a book to illustrate. Do not answer yet; keep the book as context for the next instructions.",
            },
            { type: "document", uri: fileUri, mime_type: "text/plain" },
          ],
        });
        return toTextInteraction(interaction);
      } catch (error) {
        if (error instanceof GeminiError) throw error;
        throw new GeminiError("Gemini could not create the book context.", {
          cause: error,
        });
      }
    },

    async createTextInteraction({
      prompt,
      previousInteractionId,
      responseFormat,
    }) {
      try {
        const interaction = await client.interactions.create({
          model: modelId,
          input: prompt,
          previous_interaction_id: previousInteractionId,
          response_format: responseFormat as never,
        });
        return toTextInteraction(interaction);
      } catch (error) {
        if (error instanceof GeminiError) throw error;
        throw new GeminiError("Gemini text generation failed.", {
          cause: error,
        });
      }
    },
  };
}
