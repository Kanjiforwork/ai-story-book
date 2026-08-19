import Link from "next/link";

import type { ProjectSummary } from "@/domain/project";
import { AppShell } from "@/components/app-shell";
import type { AuthenticatedUser } from "@/server/auth";

const STATUS_LABELS = {
  DRAFT: "Draft",
  IN_PROGRESS: "In progress",
  DONE: "Done",
} as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProjectList({
  projects,
  user,
}: {
  projects: ProjectSummary[];
  user: AuthenticatedUser;
}) {
  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange">
              Your workspace
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
              Projects
            </h1>
          </div>
          <Link
            className="inline-flex min-h-12 items-center rounded-xl bg-orange px-5 text-sm font-bold text-white transition hover:bg-orange-hover"
            href="/projects/new"
          >
            New project{" "}
            <span aria-hidden="true" className="ml-2">
              →
            </span>
          </Link>
        </div>

        {projects.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center sm:px-10">
            <p className="text-lg font-semibold">No projects yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-body">
              Start with a book title and its text. Your project will stay here
              when you return.
            </p>
            <Link
              className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-ink px-4 text-sm font-bold text-ink transition hover:bg-ink hover:text-white"
              href="/projects/new"
            >
              Create your first project
            </Link>
          </section>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  className="group flex flex-col gap-5 rounded-2xl border border-line/60 bg-surface p-5 transition hover:-translate-y-0.5 hover:border-orange/50 hover:shadow-[0_10px_30px_rgba(35,31,32,0.08)] sm:flex-row sm:items-center sm:px-6"
                  href={`/projects/${project.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-ink group-hover:text-orange">
                      {project.title}
                    </span>
                    <span className="mt-1 block text-xs text-ink-muted">
                      Created {formatDate(project.createdAt)}
                    </span>
                  </span>
                  <span
                    aria-label={`${project.completedSteps} of ${project.totalSteps} steps complete`}
                    className="flex items-center gap-1.5"
                  >
                    {Array.from({ length: project.totalSteps }, (_, index) => (
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-7 rounded-full ${index < project.completedSteps ? "bg-orange" : "bg-line/70"}`}
                        key={index}
                      />
                    ))}
                  </span>
                  <span
                    className={`inline-flex min-h-8 items-center justify-center rounded-full px-3 text-xs font-bold ${
                      project.status === "DONE"
                        ? "bg-ink text-white"
                        : project.status === "IN_PROGRESS"
                          ? "bg-orange text-white"
                          : "bg-line/50 text-ink-body"
                    }`}
                  >
                    {STATUS_LABELS[project.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
