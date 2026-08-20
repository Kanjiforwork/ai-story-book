import type { PipelineStep } from "@/domain/pipeline";

export const PROJECT_STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "FAILED",
  "COMPLETED",
] as const;

export type ProjectStepStatus = (typeof PROJECT_STEP_STATUSES)[number];

export const PORTRAIT_ITEM_STATUSES = [
  "PENDING",
  "RUNNING",
  "FAILED",
  "COMPLETED",
] as const;

export type PortraitItemStatus = (typeof PORTRAIT_ITEM_STATUSES)[number];

export const ILLUSTRATION_ITEM_STATUSES = [
  "PENDING",
  "RUNNING",
  "FAILED",
  "COMPLETED",
] as const;

export type IllustrationItemStatus =
  (typeof ILLUSTRATION_ITEM_STATUSES)[number];

export type ProjectStatus = "DRAFT" | "IN_PROGRESS" | "DONE";

export const GENERATION_RUN_STATUSES = [
  "ACTIVE",
  "SUPERSEDED",
  "COMPLETED",
] as const;

export type GenerationRunStatus = (typeof GENERATION_RUN_STATUSES)[number];

export type GenerationRunView = {
  id: string;
  sourceSnapshotHash: string;
  style: string | null;
  styleRevision: string | null;
  promptVersion: string;
  textModelId: string | null;
  imageModelId: string | null;
  status: GenerationRunStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedSteps: number;
  totalSteps: number;
  isSelected: boolean;
  isWritable: boolean;
};

export type ProjectStepView = {
  attempts: ProjectStepAttemptView[];
  key: PipelineStep;
  position: number;
  status: ProjectStepStatus;
  generationRunId?: string;
  run: ProjectStepRunView;
};

export type ProjectStepAttemptView = {
  attempt: number;
  claimedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  finishedAt: string | null;
  status: "RUNNING" | "FAILED" | "COMPLETED";
};

export type ProjectAttemptHistoryItem = ProjectStepAttemptView & {
  id: string;
  generationRunId: string;
  projectId: string;
  projectTitle: string;
  step: PipelineStep;
};

export type ProjectStepRunView = {
  attempt: number;
  claimedAt: string | null;
  heartbeatAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  isStale: boolean;
};

export type CharacterView = {
  id: string;
  name: string;
  position: number;
  prompt: string;
  portrait: PortraitItemView;
};

export type PortraitItemView = {
  attempt: number;
  assetId: string | null;
  assetUrl: string | null;
  claimedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  heartbeatAt: string | null;
  isStale: boolean;
  status: PortraitItemStatus;
};

export type IllustrationItemView = {
  attempt: number;
  assetId: string | null;
  assetUrl: string | null;
  claimedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  heartbeatAt: string | null;
  isStale: boolean;
  status: IllustrationItemStatus;
};

export type ChapterView = {
  id: string;
  name: string;
  position: number;
  prompt: string;
  illustration: IllustrationItemView;
};

export type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  status: ProjectStatus;
  completedSteps: number;
  totalSteps: number;
  activeGenerationRunId?: string;
};

export type ProjectDetailView = ProjectSummary & {
  attemptHistory: ProjectAttemptHistoryItem[];
  bookText: string;
  characters: CharacterView[];
  chapters: ChapterView[];
  style: string | null;
  steps: ProjectStepView[];
  activeGenerationRunId?: string;
  selectedRunReadOnly?: boolean;
  generationRuns?: GenerationRunView[];
};
