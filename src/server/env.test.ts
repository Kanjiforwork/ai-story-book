import { describe, expect, it } from "vitest";

import { EnvironmentValidationError } from "@/server/env";
import { validateEnvExample } from "@/server/env-example";

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
});
