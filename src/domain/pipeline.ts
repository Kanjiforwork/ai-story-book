export const PIPELINE_STEPS = [
  "STYLE",
  "CHARACTERS",
  "PORTRAITS",
  "CHAPTERS",
  "ILLUSTRATIONS",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  STYLE: "Style",
  CHARACTERS: "Characters",
  PORTRAITS: "Portraits",
  CHAPTERS: "Chapters",
  ILLUSTRATIONS: "Illustrations",
};

export const PIPELINE_LIMITS = {
  adultCharacters: 2,
  chapters: 1,
} as const;

export function isPipelineStep(value: string): value is PipelineStep {
  return (PIPELINE_STEPS as readonly string[]).includes(value);
}

export function assertPipelineCaps(input: {
  adultCharacterCount: number;
  chapterCount: number;
}): void {
  if (input.adultCharacterCount > PIPELINE_LIMITS.adultCharacters) {
    throw new Error(
      `The pipeline allows at most ${PIPELINE_LIMITS.adultCharacters} adult characters.`,
    );
  }

  if (input.chapterCount > PIPELINE_LIMITS.chapters) {
    throw new Error(
      `The pipeline allows at most ${PIPELINE_LIMITS.chapters} chapter.`,
    );
  }
}
