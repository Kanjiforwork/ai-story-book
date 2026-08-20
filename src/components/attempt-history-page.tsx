import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { AttemptHistoryList } from "@/components/step-attempt-history";
import type { ProjectAttemptHistoryItem } from "@/domain/project";
import type { AuthenticatedUser } from "@/server/auth";

export function AttemptHistoryPage({
  attempts,
  user,
}: {
  attempts: ProjectAttemptHistoryItem[];
  user: AuthenticatedUser;
}) {
  return (
    <AppShell activeNavigation="attempts" user={user}>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange">
            Generation activity
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Attempts
          </h1>
          <p className="mt-3 text-sm text-ink-body">
            All project attempts, newest first.
          </p>
        </div>

        {attempts.length > 0 ? (
          <AttemptHistoryList attempts={attempts} showProjectLinks />
        ) : (
          <section className="rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center sm:px-10">
            <p className="text-lg font-semibold">No attempts yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-body">
              Run the first pipeline step in a project and its attempt will
              appear here.
            </p>
            <Link
              className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-ink px-4 text-sm font-bold text-ink transition hover:bg-ink hover:text-white"
              href="/projects"
            >
              View projects
            </Link>
          </section>
        )}
      </main>
    </AppShell>
  );
}
