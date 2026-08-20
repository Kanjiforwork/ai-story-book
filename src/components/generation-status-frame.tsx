export type GenerationStatusFrameProgress =
  "ready" | "running" | "paused" | "failed" | "complete";

export function GenerationStatusFrame({
  action,
  detail,
  eyebrow,
  message,
  meta,
  notice,
  progress,
}: {
  action?: {
    disabled?: boolean;
    label: string;
    onClick: () => void;
  };
  detail?: string;
  eyebrow: string;
  message: string;
  meta: string;
  notice?: string | null;
  progress: GenerationStatusFrameProgress;
}) {
  const isLive = progress === "running";
  const isAlert = progress === "paused" || progress === "failed";
  const progressLabel = `${eyebrow}: ${message}`;

  return (
    <section
      aria-live={isLive || isAlert ? "polite" : undefined}
      aria-label={progressLabel}
      className="rounded-[1.25rem] border border-line/45 bg-surface px-5 py-5 shadow-[0_10px_28px_rgba(35,31,32,0.045)] sm:px-6 sm:py-6"
      role={isAlert ? "alert" : "status"}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange">
            {eyebrow}
          </p>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-ink">
            {message}
          </p>
        </div>
        <p className="shrink-0 pt-0.5 text-xs font-medium tabular-nums text-ink-muted">
          {meta}
        </p>
      </div>

      {progress === "running" ? (
        <div className="mt-5">
          <div
            aria-label={`Progress for ${eyebrow.toLowerCase()}`}
            className="relative h-1.5 overflow-hidden rounded-full bg-orange/15"
            role="progressbar"
          >
            <span className="generation-progress-bar" />
          </div>
          {detail ? (
            <p className="mt-3 text-sm text-ink-muted">{detail}</p>
          ) : null}
        </div>
      ) : null}

      {progress !== "running" && (action || detail || notice) ? (
        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          {detail || notice ? (
            <p
              className={`min-w-0 flex-1 text-sm leading-6 ${notice ? "text-orange-deep" : "text-ink-muted"}`}
            >
              {notice ?? detail}
            </p>
          ) : (
            <span aria-hidden="true" className="hidden flex-1 sm:block" />
          )}
          {action ? (
            <button
              className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-bold text-orange-deep transition hover:bg-orange/10 hover:text-orange focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/15 disabled:cursor-wait disabled:opacity-60"
              disabled={action.disabled}
              onClick={action.onClick}
              type="button"
            >
              {action.label}
              {!action.disabled ? (
                <span
                  aria-hidden="true"
                  className="text-lg font-normal leading-none transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}

      {progress === "running" && notice ? (
        <p className="mt-3 text-sm leading-6 text-orange-deep" role="alert">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
