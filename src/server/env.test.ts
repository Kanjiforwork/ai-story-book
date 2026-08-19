import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvironmentValidationError, loadServerEnv } from "@/server/env";
import { validateEnvExample } from "@/server/env-example";

afterEach(() => {
  vi.unstubAllEnvs();
});

const EMPTY_ENV_EXAMPLE = `
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=
GEMINI_IMAGE_MODEL=
GRADION_DATA_DIR=
GRADION_STALE_RUN_MS=
`;

describe("environment contract", () => {
  it("accepts the secret-free example file", () => {
    expect(() => validateEnvExample(EMPTY_ENV_EXAMPLE)).not.toThrow();
  });

  it("rejects a likely committed Gemini key", () => {
    expect(() =>
      validateEnvExample(
        EMPTY_ENV_EXAMPLE.replace(
          "GEMINI_API_KEY=",
          "GEMINI_API_KEY=AIzaSyA_real-looking-secret-value",
        ),
      ),
    ).toThrow(EnvironmentValidationError);
  });

  it("does not require the image model for the text pipeline", () => {
    vi.stubEnv("GEMINI_API_KEY", "a-valid-gemini-key-with-more-than-20-chars");
    vi.stubEnv("GEMINI_TEXT_MODEL", "gemini-3.6-flash");
    vi.stubEnv("GEMINI_IMAGE_MODEL", "");

    expect(() =>
      loadServerEnv({ requireGeminiKey: true, requireTextModel: true }),
    ).not.toThrow();
  });
});
