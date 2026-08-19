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

export type ProjectStatus = "DRAFT" | "IN_PROGRESS" | "DONE";

export type ProjectStepView = {
  key: PipelineStep;
  position: number;
  status: ProjectStepStatus;
  run: ProjectStepRunView;
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

export type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  status: ProjectStatus;
  completedSteps: number;
  totalSteps: number;
};

export type ProjectDetailView = ProjectSummary & {
  bookText: string;
  characters: CharacterView[];
  style: string | null;
  steps: ProjectStepView[];
};
