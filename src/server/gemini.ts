import { GoogleGenAI } from "@google/genai";

import type { ServerEnv } from "@/server/env";

const FILE_PROCESSING_POLL_MS = 1_000;
const FILE_PROCESSING_TIMEOUT_MS = 60_000;

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
  getUploadedBook?(fileName: string): Promise<GeminiUploadedFile | null>;
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

function toContextInteraction(value: unknown): GeminiTextInteraction {
  const id = readInteractionId(value);
  if (!id) {
    throw new GeminiError("Gemini did not return a context interaction ID.");
  }
  return { id, outputText: readInteractionText(value) };
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 404
  );
}

async function waitForUploadedFile(
  client: GoogleGenAI,
  file: {
    error?: { message?: string };
    mimeType?: string;
    name?: string;
    state?: string;
    uri?: string;
  },
): Promise<typeof file> {
  const deadline = Date.now() + FILE_PROCESSING_TIMEOUT_MS;
  let current = file;

  while (current.state !== "ACTIVE") {
    if (current.state === "FAILED") {
      throw new GeminiError(
        current.error?.message ?? "Gemini could not process the book file.",
      );
    }
    if (!current.name || Date.now() >= deadline) {
      throw new GeminiError("Gemini book file processing timed out.");
    }

    await new Promise((resolve) =>
      setTimeout(resolve, FILE_PROCESSING_POLL_MS),
    );
    current = await client.files.get({ name: current.name });
  }

  return current;
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

    async getUploadedBook(fileName) {
      try {
        const file = await waitForUploadedFile(
          client,
          await client.files.get({ name: fileName }),
        );
        if (!file.name || !file.uri) {
          throw new GeminiError("Gemini did not return a reusable file URI.");
        }
        return {
          name: file.name,
          uri: file.uri,
          mimeType: file.mimeType ?? "text/plain",
        };
      } catch (error) {
        if (isNotFoundError(error)) return null;
        if (error instanceof GeminiError) throw error;
        throw new GeminiError("Gemini could not verify the book file.", {
          cause: error,
        });
      }
    },

    async uploadBook(filePath) {
      try {
        const uploadedFile = await client.files.upload({
          file: filePath,
          config: { displayName: "source-book.txt", mimeType: "text/plain" },
        });
        if (!uploadedFile.name || !uploadedFile.uri) {
          throw new GeminiError("Gemini did not return a reusable file URI.");
        }
        const file = await waitForUploadedFile(client, uploadedFile);
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
        return toContextInteraction(interaction);
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
