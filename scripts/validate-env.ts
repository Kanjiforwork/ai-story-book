import { validateEnvExampleFile } from "../src/server/env-example";
import { loadServerEnv } from "../src/server/env";

const live = process.argv.includes("--live");

try {
  validateEnvExampleFile();
  loadServerEnv({ requireGeminiKey: live, requireModelIds: live });
  console.log(
    live
      ? "Environment valid for explicit Gemini live/UAT use."
      : "Environment valid for local development and CI; Gemini key is optional.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
