import Link from "next/link";

import { PIPELINE_STEP_LABELS } from "@/domain/pipeline";
import type { ProjectAttemptHistoryItem } from "@/domain/project";

function formatAttemptDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

const STATUS_LABELS = {
  COMPLETED: "Completed",
  FAILED: "Failed",
  RUNNING: "Running",
} as const;

export function AttemptHistoryList({
  attempts,
  showProjectLinks = false,
}: {
  attempts: ProjectAttemptHistoryItem[];
  showProjectLinks?: boolean;
}) {
  return (
    <ol
      aria-label={showProjectLinks ? undefined : "Project attempts"}
      className={
        showProjectLinks
          ? "space-y-3"
          : "max-h-72 divide-y divide-line/50 overflow-y-auto overscroll-contain rounded-xl border border-line/50 bg-surface outline-none focus-visible:ring-4 focus-visible:ring-orange/15"
      }
      tabIndex={!showProjectLinks && attempts.length > 4 ? 0 : undefined}
    >
      {attempts.map((attempt) => {
        const status = (
          <span
            className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold ${
              attempt.status === "COMPLETED"
                ? "bg-ink text-white"
                : attempt.status === "FAILED"
                  ? "bg-orange-deep text-white"
                  : "bg-orange text-white"
            }`}
          >
            {STATUS_LABELS[attempt.status]}
          </span>
        );

        if (showProjectLinks) {
          return (
            <li key={attempt.id}>
              <Link
                className="group block rounded-xl border border-line/50 bg-surface px-4 py-3 outline-none transition hover:-translate-y-0.5 hover:border-orange/50 hover:shadow-[0_8px_24px_rgba(35,31,32,0.07)] focus-visible:ring-4 focus-visible:ring-orange/15 sm:px-5"
                href={`/projects/${attempt.projectId}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink group-hover:text-orange">
                      {attempt.projectTitle}
                    </p>
                    <p className="mt-1 truncate text-xs text-ink-muted">
                      <span className="font-semibold text-ink-body">
                        {PIPELINE_STEP_LABELS[attempt.step]}
                      </span>{" "}
                      · Attempt {attempt.attempt} ·{" "}
                      {formatAttemptDate(attempt.claimedAt)}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    {status}
                    <span
                      aria-hidden="true"
                      className="text-lg text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-orange"
                    >
                      →
                    </span>
                  </span>
                </div>
                {attempt.errorMessage ? (
                  <p className="mt-2 truncate text-xs text-orange-deep">
                    {attempt.errorMessage}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        }

        return (
          <li className="px-3 py-2.5 sm:px-4" key={attempt.id}>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-ink-body">
                <span className="font-semibold text-ink">
                  {PIPELINE_STEP_LABELS[attempt.step]}
                </span>{" "}
                · Attempt {attempt.attempt}
              </p>
              {status}
            </div>
            <p className="mt-1 truncate text-xs text-ink-muted">
              {formatAttemptDate(attempt.claimedAt)}
            </p>
            {attempt.errorMessage ? (
              <p className="mt-1 truncate text-xs text-orange-deep">
                {attempt.errorMessage}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ProjectAttemptHistory({
  attempts,
}: {
  attempts: ProjectAttemptHistoryItem[];
}) {
  if (attempts.length === 0) return null;

  return (
    <details className="group mt-6 rounded-2xl border border-line/60 bg-surface">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-4 py-3 outline-none transition hover:bg-paper focus-visible:ring-4 focus-visible:ring-orange/15 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-lg font-semibold text-ink">
            Attempt history
          </span>
          <span className="mt-1 block text-sm text-ink-muted">
            {attempts.length} saved{" "}
            {attempts.length === 1 ? "attempt" : "attempts"}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="text-xl text-ink-muted transition-transform group-open:rotate-180"
        >
          ↓
        </span>
      </summary>
      <div className="border-t border-line/60 bg-canvas/40 p-3 sm:p-4">
        <AttemptHistoryList attempts={attempts} />
      </div>
    </details>
  );
}
