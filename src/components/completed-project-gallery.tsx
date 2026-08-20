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
  id: string;
  kind: "illustration" | "portrait";
  prompt: string;
  status: "COMPLETED" | "FAILED" | "PENDING" | "RUNNING";
  title: string;
};

export type EditedPromptRetry = Pick<PromptSelection, "id" | "kind" | "prompt">;

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
  onRetryPrompt,
  onStyleDraftChange,
  onViewFullStyle,
  readOnly = false,
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
  onRetryPrompt: (input: EditedPromptRetry) => Promise<void>;
  onStyleDraftChange?: (value: string) => void;
  onViewFullStyle: () => void;
  readOnly?: boolean;
  showStyleDirection?: boolean;
  style: string | null;
  styleDirectionDisabled?: boolean;
  styleDraft?: string;
}) {
  const [promptSelection, setPromptSelection] =
    useState<PromptSelection | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const styleIsLong = Boolean(style && style.length > 180);

  function openPrompt(selection: PromptSelection) {
    setPromptSelection(selection);
    setPromptDraft(selection.prompt);
    setEditingPrompt(false);
    setRetryError(null);
  }

  function closePrompt() {
    setPromptSelection(null);
    setEditingPrompt(false);
    setRetryError(null);
  }

  async function retryWithPrompt(prompt: string) {
    if (!promptSelection) return;

    setRetryPending(true);
    setRetryError(null);
    try {
      await onRetryPrompt({
        id: promptSelection.id,
        kind: promptSelection.kind,
        prompt,
      });
      closePrompt();
    } catch (error) {
      setRetryError(
        error instanceof Error
          ? error.message
          : "This image could not be retried.",
      );
    } finally {
      setRetryPending(false);
    }
  }

  async function saveAndRetry() {
    if (!promptSelection) return;
    const prompt = promptDraft.trim();
    if (!prompt || prompt === promptSelection.prompt) return;
    await retryWithPrompt(prompt);
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

        {characters.map((character, index) => (
          <button
            aria-busy={character.portrait.status === "RUNNING"}
            className="group block min-w-0 text-left outline-none"
            key={character.id}
            onClick={() =>
              openPrompt({
                id: character.id,
                kind: "portrait",
                prompt: character.prompt,
                status: character.portrait.status,
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
                  loading={index === 0 ? "eager" : "lazy"}
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

        {chapters.map((chapter) => (
          <button
            aria-busy={chapter.illustration.status === "RUNNING"}
            className="group block min-w-0 text-left outline-none md:col-span-2 lg:col-span-1 lg:col-start-4"
            key={chapter.id}
            onClick={() =>
              openPrompt({
                id: chapter.id,
                kind: "illustration",
                prompt: chapter.prompt,
                status: chapter.illustration.status,
                title: `${chapter.name} illustration prompt`,
              })
            }
            type="button"
          >
            <span className="relative block aspect-square overflow-hidden bg-paper ring-line/60 transition group-hover:opacity-95 group-focus-visible:ring-4 group-focus-visible:ring-orange/25">
              {chapter.illustration.status === "RUNNING" ? (
                <ImageGenerationSpinner label="Generating illustration…" />
              ) : chapter.illustration.assetUrl ? (
                <Image
                  alt={`Illustration for ${chapter.name}`}
                  className="object-cover transition duration-500 group-hover:scale-[1.01]"
                  fill
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
            <GalleryCaption
              date={formatGeneratedDate(
                chapter.illustration.claimedAt,
                createdAt,
              )}
              kind="Chapter illustration"
              name={chapter.name}
            />
          </button>
        ))}
      </section>

      <ProjectDetailDialog
        onClose={closePrompt}
        open={promptSelection !== null}
        title={promptSelection?.title ?? "Generated prompt"}
      >
        {editingPrompt ? (
          <div>
            <label
              className="text-sm font-semibold text-ink"
              htmlFor="prompt-draft"
            >
              Edit prompt
            </label>
            <textarea
              className="mt-2 min-h-64 w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-orange focus:ring-4 focus:ring-orange/15"
              id="prompt-draft"
              maxLength={4_000}
              onChange={(event) => setPromptDraft(event.target.value)}
              value={promptDraft}
            />
            <p className="mt-1.5 text-right text-xs tabular-nums text-ink-muted">
              {promptDraft.length.toLocaleString()} / 4,000
            </p>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{promptSelection?.prompt}</p>
        )}

        {retryError ? (
          <p
            className="mt-4 rounded-xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm leading-6 text-orange-deep"
            role="alert"
          >
            {retryError}
          </p>
        ) : null}

        {!readOnly ? (
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line/60 pt-4">
            {editingPrompt ? (
              <>
                <button
                  className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-ink-body transition hover:bg-paper hover:text-ink"
                  disabled={retryPending}
                  onClick={() => {
                    setPromptDraft(promptSelection?.prompt ?? "");
                    setEditingPrompt(false);
                    setRetryError(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex min-h-11 items-center rounded-lg bg-orange px-5 text-sm font-bold text-white transition hover:bg-orange-hover disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    retryPending ||
                    !promptDraft.trim() ||
                    promptDraft.trim() === promptSelection?.prompt
                  }
                  onClick={() => void saveAndRetry()}
                  type="button"
                >
                  {retryPending ? "Starting retry…" : "Save & retry"}
                </button>
              </>
            ) : promptSelection?.status === "FAILED" ? (
              <>
                <button
                  className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-ink-body transition hover:bg-paper hover:text-ink"
                  disabled={retryPending}
                  onClick={() => setEditingPrompt(true)}
                  type="button"
                >
                  Edit prompt
                </button>
                <button
                  className="inline-flex min-h-11 items-center rounded-lg bg-orange px-5 text-sm font-bold text-white transition hover:bg-orange-hover disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={retryPending}
                  onClick={() => void retryWithPrompt(promptSelection.prompt)}
                  type="button"
                >
                  {retryPending ? "Starting retry…" : "Retry"}
                </button>
              </>
            ) : promptSelection?.status === "PENDING" ? null : (
              <button
                className="inline-flex min-h-11 items-center rounded-lg bg-orange px-5 text-sm font-bold text-white transition hover:bg-orange-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={promptSelection?.status === "RUNNING"}
                onClick={() => setEditingPrompt(true)}
                type="button"
              >
                {promptSelection?.status === "RUNNING"
                  ? "Retry in progress"
                  : "Edit prompt"}
              </button>
            )}
          </div>
        ) : null}
      </ProjectDetailDialog>
    </>
  );
}
