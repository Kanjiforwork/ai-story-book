import {
  assertPipelineCaps,
  PIPELINE_LIMITS,
  PIPELINE_STEPS,
} from "../src/domain/pipeline";

const expectedSteps = [
  "STYLE",
  "CHARACTERS",
  "PORTRAITS",
  "CHAPTERS",
  "ILLUSTRATIONS",
];

try {
  if (JSON.stringify(PIPELINE_STEPS) !== JSON.stringify(expectedSteps)) {
    throw new Error(
      "Pipeline step order does not match the assessment contract.",
    );
  }

  if (PIPELINE_LIMITS.adultCharacters !== 2 || PIPELINE_LIMITS.chapters !== 1) {
    throw new Error(
      "Pipeline caps must remain 2 adult characters and 1 chapter.",
    );
  }

  assertPipelineCaps({ adultCharacterCount: 2, chapterCount: 1 });
  console.log("Pipeline contract valid: 5 ordered steps, caps 2/1.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
