"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  IMPLEMENTED_PIPELINE_STEPS,
  PIPELINE_STEP_LABELS,
  isImplementedPipelineStep,
} from "@/domain/pipeline";
import type { GenerationRunView, ProjectDetailView } from "@/domain/project";
import { AppShell } from "@/components/app-shell";
import { ChapterList } from "@/components/chapter-list";
import { CharacterGrid } from "@/components/character-grid";
import { StepActionPanel } from "@/components/step-action-panel";
import type { AuthenticatedUser } from "@/server/auth";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  const [regenerating, setRegenerating] = useState(false);
  const latestRefreshId = useRef(0);
  const implementedSteps = project.steps.filter((step) =>
    isImplementedPipelineStep(step.key),
  );
  const selectedRun = project.generationRuns?.find((run) => run.isSelected);
  const selectedRunReadOnly = project.selectedRunReadOnly ?? false;
  const currentStep = selectedRunReadOnly
    ? null
    : (implementedSteps.find((step) => step.status !== "COMPLETED") ?? null);
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

  async function selectRun(run: GenerationRunView) {
    setActionError(null);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/generation-runs/${run.id}/select`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setActionError(payload.message ?? "This run could not be selected.");
        return;
      }
      await refreshProject();
    } catch {
      setActionError("The server could not be reached. Try again.");
    }
  }

  async function regenerateRun() {
    const style = styleDraft.trim();
    if (
      !window.confirm(
        "Start a new generation run? Existing results will remain available as a previous run.",
      )
    ) {
      return;
    }
    setRegenerating(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/generation-runs`,
        {
          body: JSON.stringify({ style }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setActionError(
          payload.message ?? "A new generation run could not start.",
        );
        return;
      }
      setStyleDraft("");
      await refreshProject();
    } catch {
      setActionError("The server could not be reached. Try again.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-ink-body hover:bg-paper hover:text-ink"
          href="/projects"
        >
          ← Back to projects
        </Link>

        <div className="mt-6 border-b border-line/60 pb-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange">
            Project workspace
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            {project.title}
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            Created {formatDate(project.createdAt)} · {project.completedSteps}{" "}
            of {project.totalSteps} steps complete
          </p>
          {selectedRun ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {selectedRunReadOnly
                ? "Viewing previous run"
                : "Current generation run"}{" "}
              · {selectedRun.style ?? "Style pending"}
            </p>
          ) : null}
        </div>

        {project.generationRuns && project.generationRuns.length > 1 ? (
          <section
            aria-labelledby="runs-heading"
            className="mt-8 rounded-3xl bg-paper p-6 sm:p-8"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  Generation history
                </p>
                <h2 className="mt-2 text-2xl font-semibold" id="runs-heading">
                  Choose a saved run
                </h2>
              </div>
              <span className="text-xs text-ink-muted">
                Selecting a run does not call Gemini
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {project.generationRuns.map((run) => (
                <article
                  className="rounded-2xl border border-line/60 bg-surface p-4"
                  key={run.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {run.style ?? "Style pending"}
                      </h3>
                      <p className="mt-1 text-xs text-ink-muted">
                        {run.completedSteps} of {run.totalSteps} steps ·{" "}
                        {run.status.toLowerCase()}
                      </p>
                    </div>
                    {run.isSelected ? (
                      <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-white">
                        Selected
                      </span>
                    ) : (
                      <button
                        className="min-h-10 rounded-xl border border-line px-3 text-xs font-bold text-ink-body transition hover:border-orange hover:text-orange-deep"
                        onClick={() => void selectRun(run)}
                        type="button"
                      >
                        Use previous run
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="stepper-heading" className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold" id="stepper-heading">
              Pipeline progress
            </h2>
            <span className="rounded-full bg-line/40 px-3 py-1 text-xs font-bold text-ink-body">
              {project.status === "DRAFT"
                ? "Draft"
                : project.status === "DONE"
                  ? "Done"
                  : "In progress"}
            </span>
          </div>
          <ol className="grid gap-3 sm:grid-cols-5">
            {project.steps.map((step) => (
              <li
                aria-current={
                  currentStep?.key === step.key ? "step" : undefined
                }
                className={`rounded-2xl border p-4 ${currentStep?.key === step.key ? "border-orange/50 bg-orange/5" : "border-line/60 bg-surface"}`}
                key={step.key}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${
                      step.status === "COMPLETED"
                        ? "bg-ink text-white"
                        : step.status === "RUNNING"
                          ? "bg-orange text-white"
                          : step.status === "FAILED"
                            ? "bg-orange-deep text-white"
                            : "bg-line/50 text-ink-body"
                    }`}
                  >
                    {step.status === "COMPLETED" ? "✓" : step.position + 1}
                  </span>
                  <span className="text-sm font-semibold">
                    {PIPELINE_STEP_LABELS[step.key]}
                  </span>
                </div>
                <p className="mt-3 text-xs text-ink-muted">
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

        <div className="mt-8">
          {selectedRunReadOnly ? (
            <section className="rounded-3xl border border-line/60 bg-paper p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                Read-only history
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Saved output from a previous run
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-body">
                Use these results for reference, or start a new generation run
                when you want fresh output.
              </p>
              <button
                className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-orange px-4 text-sm font-bold text-white transition hover:bg-orange-hover disabled:opacity-60"
                disabled={regenerating}
                onClick={() => void regenerateRun()}
                type="button"
              >
                {regenerating ? "Starting…" : "Regenerate"}
              </button>
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
            />
          )}
        </div>

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

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section
            aria-labelledby="book-text-heading"
            className="rounded-3xl bg-surface p-6 shadow-[0_10px_35px_rgba(35,31,32,0.06)] sm:p-8"
          >
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  Source material
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold"
                  id="book-text-heading"
                >
                  Full book text
                </h2>
              </div>
              <span className="text-xs text-ink-muted">
                {project.bookText.length.toLocaleString()} characters
              </span>
            </div>
            <div className="max-h-[32rem] overflow-y-auto rounded-2xl border border-line/60 bg-paper p-5 text-sm leading-7 text-ink-body whitespace-pre-wrap">
              {project.bookText}
            </div>
          </section>

          <aside className="rounded-3xl bg-paper p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
              Art style
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {project.style ? "Saved style" : "Style not generated"}
            </h2>
            <p className="mt-4 text-sm leading-6 text-ink-body">
              {project.style ??
                "Generate Style first. Characters will use the saved style as context."}
            </p>
            {!selectedRunReadOnly && currentStep?.key !== "STYLE" ? (
              <div className="mt-6 border-t border-line/60 pt-5">
                <label
                  className="block text-sm font-semibold"
                  htmlFor="regenerate-style"
                >
                  New style for a fresh run
                </label>
                <input
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-orange focus:ring-4 focus:ring-orange/15"
                  id="regenerate-style"
                  maxLength={500}
                  onChange={(event) => setStyleDraft(event.target.value)}
                  placeholder="e.g. ink wash with copper accents"
                  value={styleDraft}
                />
                <button
                  className="mt-3 min-h-11 rounded-xl border border-orange px-4 text-sm font-bold text-orange-deep transition hover:bg-orange hover:text-white disabled:opacity-60"
                  disabled={regenerating}
                  onClick={() => void regenerateRun()}
                  type="button"
                >
                  {regenerating ? "Starting…" : "Start new run"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
