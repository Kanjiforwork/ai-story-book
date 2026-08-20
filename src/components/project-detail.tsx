"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  IMPLEMENTED_PIPELINE_STEPS,
  PIPELINE_STEP_LABELS,
  isImplementedPipelineStep,
} from "@/domain/pipeline";
import type { ProjectDetailView } from "@/domain/project";
import { AppShell } from "@/components/app-shell";
import { ChapterList } from "@/components/chapter-list";
import { CharacterGrid } from "@/components/character-grid";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import { StepActionPanel } from "@/components/step-action-panel";
import type { AuthenticatedUser } from "@/server/auth";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function sourcePreview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 220 ? `${compact.slice(0, 220)}…` : compact;
}

function stylePreview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}…` : compact;
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
  const [retryingCharacterId, setRetryingCharacterId] = useState<string | null>(
    null,
  );
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
  const portraitProgress = {
    label: "portraits",
    saved: project.characters.filter(
      (character) => character.portrait.status === "COMPLETED",
    ).length,
    total: project.characters.length,
  };
  const illustrationProgress = {
    label: "illustration",
    saved: project.chapters.filter(
      (chapter) => chapter.illustration.status === "COMPLETED",
    ).length,
    total: project.chapters.length,
  };
  const itemProgress =
    currentStep?.key === "PORTRAITS" && portraitProgress.total > 0
      ? portraitProgress
      : currentStep?.key === "ILLUSTRATIONS" && illustrationProgress.total > 0
        ? illustrationProgress
        : undefined;
  const implementedPipelineComplete =
    implementedSteps.length === IMPLEMENTED_PIPELINE_STEPS.length &&
    implementedSteps.every((step) => step.status === "COMPLETED");
  const shouldPoll = project.steps.some(
    (step) =>
      isImplementedPipelineStep(step.key) &&
      step.status === "RUNNING" &&
      !step.run.isStale,
  );
  const portraitStep = project.steps.find((step) => step.key === "PORTRAITS");
  const styleNeedsDialog = Boolean(project.style && project.style.length > 180);

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

  async function retryPortrait(characterId: string) {
    setRetryingCharacterId(characterId);
    setPendingAction("run");
    setActionError(null);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/portraits/${characterId}/retry`,
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
        setActionError(
          payload.message ?? "This portrait could not be retried.",
        );
        return;
      }
      await refreshProject();
    } catch {
      setActionError("The server could not be reached. Try again.");
    } finally {
      setRetryingCharacterId(null);
      setPendingAction(null);
    }
  }

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-ink-body hover:bg-paper hover:text-ink"
          href="/projects"
        >
          ← Back to projects
        </Link>

        <div className="mt-4 border-b border-line/60 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange">
            Project workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {project.title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Created {formatDate(project.createdAt)} · {project.completedSteps}{" "}
            of {project.totalSteps} steps complete
          </p>
        </div>

        <section aria-labelledby="stepper-heading" className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold" id="stepper-heading">
              Pipeline progress
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${project.status === "DONE" ? "bg-orange text-white" : "bg-line/40 text-ink-body"}`}
            >
              {project.status === "DRAFT"
                ? "Draft"
                : project.status === "DONE"
                  ? "Done"
                  : "In progress"}
            </span>
          </div>
          <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {project.steps.map((step) => (
              <li
                aria-current={
                  currentStep?.key === step.key ? "step" : undefined
                }
                className={`min-w-0 rounded-xl border p-2.5 sm:p-3 ${currentStep?.key === step.key ? "border-orange/50 bg-orange/5" : "border-line/60 bg-surface"}`}
                key={step.key}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold sm:size-8 sm:text-xs ${
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
                  <span className="hidden min-w-0 truncate text-xs font-semibold sm:inline">
                    {PIPELINE_STEP_LABELS[step.key]}
                  </span>
                </div>
                <p className="mt-2 text-[10px] text-ink-muted sm:text-xs">
                  {step.status === "COMPLETED"
                    ? "Complete"
                    : step.status === "RUNNING" && step.run.isStale
                      ? "Interrupted"
                      : step.status === "RUNNING"
                        ? "Running"
                        : step.status === "FAILED"
                          ? "Needs attention"
                          : "Pending"}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-5 space-y-4">
          {selectedRunReadOnly ? (
            <section className="rounded-2xl border border-line/60 bg-paper px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange text-sm font-bold text-white">
                  ✓
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                    Saved results
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Results are ready to revisit.
                  </h2>
                </div>
                <p className="text-sm leading-6 text-ink-body sm:ml-auto">
                  Saved output is kept here so you can review it safely.
                </p>
              </div>
            </section>
          ) : (
            <StepActionPanel
              actionError={actionError}
              currentStep={currentStep}
              onRecover={recoverCurrentStep}
              onRun={runCurrentStep}
              onStyleDraftChange={setStyleDraft}
              pending={pendingAction !== null}
              styleDraft={styleDraft}
              implementedPipelineComplete={implementedPipelineComplete}
              itemProgress={itemProgress}
            />
          )}
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <section
              aria-labelledby="style-context-heading"
              className="flex min-h-56 flex-col rounded-2xl bg-surface p-5 sm:p-6"
            >
              <h2 className="text-xl font-semibold" id="style-context-heading">
                Art style
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-body">
                {project.style
                  ? stylePreview(project.style)
                  : "Generate Style first. Characters will use the saved style as context."}
              </p>
              {styleNeedsDialog ? (
                <button
                  className="mt-auto inline-flex min-h-11 self-start items-center rounded-xl px-2 py-2 text-sm font-semibold text-orange-deep underline decoration-line underline-offset-4 transition hover:bg-orange/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/15"
                  onClick={() => setStyleDialogOpen(true)}
                  type="button"
                >
                  View full style
                </button>
              ) : null}
            </section>

            <section
              aria-labelledby="source-context-heading"
              className="flex min-h-56 flex-col rounded-2xl bg-surface p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  className="text-xl font-semibold"
                  id="source-context-heading"
                >
                  Book text
                </h2>
                <span className="shrink-0 text-right text-xs tabular-nums text-ink-muted">
                  {project.bookText.length.toLocaleString()} chars
                </span>
              </div>
              <p className="mt-3 text-sm italic leading-6 text-ink-body">
                {sourcePreview(project.bookText)}
              </p>
              <button
                className="mt-auto inline-flex min-h-11 self-start items-center rounded-xl px-2 py-2 text-sm font-semibold text-orange-deep underline decoration-line underline-offset-4 transition hover:bg-orange/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/15"
                onClick={() => setSourceDialogOpen(true)}
                type="button"
              >
                Read full text
              </button>
            </section>
          </div>
        </div>

        {project.characters.length > 0 || project.chapters.length > 0 ? (
          <div className="mt-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-line/60" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
              Generated results
            </p>
            <div className="h-px flex-1 bg-line/60" />
          </div>
        ) : null}

        <CharacterGrid
          characters={project.characters}
          onRetry={
            !selectedRunReadOnly &&
            portraitStep?.status === "FAILED" &&
            !portraitStep.run.isStale
              ? retryPortrait
              : undefined
          }
          readOnly={selectedRunReadOnly}
          retryDisabled={pendingAction !== null}
          retryingCharacterId={retryingCharacterId}
        />

        <ChapterList
          chapters={project.chapters}
          readOnly={selectedRunReadOnly}
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
