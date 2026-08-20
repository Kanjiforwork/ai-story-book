import Image from "next/image";
import { useState } from "react";

import type { ChapterView } from "@/domain/project";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import { ResultFramePlaceholder } from "@/components/result-frame-placeholder";

function promptPreview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180).trimEnd()}…` : compact;
}

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
    return "bg-orange text-white";
  }
  if (
    chapter.illustration.status === "FAILED" ||
    chapter.illustration.isStale
  ) {
    return "bg-orange/10 text-orange-deep";
  }
  if (chapter.illustration.status === "RUNNING") {
    return "bg-orange/10 text-orange-deep";
  }
  return "bg-paper text-ink-muted";
}

function illustrationFrameLabel(chapter: ChapterView): string {
  if (chapter.illustration.isStale) return "Interrupted";
  if (chapter.illustration.status === "RUNNING") return "Generating";
  if (chapter.illustration.status === "FAILED") return "Needs retry";
  return "Queued";
}

function chapterProgressCopy(
  chapters: ChapterView[],
  readOnly: boolean,
): string {
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
    return readOnly
      ? `${completedCount} of ${chapters.length} saved results`
      : `${completedCount} of ${chapters.length} saved · retry Illustrations above`;
  }
  if (hasRunning) return "Generating illustration";
  if (completedCount === chapters.length) {
    return `${completedCount} of ${chapters.length} illustration saved`;
  }
  return "Chapter prompt saved";
}

export function ChapterList({
  chapters,
  readOnly = false,
}: {
  chapters: ChapterView[];
  readOnly?: boolean;
}) {
  const [selectedChapter, setSelectedChapter] = useState<ChapterView | null>(
    null,
  );

  if (chapters.length === 0) return null;

  return (
    <section aria-labelledby="chapters-heading" className="mt-6">
      <div className="w-full">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
              Chapter
            </p>
            <h2 className="mt-1 text-2xl font-semibold" id="chapters-heading">
              Chapters{" "}
              <span className="text-ink-muted">({chapters.length})</span>
            </h2>
          </div>
          <p aria-live="polite" className="text-xs text-ink-muted">
            {chapterProgressCopy(chapters, readOnly)}
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
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-paper">
                  {chapter.illustration.assetUrl ? (
                    <Image
                      alt={`Illustration for ${chapter.name}`}
                      className="object-cover"
                      fill
                      sizes="(min-width: 1024px) 60vw, 100vw"
                      src={chapter.illustration.assetUrl}
                      unoptimized
                    />
                  ) : (
                    <ResultFramePlaceholder
                      kind="chapter"
                      label={illustrationFrameLabel(chapter)}
                    />
                  )}
                </div>
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold">{chapter.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${illustrationStatusClass(chapter)}`}
                    >
                      {illustrationStatusCopy(chapter)}
                    </span>
                  </div>
                  <p
                    className="mt-3 truncate text-sm leading-6 text-ink-body"
                    title={chapter.prompt}
                  >
                    {promptPreview(chapter.prompt)}
                  </p>
                  <button
                    className="mt-2 inline-flex min-h-10 items-center rounded-xl px-2 text-sm font-semibold text-orange-deep underline decoration-line underline-offset-4 transition hover:bg-paper"
                    onClick={() => setSelectedChapter(chapter)}
                    type="button"
                  >
                    Read full prompt
                    <span aria-hidden="true" className="ml-1">
                      →
                    </span>
                  </button>
                  {chapter.illustration.status === "FAILED" ? (
                    <p
                      className="mt-4 rounded-xl border-l-2 border-orange bg-orange/10 p-3 text-sm leading-6 text-orange-deep"
                      role="alert"
                    >
                      {chapter.illustration.errorMessage ??
                        (readOnly
                          ? "This saved output cannot be retried here."
                          : "This illustration could not be generated. Retry Illustrations above.")}
                    </p>
                  ) : chapter.illustration.isStale ? (
                    <p className="mt-4 rounded-xl border-l-2 border-orange bg-orange/10 p-3 text-sm leading-6 text-orange-deep">
                      {readOnly
                        ? "This saved output cannot be retried here."
                        : "Recover the Illustrations run above before retrying it."}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      {selectedChapter ? (
        <ProjectDetailDialog
          onClose={() => setSelectedChapter(null)}
          open
          title={`${selectedChapter.name} illustration prompt`}
        >
          <p className="whitespace-pre-wrap">{selectedChapter.prompt}</p>
        </ProjectDetailDialog>
      ) : null}
    </section>
  );
}
