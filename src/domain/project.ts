import type { PipelineStep } from "@/domain/pipeline";

export const PROJECT_STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "FAILED",
  "COMPLETED",
] as const;

export type ProjectStepStatus = (typeof PROJECT_STEP_STATUSES)[number];

export type ProjectStatus = "DRAFT" | "IN_PROGRESS" | "DONE";

export type ProjectStepView = {
  key: PipelineStep;
  position: number;
  status: ProjectStepStatus;
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
  steps: ProjectStepView[];
};
