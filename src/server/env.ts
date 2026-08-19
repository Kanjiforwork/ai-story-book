import path from "node:path";

export const REQUIRED_ENV_NAMES = [
  "GEMINI_API_KEY",
  "GEMINI_TEXT_MODEL",
  "GEMINI_IMAGE_MODEL",
  "GRADION_DATA_DIR",
  "GRADION_STALE_RUN_MS",
] as const;

const MODEL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,127}$/;
const PLACEHOLDER_PATTERN =
  /^(your[_ -]?|replace[_ -]?|change[_ -]?|example|test|dummy|<)/i;

export type ServerEnv = {
  geminiApiKey?: string;
  geminiTextModel?: string;
  geminiImageModel?: string;
  dataDir: string;
  staleRunMs: number;
};

export class EnvironmentValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Environment validation failed: ${issues.join(" ")}`);
    this.name = "EnvironmentValidationError";
  }
}

function validateApiKey(value: string): string {
  if (
    value.length < 20 ||
    /\s/.test(value) ||
    PLACEHOLDER_PATTERN.test(value)
  ) {
    throw new EnvironmentValidationError([
      "GEMINI_API_KEY must be a non-placeholder value with no whitespace.",
    ]);
  }
  return value;
}

function validateModel(value: string, name: string): string {
  if (!MODEL_NAME_PATTERN.test(value)) {
    throw new EnvironmentValidationError([
      `${name} must be a model identifier without whitespace.`,
    ]);
  }
  return value;
}

export function loadServerEnv(
  options: {
    requireGeminiKey?: boolean;
    requireModelIds?: boolean;
  } = {},
): ServerEnv {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const geminiTextModel = process.env.GEMINI_TEXT_MODEL?.trim() || undefined;
  const geminiImageModel = process.env.GEMINI_IMAGE_MODEL?.trim() || undefined;

  if (options.requireGeminiKey && !geminiApiKey) {
    throw new EnvironmentValidationError([
      "GEMINI_API_KEY is required for live/UAT validation.",
    ]);
  }
  if (geminiApiKey) validateApiKey(geminiApiKey);

  if (options.requireModelIds && !geminiTextModel) {
    throw new EnvironmentValidationError([
      "GEMINI_TEXT_MODEL is required for live/UAT validation.",
    ]);
  }
  if (options.requireModelIds && !geminiImageModel) {
    throw new EnvironmentValidationError([
      "GEMINI_IMAGE_MODEL is required for live/UAT validation.",
    ]);
  }
  if (geminiTextModel) validateModel(geminiTextModel, "GEMINI_TEXT_MODEL");
  if (geminiImageModel) validateModel(geminiImageModel, "GEMINI_IMAGE_MODEL");

  const dataDirValue = process.env.GRADION_DATA_DIR?.trim();
  const dataDir = dataDirValue
    ? path.resolve(/* turbopackIgnore: true */ dataDirValue)
    : path.join(process.cwd(), "data");
  if (dataDir === path.parse(dataDir).root || dataDir.includes("\0")) {
    throw new EnvironmentValidationError([
      "GRADION_DATA_DIR must point to a non-root local directory.",
    ]);
  }

  const staleRunValue = process.env.GRADION_STALE_RUN_MS?.trim();
  const staleRunMs = staleRunValue ? Number(staleRunValue) : 120_000;
  if (!Number.isSafeInteger(staleRunMs) || staleRunMs < 1_000) {
    throw new EnvironmentValidationError([
      "GRADION_STALE_RUN_MS must be an integer of at least 1000 milliseconds.",
    ]);
  }

  return {
    geminiApiKey,
    geminiTextModel,
    geminiImageModel,
    dataDir,
    staleRunMs,
  };
}
