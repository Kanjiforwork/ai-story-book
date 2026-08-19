import { PIPELINE_LIMITS } from "@/domain/pipeline";

export type GeneratedCharacter = {
  ageGroup: "adult";
  name: string;
  prompt: string;
};

export const CHARACTER_RESPONSE_FORMAT = {
  type: "text",
  mime_type: "application/json",
  schema: {
    type: "array",
    minItems: 1,
    maxItems: PIPELINE_LIMITS.adultCharacters,
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        prompt: { type: "string" },
        age_group: { type: "string", enum: ["adult"] },
      },
      required: ["name", "prompt", "age_group"],
    },
  },
} as const;

export class GeminiOutputError extends Error {
  readonly code = "GEMINI_INVALID_OUTPUT" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GeminiOutputError";
  }
}

export function parseGeneratedStyle(value: string): string {
  const style = value.trim();
  if (!style) {
    throw new GeminiOutputError("Gemini returned an empty art style.");
  }
  if (style.length > 2_000) {
    throw new GeminiOutputError(
      "Gemini returned an art style that is too long.",
    );
  }
  return style;
}

export function parseGeneratedCharacters(value: string): GeneratedCharacter[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new GeminiOutputError("Gemini returned invalid character JSON.", {
      cause: error,
    });
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new GeminiOutputError("Gemini returned no adult characters.");
  }
  if (parsed.length > PIPELINE_LIMITS.adultCharacters) {
    throw new GeminiOutputError(
      `Gemini returned more than ${PIPELINE_LIMITS.adultCharacters} adult characters.`,
    );
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new GeminiOutputError(`Character ${index + 1} is not an object.`);
    }

    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const prompt =
      typeof record.prompt === "string" ? record.prompt.trim() : "";
    const ageGroup = record.age_group;
    const wordCount = prompt ? prompt.split(/\s+/).length : 0;

    if (!name || name.length > 120) {
      throw new GeminiOutputError(
        `Character ${index + 1} has an invalid name.`,
      );
    }
    if (wordCount < 50) {
      throw new GeminiOutputError(
        `Character ${index + 1} needs a detailed prompt of at least 50 words.`,
      );
    }
    if (ageGroup !== "adult") {
      throw new GeminiOutputError(
        `Character ${index + 1} was not marked as an adult.`,
      );
    }

    return { ageGroup: "adult", name, prompt };
  });
}
