import Image from "next/image";

import type { ChapterView } from "@/domain/project";

function illustrationStatusCopy(chapter: ChapterView): string {
  if (chapter.illustration.status === "COMPLETED") return "Illustration saved";
  if (chapter.illustration.isStale) return "Run interrupted";
  if (chapter.illustration.status === "RUNNING") {
    return "Generating illustration";
  }
  if (chapter.illustration.status === "FAILED") return "Illustration failed";
  return "Illustration pending";
}

function illustrationStatusClass(chapter: ChapterView): string {
  if (chapter.illustration.status === "COMPLETED") {
    return "border-ink/20 bg-ink text-white";
  }
  if (
    chapter.illustration.status === "FAILED" ||
    chapter.illustration.isStale
  ) {
    return "border-orange/35 bg-orange/10 text-orange-deep";
  }
  if (chapter.illustration.status === "RUNNING") {
    return "border-orange/35 bg-orange/10 text-orange-deep";
  }
  return "border-line bg-surface text-ink-muted";
}

function chapterProgressCopy(chapters: ChapterView[]): string {
  const completedCount = chapters.filter(
    (chapter) => chapter.illustration.status === "COMPLETED",
  ).length;
  const hasFailure = chapters.some(
    (chapter) =>
      chapter.illustration.status === "FAILED" || chapter.illustration.isStale,
  );
  const hasRunning = chapters.some(
    (chapter) => chapter.illustration.status === "RUNNING",
  );

  if (hasFailure) {
    return `${completedCount} of ${chapters.length} saved · retry Illustrations above`;
  }
  if (hasRunning) return "Generating illustration";
  if (completedCount === chapters.length) {
    return `${completedCount} of ${chapters.length} illustration saved`;
  }
  return "Chapter prompt saved";
}

export function ChapterList({ chapters }: { chapters: ChapterView[] }) {
  if (chapters.length === 0) return null;

  return (
    <section aria-labelledby="chapters-heading" className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
            Chapter
          </p>
          <h2 className="mt-2 text-2xl font-semibold" id="chapters-heading">
            Chapters <span className="text-ink-muted">({chapters.length})</span>
          </h2>
        </div>
        <p aria-live="polite" className="text-xs text-ink-muted">
          {chapterProgressCopy(chapters)}
        </p>
      </div>

      <div className="grid gap-4">
        {chapters.map((chapter) => (
          <article
            aria-busy={chapter.illustration.status === "RUNNING"}
            className="overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-[0_10px_30px_rgba(35,31,32,0.05)]"
            key={chapter.id}
          >
            <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
              <div className="relative aspect-[16/10] overflow-hidden bg-paper lg:aspect-auto lg:min-h-[18rem]">
                {chapter.illustration.assetUrl ? (
                  <Image
                    alt={`Illustration for ${chapter.name}`}
                    className="object-cover"
                    fill
                    sizes="(min-width: 1024px) 55vw, 100vw"
                    src={chapter.illustration.assetUrl}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full min-h-52 items-center justify-center px-6 text-center">
                    <div>
                      {chapter.illustration.status === "RUNNING" ? (
                        <span
                          aria-hidden="true"
                          className="mx-auto mb-3 block size-8 animate-pulse rounded-full border-2 border-orange/40 border-t-orange"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="mx-auto mb-3 block size-10 rounded-full border border-line bg-surface"
                        />
                      )}
                      <p className="text-sm font-semibold text-ink-body">
                        {illustrationStatusCopy(chapter)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{chapter.name}</h3>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${illustrationStatusClass(chapter)}`}
                  >
                    {illustrationStatusCopy(chapter)}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-7 text-ink-body">
                  {chapter.prompt}
                </p>
                {chapter.illustration.status === "FAILED" ? (
                  <p
                    className="mt-4 rounded-xl border border-orange/30 bg-orange/10 p-3 text-sm leading-6 text-orange-deep"
                    role="alert"
                  >
                    {chapter.illustration.errorMessage ??
                      "This illustration could not be generated. Retry Illustrations above."}
                  </p>
                ) : chapter.illustration.isStale ? (
                  <p className="mt-4 rounded-xl border border-orange/30 bg-orange/10 p-3 text-sm leading-6 text-orange-deep">
                    Recover the Illustrations run above before retrying it.
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
