"use client";

import Image from "next/image";
import { useState } from "react";

import { ImageGenerationSpinner } from "@/components/image-generation-spinner";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import { ProjectAttemptHistory } from "@/components/step-attempt-history";
import type {
  ChapterView,
  CharacterView,
  ProjectAttemptHistoryItem,
} from "@/domain/project";

type PromptSelection = {
  prompt: string;
  title: string;
};

function compact(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit).trimEnd()}…`
    : normalized;
}

function formatGeneratedDate(value: string | null, fallback: string): string {
  return new Date(value ?? fallback).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function GalleryCaption({
  date,
  kind,
  name,
}: {
  date: string;
  kind: string;
  name: string;
}) {
  return (
    <span className="block px-1 pt-3">
      <span className="font-editorial block text-xl leading-none text-ink">
        {name}
      </span>
      <span className="mt-2 block text-[11px] leading-4 text-ink-muted">
        {kind} · {date}
      </span>
      <span className="mt-1.5 inline-flex min-h-7 items-center text-xs font-semibold text-orange-deep underline decoration-line underline-offset-4 transition group-hover:text-orange">
        Read full prompt →
      </span>
    </span>
  );
}

export function CompletedProjectGallery({
  attempts,
  bookText,
  chapters,
  characters,
  createdAt,
  onReadFullText,
  onStyleDraftChange,
  onViewFullStyle,
  showStyleDirection = false,
  style,
  styleDirectionDisabled = false,
  styleDraft = "",
}: {
  attempts: ProjectAttemptHistoryItem[];
  bookText: string;
  chapters: ChapterView[];
  characters: CharacterView[];
  createdAt: string;
  onReadFullText: () => void;
  onStyleDraftChange?: (value: string) => void;
  onViewFullStyle: () => void;
  showStyleDirection?: boolean;
  style: string | null;
  styleDirectionDisabled?: boolean;
  styleDraft?: string;
}) {
  const [promptSelection, setPromptSelection] =
    useState<PromptSelection | null>(null);
  const styleIsLong = Boolean(style && style.length > 180);

  function openPrompt(selection: PromptSelection) {
    setPromptSelection(selection);
  }

  function closePrompt() {
    setPromptSelection(null);
  }

  return (
    <>
      <section
        aria-label="Completed project results"
        className="mt-6 grid items-start gap-x-3 gap-y-7 md:grid-cols-2 lg:grid-cols-[minmax(15.5rem,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.8fr)] lg:gap-x-4"
      >
        <aside className="min-w-0 bg-paper px-5 py-6 md:col-span-2 lg:col-span-1 lg:min-h-[clamp(24rem,36vw,32rem)]">
          {style || showStyleDirection ? (
            <section aria-labelledby="completed-style-heading">
              <h2
                className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted"
                id="completed-style-heading"
              >
                Art style
              </h2>
              {style ? (
                <>
                  <p className="mt-5 text-sm leading-6 text-ink-body">
                    {compact(style, 180)}
                  </p>
                  {styleIsLong ? (
                    <button
                      className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-orange-deep underline decoration-line underline-offset-4 transition hover:text-orange"
                      onClick={onViewFullStyle}
                      type="button"
                    >
                      View full style
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="mt-5">
                  <label
                    className="text-sm font-semibold text-ink"
                    htmlFor="workspace-style-direction"
                  >
                    Style direction{" "}
                    <span className="font-normal text-ink-muted">
                      (optional)
                    </span>
                  </label>
                  <input
                    className="mt-2 min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-orange focus:ring-4 focus:ring-orange/15 disabled:cursor-wait disabled:opacity-60"
                    disabled={styleDirectionDisabled}
                    id="workspace-style-direction"
                    maxLength={500}
                    onChange={(event) =>
                      onStyleDraftChange?.(event.target.value)
                    }
                    placeholder="e.g. Victorian watercolor"
                    value={styleDraft}
                  />
                  <p className="mt-2 text-xs leading-5 text-ink-muted">
                    Leave blank to derive it from the book.
                  </p>
                </div>
              )}
            </section>
          ) : null}

          <section
            aria-labelledby="completed-book-heading"
            className={
              style || showStyleDirection
                ? "mt-5 border-t border-line/60 pt-5"
                : ""
            }
          >
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted"
              id="completed-book-heading"
            >
              Book text
            </h2>
            <p className="mt-5 line-clamp-6 text-sm leading-6 text-ink-body">
              {compact(bookText, 260)}
            </p>
            <button
              aria-label="Read full text"
              className="mt-5 inline-flex min-h-10 items-center text-sm font-semibold text-orange-deep underline decoration-line underline-offset-4 transition hover:text-orange"
              onClick={onReadFullText}
              type="button"
            >
              Read full text →
            </button>
          </section>

          <div className="mt-5">
            <ProjectAttemptHistory attempts={attempts} />
          </div>
        </aside>

        {characters.map((character) => (
          <button
            aria-busy={character.portrait.status === "RUNNING"}
            className="group block min-w-0 text-left outline-none"
            key={character.id}
            onClick={() =>
              openPrompt({
                prompt: character.prompt,
                title: `${character.name} portrait prompt`,
              })
            }
            type="button"
          >
            <span className="relative block h-[28rem] overflow-hidden bg-paper ring-line/60 transition group-hover:opacity-95 group-focus-visible:ring-4 group-focus-visible:ring-orange/25 md:h-[32rem] lg:h-[clamp(24rem,36vw,32rem)]">
              {character.portrait.status === "RUNNING" ? (
                <ImageGenerationSpinner
                  label={`Generating portrait for ${character.name}…`}
                />
              ) : character.portrait.assetUrl ? (
                <Image
                  alt={`Portrait of ${character.name}`}
                  className="object-cover transition duration-500 group-hover:scale-[1.01]"
                  fill
                  loading="eager"
                  sizes="(min-width: 1024px) 18vw, (min-width: 768px) 50vw, 100vw"
                  src={character.portrait.assetUrl}
                  unoptimized
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-surface px-4 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  {character.portrait.status === "FAILED"
                    ? "Generation failed"
                    : "Not generated yet"}
                </span>
              )}
              {character.portrait.status === "FAILED" ? (
                <span className="absolute right-3 top-3 rounded-full bg-orange-deep px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white shadow-sm">
                  Failed
                </span>
              ) : null}
            </span>
            <GalleryCaption
              date={formatGeneratedDate(
                character.portrait.claimedAt,
                createdAt,
              )}
              kind="Character portrait"
              name={character.name}
            />
          </button>
        ))}

        {chapters.map((chapter) => {
          function openChapterPrompt() {
            openPrompt({
              prompt: chapter.prompt,
              title: `${chapter.name} illustration prompt`,
            });
          }

          return (
            <article
              className="min-w-0 md:col-span-2 lg:col-span-1 lg:col-start-4"
              key={chapter.id}
            >
              <div className="relative">
                <button
                  aria-busy={chapter.illustration.status === "RUNNING"}
                  aria-label={`Read prompt for ${chapter.name}`}
                  className="group block w-full text-left outline-none"
                  onClick={openChapterPrompt}
                  type="button"
                >
                  <span className="relative block h-[28rem] overflow-hidden bg-paper ring-line/60 transition group-hover:opacity-95 group-focus-visible:ring-4 group-focus-visible:ring-orange/25 md:h-[32rem] lg:h-[clamp(24rem,36vw,32rem)]">
                    {chapter.illustration.status === "RUNNING" ? (
                      <ImageGenerationSpinner label="Generating illustration…" />
                    ) : chapter.illustration.assetUrl ? (
                      <Image
                        alt={`Illustration for ${chapter.name}`}
                        className="object-cover transition duration-500 group-hover:scale-[1.01]"
                        fill
                        loading="eager"
                        sizes="(min-width: 1024px) 36vw, 100vw"
                        src={chapter.illustration.assetUrl}
                        unoptimized
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center bg-surface px-4 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                        {chapter.illustration.status === "FAILED"
                          ? "Generation failed"
                          : "Not generated yet"}
                      </span>
                    )}
                    {chapter.illustration.status === "FAILED" ? (
                      <span className="absolute right-3 top-3 rounded-full bg-orange-deep px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white shadow-sm">
                        Failed
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>

              <button
                className="group block w-full text-left outline-none focus-visible:ring-4 focus-visible:ring-orange/25"
                onClick={openChapterPrompt}
                type="button"
              >
                <GalleryCaption
                  date={formatGeneratedDate(
                    chapter.illustration.claimedAt,
                    createdAt,
                  )}
                  kind="Chapter illustration"
                  name={chapter.name}
                />
              </button>
            </article>
          );
        })}
      </section>

      <ProjectDetailDialog
        onClose={closePrompt}
        open={promptSelection !== null}
        title={promptSelection?.title ?? "Generated prompt"}
      >
        <p className="whitespace-pre-wrap">{promptSelection?.prompt}</p>
      </ProjectDetailDialog>
    </>
  );
}
