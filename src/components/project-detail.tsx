import Link from "next/link";

import { PIPELINE_STEP_LABELS } from "@/domain/pipeline";
import type { ProjectDetailView } from "@/domain/project";
import { AppShell } from "@/components/app-shell";
import type { AuthenticatedUser } from "@/server/auth";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ProjectDetail({
  project,
  user,
}: {
  project: ProjectDetailView;
  user: AuthenticatedUser;
}) {
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
        </div>

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
                className="rounded-2xl border border-line/60 bg-surface p-4"
                key={step.key}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${
                      step.status === "COMPLETED"
                        ? "bg-ink text-white"
                        : step.status === "RUNNING"
                          ? "bg-orange text-white"
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
              Next step
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Project saved</h2>
            <p className="mt-4 text-sm leading-6 text-ink-body">
              Your source text and progress are stored on the server. Generation
              actions will be added in the next milestone.
            </p>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
