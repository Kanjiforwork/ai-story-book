import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { NewProjectForm } from "@/components/new-project-form";
import { getCurrentPageUser } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await getCurrentPageUser();
  if (!user) redirect("/");

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange">
          New project
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
          Start an illustration project
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-ink-body">
          Save the title and source text first. You can reopen this project at
          any time.
        </p>
        <section className="mt-8 rounded-3xl bg-surface p-6 shadow-[0_10px_35px_rgba(35,31,32,0.06)] sm:p-8">
          <NewProjectForm />
        </section>
      </main>
    </AppShell>
  );
}
