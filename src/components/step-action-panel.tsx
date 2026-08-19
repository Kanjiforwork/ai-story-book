import type { PipelineStep } from "@/domain/pipeline";
import type { ProjectStepView } from "@/domain/project";

const STEP_DESCRIPTIONS: Record<PipelineStep, string> = {
  STYLE: "Set a visual language for every illustration in this project.",
  CHARACTERS: "Find the main adult characters and prepare portrait prompts.",
  PORTRAITS: "Create one saved 3:4 portrait for each adult character.",
  CHAPTERS:
    "Write one chapter illustration prompt using the saved characters and portraits.",
  ILLUSTRATIONS:
    "Create one scene illustration using the saved chapter and portraits.",
};

const RUNNING_COPY: Record<PipelineStep, string> = {
  STYLE: "Reading the book and defining an art style",
  CHARACTERS: "Finding adult characters and writing portrait prompts",
  PORTRAITS: "Generating character portraits",
  CHAPTERS: "Writing a chapter illustration prompt",
  ILLUSTRATIONS: "Generating the chapter illustration",
};

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
}) {
  // Kept in the public prop shape for the untracked workspace variant; M4 now
  // treats all five steps as implemented, so the completion copy is uniform.
  void implementedPipelineComplete;
  void textPipelineComplete;

  if (!currentStep) {
    return (
      <section className="rounded-3xl border border-ink/10 bg-surface p-6 shadow-[0_10px_35px_rgba(35,31,32,0.06)] sm:p-8">
        <div className="flex items-center gap-3 text-sm font-semibold text-ink">
          <span className="flex size-8 items-center justify-center rounded-full bg-ink text-white">
            ✓
          </span>
          All five pipeline steps are complete.
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-body">
          Nothing regenerates automatically. Your generated results remain saved
          when you return.
        </p>
      </section>
    );
  }

  const { key, run, status } = currentStep;
  const stale = status === "RUNNING" && run.isStale;
  const running = status === "RUNNING" && !stale;
  const failed = status === "FAILED";

  return (
    <section
      aria-labelledby="step-action-heading"
      className="rounded-3xl border border-ink/10 bg-surface p-6 shadow-[0_10px_35px_rgba(35,31,32,0.06)] sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange">
            Next action
          </p>
          <h2 className="mt-2 text-2xl font-semibold" id="step-action-heading">
            {running
              ? RUNNING_COPY[key]
              : stale
                ? `${key === "STYLE" ? "Style" : key.toLowerCase()} run needs recovery`
                : failed
                  ? `Retry ${key.toLowerCase()}`
                  : `Ready for ${key.toLowerCase()}`}
          </h2>
        </div>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink-body">
          Attempt {Math.max(run.attempt, 1)}
        </span>
      </div>

      {running ? (
        <div
          aria-live="polite"
          className="mt-6 rounded-2xl border border-orange/25 bg-orange/10 px-4 py-4 text-sm font-semibold text-orange-deep"
        >
          <span aria-hidden="true" className="mr-3 inline-block animate-spin">
            ◌
          </span>
          {RUNNING_COPY[key]}. You can leave this page; progress is saved on the
          server.
        </div>
      ) : stale ? (
        <div
          className="mt-6 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-4 text-sm leading-6 text-orange-deep"
          role="alert"
        >
          This run stopped responding. Recover it first; completed earlier work
          is untouched.
          <button
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-orange-deep px-4 text-sm font-bold text-orange-deep transition hover:bg-orange-deep hover:text-white"
            disabled={pending}
            onClick={onRecover}
            type="button"
          >
            {pending ? "Recovering…" : "Recover run"}
          </button>
        </div>
      ) : failed ? (
        <div
          className="mt-6 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-4 text-sm leading-6 text-orange-deep"
          role="alert"
        >
          <p>
            {run.errorMessage ?? "This step failed before it could finish."}
          </p>
          <button
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-orange px-4 text-sm font-bold text-white transition hover:bg-orange-hover"
            disabled={pending}
            onClick={onRun}
            type="button"
          >
            {pending ? "Retrying…" : `Retry ${key.toLowerCase()}`}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-body">
            {STEP_DESCRIPTIONS[key]}
          </p>
          {key === "STYLE" ? (
            <div className="mt-6">
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="style-draft"
              >
                Art style{" "}
                <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-ink-muted focus:border-orange focus:ring-4 focus:ring-orange/15"
                id="style-draft"
                maxLength={500}
                onChange={(event) => onStyleDraftChange(event.target.value)}
                placeholder="Leave blank and Gemini will choose from the book"
                value={styleDraft}
              />
              <p className="mt-2 text-xs text-ink-muted">
                {styleDraft.length}/500 characters
              </p>
            </div>
          ) : null}
          <button
            className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-orange px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-orange-hover disabled:cursor-wait disabled:opacity-60"
            disabled={pending}
            onClick={onRun}
            type="button"
          >
            {pending ? "Starting…" : `Generate ${key.toLowerCase()}`}
            {!pending ? (
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            ) : null}
          </button>
        </>
      )}

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
