import type { PipelineStep } from "@/domain/pipeline";
import type { ProjectStepView } from "@/domain/project";
import { GenerationStatusFrame } from "@/components/generation-status-frame";
import { useEffect, useState } from "react";

const STEP_DESCRIPTIONS: Record<PipelineStep, string> = {
  STYLE: "Set the visual language.",
  CHARACTERS: "Find the adult characters.",
  PORTRAITS: "Create a portrait for each character.",
  CHAPTERS: "Write one scene prompt.",
  ILLUSTRATIONS: "Create the chapter scene.",
};

const READY_COPY: Record<PipelineStep, string> = {
  STYLE: "Ready to generate an art style.",
  CHARACTERS: "Ready to find the adult characters.",
  PORTRAITS: "Ready to generate character portraits.",
  CHAPTERS: "Ready to write a chapter prompt.",
  ILLUSTRATIONS: "Ready to generate the chapter illustration.",
};

const RUNNING_COPY: Record<PipelineStep, string> = {
  STYLE: "Reading the book and defining an art style",
  CHARACTERS: "Finding adult characters and writing portrait prompts",
  PORTRAITS: "Generating character portraits",
  CHAPTERS: "Writing a chapter illustration prompt",
  ILLUSTRATIONS: "Generating the chapter illustration",
};

function formatElapsed(startedAt: string | null, now: number): string | null {
  if (!startedAt) return null;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1_000),
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}

export function StepActionPanel({
  actionError,
  currentStep,
  onRecover,
  onRun,
  pending,
  styleDraft,
  onStyleDraftChange,
  implementedPipelineComplete = false,
  textPipelineComplete = false,
  itemProgress,
}: {
  actionError: string | null;
  currentStep: ProjectStepView | null;
  onRecover: () => void;
  onRun: () => void;
  pending: boolean;
  styleDraft: string;
  onStyleDraftChange: (value: string) => void;
  implementedPipelineComplete?: boolean;
  textPipelineComplete?: boolean;
  itemProgress?: {
    label: string;
    saved: number;
    total: number;
  };
}) {
  // Kept in the public prop shape for the untracked workspace variant; M4 now
  // treats all five steps as implemented, so the completion copy is uniform.
  void implementedPipelineComplete;
  void textPipelineComplete;

  const currentStepStatus = currentStep?.status;
  const currentStepRun = currentStep?.run;
  const stale = currentStepStatus === "RUNNING" && currentStepRun?.isStale;
  const running = currentStepStatus === "RUNNING" && !stale;
  const failed = currentStepStatus === "FAILED";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || !currentStepRun?.claimedAt) return;
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(interval);
  }, [currentStepRun?.claimedAt, running]);

  if (!currentStep) {
    return (
      <GenerationStatusFrame
        detail="Results are saved and ready to revisit."
        eyebrow="COMPLETE"
        message="All five steps are complete."
        meta="Saved"
        progress="complete"
      />
    );
  }

  const { key, run } = currentStep;

  if (running || stale || failed) {
    const elapsed = formatElapsed(run.claimedAt, now);
    const runningMeta = elapsed ? `Elapsed ${elapsed}` : "Working…";

    return (
      <GenerationStatusFrame
        action={
          stale
            ? {
                disabled: pending,
                label: pending ? "Recovering…" : "Recover run",
                onClick: onRecover,
              }
            : failed
              ? {
                  disabled: pending,
                  label: pending ? "Retrying…" : `Retry ${key.toLowerCase()}`,
                  onClick: onRun,
                }
              : undefined
        }
        detail={
          running && itemProgress
            ? `${itemProgress.saved} of ${itemProgress.total} ${itemProgress.label} saved`
            : undefined
        }
        eyebrow={running ? "GENERATING" : stale ? "RECOVERY" : "RETRY"}
        message={
          running
            ? `${RUNNING_COPY[key]}. Results save as they finish; you can leave this page.`
            : stale
              ? "Generation paused. Your saved work is safe."
              : (run.errorMessage ?? "This step failed before it could finish.")
        }
        meta={
          running ? runningMeta : stale ? "Ready to recover" : "Ready to retry"
        }
        notice={actionError}
        progress={running ? "running" : stale ? "paused" : "failed"}
      />
    );
  }

  if (key !== "STYLE") {
    return (
      <GenerationStatusFrame
        action={{
          disabled: pending,
          label: pending ? "Starting…" : `Generate ${key.toLowerCase()}`,
          onClick: onRun,
        }}
        eyebrow="READY"
        message={READY_COPY[key]}
        meta="Waiting for action"
        notice={actionError}
        progress="ready"
      />
    );
  }

  return (
    <section
      aria-labelledby="step-action-heading"
      className="rounded-xl border border-line/50 bg-surface p-5 shadow-[0_2px_8px_rgba(35,31,32,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" id="step-action-heading">
            {running
              ? RUNNING_COPY[key]
              : stale
                ? `${key === "STYLE" ? "Style" : String(key).toLowerCase()} run needs recovery`
                : failed
                  ? `Retry ${String(key).toLowerCase()}`
                  : "Create the art style"}
          </h2>
        </div>
        {run.attempt > 1 ? (
          <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink-body">
            Attempt {run.attempt}
          </span>
        ) : null}
      </div>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-body">
        {STEP_DESCRIPTIONS[key]}
      </p>
      {key === "STYLE" ? (
        <div className="mt-4">
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="style-draft"
          >
            Style direction{" "}
            <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            className="min-h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-orange focus:ring-4 focus:ring-orange/15"
            id="style-draft"
            maxLength={500}
            onChange={(event) => onStyleDraftChange(event.target.value)}
            placeholder="Leave blank to generate a style from the book"
            value={styleDraft}
          />
          <p className="mt-2 text-xs text-ink-muted">
            {styleDraft.length}/500 characters
          </p>
        </div>
      ) : null}
      <button
        className="group mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange px-5 text-sm font-bold text-white shadow-[0_2px_6px_rgba(255,107,0,0.2)] transition hover:bg-orange-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/20 disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={onRun}
        type="button"
      >
        {pending
          ? "Starting…"
          : key === "STYLE" && styleDraft.trim()
            ? "Use this style"
            : "Generate style"}
        {!pending ? (
          <span
            aria-hidden="true"
            className="text-lg font-normal leading-none transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        ) : null}
      </button>

      {actionError ? (
        <p
          className="mt-4 rounded-xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm leading-6 text-orange-deep"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
