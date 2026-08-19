export const PIPELINE_STEPS = [
  "STYLE",
  "CHARACTERS",
  "PORTRAITS",
  "CHAPTERS",
  "ILLUSTRATIONS",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const TEXT_PIPELINE_STEPS = ["STYLE", "CHARACTERS"] as const;

export type TextPipelineStep = (typeof TEXT_PIPELINE_STEPS)[number];

export const IMPLEMENTED_PIPELINE_STEPS = [
  "STYLE",
  "CHARACTERS",
  "PORTRAITS",
] as const;

export type ImplementedPipelineStep =
  (typeof IMPLEMENTED_PIPELINE_STEPS)[number];

export type PipelineErrorCode =
  | "STEP_ORDER"
  | "STEP_ALREADY_COMPLETED"
  | "RUN_ALREADY_ACTIVE"
  | "STALE_RUN"
  | "STEP_NOT_AVAILABLE"
  | "GEMINI_FAILED"
  | "GEMINI_INVALID_OUTPUT";

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

export function isTextPipelineStep(
  step: PipelineStep,
): step is TextPipelineStep {
  return (TEXT_PIPELINE_STEPS as readonly string[]).includes(step);
}

export function isImplementedPipelineStep(
  step: PipelineStep,
): step is ImplementedPipelineStep {
  return (IMPLEMENTED_PIPELINE_STEPS as readonly string[]).includes(step);
}

export function previousPipelineStep(
  step: PipelineStep,
): PipelineStep | undefined {
  const position = PIPELINE_STEPS.indexOf(step);
  return position > 0 ? PIPELINE_STEPS[position - 1] : undefined;
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
