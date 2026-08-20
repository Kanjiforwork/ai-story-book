"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  PIPELINE_STEP_LABELS,
  isImplementedPipelineStep,
} from "@/domain/pipeline";
import type { ProjectDetailView } from "@/domain/project";
import { AppShell } from "@/components/app-shell";
import { CompletedProjectGallery } from "@/components/completed-project-gallery";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import type { AuthenticatedUser } from "@/server/auth";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const RUNNING_STEP_COPY = {
  STYLE: "Generating style…",
  CHARACTERS: "Generating characters…",
  PORTRAITS: "Generating portraits…",
  CHAPTERS: "Generating chapter…",
  ILLUSTRATIONS: "Generating illustration…",
} as const;

function stepStatusLabel(status: string, isStale: boolean): string {
  if (status === "COMPLETED") return "complete";
  if (status === "RUNNING" && isStale) return "interrupted";
  if (status === "RUNNING") return "running";
  if (status === "FAILED") return "needs attention";
  return "pending";
}

export function ProjectDetail({
  project: initialProject,
  user,
}: {
  project: ProjectDetailView;
  user: AuthenticatedUser;
}) {
  const [project, setProject] = useState(initialProject);
  const [styleDraft, setStyleDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<"run" | "recover" | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
  const latestRefreshId = useRef(0);
  const implementedSteps = project.steps.filter((step) =>
    isImplementedPipelineStep(step.key),
  );
  const selectedRunReadOnly = project.selectedRunReadOnly ?? false;
  const currentStep = selectedRunReadOnly
    ? null
    : (implementedSteps.find((step) => step.status !== "COMPLETED") ?? null);
  const currentStepIsStale =
    currentStep?.status === "RUNNING" && currentStep.run.isStale;
  const currentStepIsRunning =
    currentStep?.status === "RUNNING" && !currentStep.run.isStale;
  const shouldPoll = project.steps.some(
    (step) =>
      isImplementedPipelineStep(step.key) &&
      step.status === "RUNNING" &&
      !step.run.isStale,
  );
  async function refreshProject() {
    const refreshId = latestRefreshId.current + 1;
    latestRefreshId.current = refreshId;
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        message?: string;
        project?: ProjectDetailView;
      };
      if (refreshId !== latestRefreshId.current) return;
      if (!response.ok || !payload.project) {
        setActionError(payload.message ?? "We could not refresh this project.");
        return;
      }
      setActionError(null);
      setProject(payload.project);
    } catch {
      if (refreshId !== latestRefreshId.current) return;
      setActionError("The server could not be reached. Try again.");
    }
  }

  useEffect(() => {
    if (!shouldPoll) return;
    const interval = window.setInterval(() => void refreshProject(), 2_500);
    return () => window.clearInterval(interval);
    // The server view controls whether polling continues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, shouldPoll]);

  async function runCurrentStep() {
    if (!currentStep) return;
    setPendingAction("run");
    setActionError(null);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/steps/${currentStep.key}/run`,
        {
          body: JSON.stringify(
            currentStep.key === "STYLE"
              ? {
                  generationRunId: project.activeGenerationRunId,
                  style: styleDraft,
                }
              : { generationRunId: project.activeGenerationRunId },
          ),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setActionError(payload.message ?? "This step could not start.");
        return;
      }
      await refreshProject();
    } catch {
      setActionError("The server could not be reached. Try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function recoverCurrentStep() {
    if (!currentStep) return;
    setPendingAction("recover");
    setActionError(null);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/steps/${currentStep.key}/recover`,
        {
          body: JSON.stringify({
            generationRunId: project.activeGenerationRunId,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setActionError(payload.message ?? "This step could not be recovered.");
        return;
      }
      await refreshProject();
    } catch {
      setActionError("The server could not be reached. Try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-[90rem] px-5 py-6 sm:px-8 sm:py-8">
        <Link
          className="inline-flex min-h-10 items-center pr-2 text-sm font-medium text-ink-body transition hover:text-orange"
          href="/projects"
        >
          ← Back to projects
        </Link>

        <div className="mt-3 flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-editorial break-words text-[clamp(2.5rem,4.2vw,4rem)] leading-[0.98] tracking-[-0.045em]">
              {project.title}
            </h1>
            <p className="mt-3 text-sm text-ink-muted">
              Created {formatDate(project.createdAt)} · {project.completedSteps}{" "}
              of {project.totalSteps} complete
            </p>
          </div>
          {!selectedRunReadOnly && currentStep ? (
            <div className="mt-1 shrink-0">
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-orange px-5 text-xs font-bold text-white shadow-[0_2px_6px_rgba(255,107,0,0.18)] transition hover:bg-orange-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/20 disabled:cursor-wait disabled:opacity-70"
                disabled={currentStepIsRunning || pendingAction !== null}
                onClick={
                  currentStepIsStale ? recoverCurrentStep : runCurrentStep
                }
                type="button"
              >
                {currentStepIsRunning || pendingAction !== null ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
                    />
                    <span aria-live="polite">
                      {currentStepIsRunning
                        ? RUNNING_STEP_COPY[currentStep.key]
                        : "Starting…"}
                    </span>
                  </>
                ) : currentStepIsStale ? (
                  "Recover run"
                ) : currentStep.status === "FAILED" ? (
                  `Retry ${PIPELINE_STEP_LABELS[currentStep.key].toLowerCase()}`
                ) : (
                  `Generate ${PIPELINE_STEP_LABELS[currentStep.key].toLowerCase()}`
                )}
              </button>
            </div>
          ) : (
            <span
              className={`mt-1 shrink-0 rounded-full px-5 py-2 text-xs font-bold ${project.status === "DONE" ? "bg-orange text-white" : "bg-paper text-ink-body"}`}
            >
              {project.status === "DRAFT"
                ? "Draft"
                : project.status === "DONE"
                  ? "Done"
                  : "In progress"}
            </span>
          )}
        </div>

        <section aria-label="Pipeline progress" className="mt-8">
          <ol className="flex items-center">
            {project.steps.map((step, index) => (
              <li
                aria-current={
                  currentStep?.key === step.key ? "step" : undefined
                }
                className="flex min-w-0 flex-1 items-center last:flex-none"
                key={step.key}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      step.status === "COMPLETED"
                        ? "bg-orange text-white"
                        : step.status === "RUNNING"
                          ? "bg-orange text-white"
                          : step.status === "FAILED"
                            ? "bg-orange-deep text-white"
                            : "bg-line/50 text-ink-body"
                    }`}
                  >
                    {step.status === "COMPLETED" ? "✓" : step.position + 1}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`font-editorial hidden min-w-0 truncate text-sm md:inline ${currentStep?.key === step.key ? "text-ink" : "text-ink-body"}`}
                  >
                    {PIPELINE_STEP_LABELS[step.key]}
                  </span>
                  <span className="sr-only">
                    {PIPELINE_STEP_LABELS[step.key]},{" "}
                    {stepStatusLabel(step.status, step.run.isStale)}
                  </span>
                </div>
                {index < project.steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`mx-3 h-px min-w-2 flex-1 sm:mx-4 ${step.status === "COMPLETED" ? "bg-orange" : "bg-line"}`}
                  />
                ) : null}
              </li>
            ))}
          </ol>
          {currentStep ? (
            <p className="mt-3 text-xs font-semibold text-ink-body md:hidden">
              Step {currentStep.position + 1} of {project.totalSteps} ·{" "}
              {PIPELINE_STEP_LABELS[currentStep.key]}
            </p>
          ) : null}
        </section>

        {actionError ||
        currentStep?.status === "FAILED" ||
        currentStepIsStale ? (
          <p className="mt-4 text-sm leading-6 text-orange-deep" role="alert">
            {actionError ??
              (currentStepIsStale
                ? "Generation paused. Your saved work is safe."
                : (currentStep?.run.errorMessage ??
                  "This step needs another attempt."))}
          </p>
        ) : null}

        <CompletedProjectGallery
          attempts={project.attemptHistory}
          bookText={project.bookText}
          chapters={project.chapters}
          characters={project.characters}
          createdAt={project.createdAt}
          onReadFullText={() => setSourceDialogOpen(true)}
          onStyleDraftChange={setStyleDraft}
          onViewFullStyle={() => setStyleDialogOpen(true)}
          showStyleDirection={currentStep?.key === "STYLE"}
          style={project.style}
          styleDirectionDisabled={
            currentStepIsRunning || pendingAction !== null
          }
          styleDraft={styleDraft}
        />

        <ProjectDetailDialog
          onClose={() => setSourceDialogOpen(false)}
          open={sourceDialogOpen}
          title="Full book text"
        >
          <p className="whitespace-pre-wrap">{project.bookText}</p>
        </ProjectDetailDialog>

        <ProjectDetailDialog
          onClose={() => setStyleDialogOpen(false)}
          open={styleDialogOpen}
          title="Saved art style"
        >
          <p className="whitespace-pre-wrap">{project.style}</p>
        </ProjectDetailDialog>
      </main>
    </AppShell>
  );
}
