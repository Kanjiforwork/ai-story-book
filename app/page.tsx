import { PIPELINE_STEP_LABELS, PIPELINE_STEPS } from "@/domain/pipeline";

export default function Home() {
  return (
    <main className="min-h-svh bg-canvas px-5 py-6 text-ink sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-line/60 pb-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-orange text-sm font-black text-white"
            >
              G
            </span>
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-ink-body">
                GRADION
              </p>
              <p className="text-xs text-ink-muted">Book Illustration Studio</p>
            </div>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-body">
            Foundation ready
          </span>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-orange">
              Local creative workspace
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              Give a story a visual world.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-ink-body">
              The studio foundation is in place. The five-step illustration flow
              will arrive next, with each result saved locally as it is created.
            </p>
            <a
              className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-orange px-5 text-sm font-bold text-white transition hover:bg-orange-hover"
              href="#pipeline"
            >
              View pipeline foundation{" "}
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            </a>
          </div>

          <section
            aria-labelledby="pipeline-heading"
            className="rounded-3xl bg-paper p-6 shadow-[0_16px_50px_rgba(35,31,32,0.08)] sm:p-8"
            id="pipeline"
          >
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  Pipeline contract
                </p>
                <h2
                  id="pipeline-heading"
                  className="mt-2 text-2xl font-semibold"
                >
                  Five deliberate steps
                </h2>
              </div>
              <span className="text-xs font-semibold text-ink-muted">M0</span>
            </div>

            <ol className="space-y-3">
              {PIPELINE_STEPS.map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-4 rounded-2xl border border-line/70 bg-surface px-4 py-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {PIPELINE_STEP_LABELS[step]}
                    </p>
                    <p className="text-sm text-ink-muted">
                      Pending implementation
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-6 border-t border-line/60 pt-5 text-sm leading-6 text-ink-body">
              Generation limits are enforced by the shared contract: up to 2
              adult characters and 1 chapter.
            </p>
          </section>
        </section>

        <footer className="border-t border-line/60 pt-5 text-xs text-ink-muted">
          Local-first foundation · No Gemini calls are made by this milestone.
        </footer>
      </div>
    </main>
  );
}
