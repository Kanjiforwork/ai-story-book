import Image from "next/image";
import { useState } from "react";

import { ImageGenerationSpinner } from "@/components/image-generation-spinner";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import { ResultFramePlaceholder } from "@/components/result-frame-placeholder";
import type { CharacterView } from "@/domain/project";

function promptPreview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 150 ? `${compact.slice(0, 150).trimEnd()}…` : compact;
}

function portraitStatusCopy(character: CharacterView): string {
  if (character.portrait.status === "COMPLETED") return "Portrait saved";
  if (character.portrait.isStale) return "Run interrupted";
  if (character.portrait.status === "RUNNING") return "Generating portrait";
  if (character.portrait.status === "FAILED") return "Portrait failed";
  return "Portrait pending";
}

function portraitStatusClass(character: CharacterView): string {
  if (character.portrait.status === "COMPLETED") {
    return "bg-orange text-white";
  }
  if (character.portrait.status === "FAILED" || character.portrait.isStale) {
    return "bg-orange/10 text-orange-deep";
  }
  if (character.portrait.status === "RUNNING") {
    return "bg-orange/10 text-orange-deep";
  }
  return "bg-paper text-ink-muted";
}

function portraitFrameLabel(character: CharacterView): string {
  if (character.portrait.isStale) return "Interrupted";
  if (character.portrait.status === "RUNNING") return "Generating";
  if (character.portrait.status === "FAILED") return "Needs retry";
  return "Queued";
}

export function CharacterGrid({
  characters,
  onRetry,
  readOnly = false,
  retryDisabled = false,
  retryingCharacterId,
}: {
  characters: CharacterView[];
  onRetry?: (characterId: string) => void;
  readOnly?: boolean;
  retryDisabled?: boolean;
  retryingCharacterId?: string | null;
}) {
  const [selectedCharacter, setSelectedCharacter] =
    useState<CharacterView | null>(null);

  if (characters.length === 0) return null;

  const completedCount = characters.filter(
    (character) => character.portrait.status === "COMPLETED",
  ).length;
  const hasFailure = characters.some(
    (character) =>
      character.portrait.status === "FAILED" || character.portrait.isStale,
  );

  return (
    <section aria-labelledby="characters-heading" className="mt-6">
      <div className="w-full">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
              Portraits
            </p>
            <h2 className="mt-1 text-2xl font-semibold" id="characters-heading">
              Characters{" "}
              <span className="text-ink-muted">({characters.length})</span>
            </h2>
          </div>
          <p aria-live="polite" className="text-xs text-ink-muted">
            {hasFailure && !readOnly
              ? `${completedCount} of ${characters.length} saved · retry failed items`
              : hasFailure
                ? `${completedCount} of ${characters.length} saved results`
                : `${completedCount} of ${characters.length} portraits saved`}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {characters.map((character) => {
            const failed = character.portrait.status === "FAILED";
            const stale = character.portrait.isStale;
            const retrying = retryingCharacterId === character.id;

            return (
              <article
                aria-busy={character.portrait.status === "RUNNING"}
                className="overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-[0_8px_24px_rgba(35,31,32,0.05)]"
                key={character.id}
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-paper">
                  {character.portrait.status === "RUNNING" ? (
                    <ImageGenerationSpinner
                      label={`Generating portrait for ${character.name}…`}
                    />
                  ) : character.portrait.assetUrl ? (
                    <Image
                      alt={`Portrait of ${character.name}`}
                      className="object-cover"
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      src={character.portrait.assetUrl}
                      unoptimized
                    />
                  ) : (
                    <ResultFramePlaceholder
                      kind="portrait"
                      label={portraitFrameLabel(character)}
                    />
                  )}
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold">{character.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${portraitStatusClass(character)}`}
                    >
                      {portraitStatusCopy(character)}
                    </span>
                  </div>
                  <p
                    className="mt-3 truncate text-sm leading-6 text-ink-body"
                    title={character.prompt}
                  >
                    {promptPreview(character.prompt)}
                  </p>
                  <button
                    className="mt-2 inline-flex min-h-10 items-center rounded-xl px-2 text-sm font-semibold text-orange-deep underline decoration-line underline-offset-4 transition hover:bg-paper"
                    onClick={() => setSelectedCharacter(character)}
                    type="button"
                  >
                    Read full prompt
                    <span aria-hidden="true" className="ml-1">
                      →
                    </span>
                  </button>
                  {failed ? (
                    <div
                      className="mt-4 rounded-xl border-l-2 border-orange bg-orange/10 p-3 text-sm leading-6 text-orange-deep"
                      role="alert"
                    >
                      <p>
                        {character.portrait.errorMessage ??
                          "This portrait could not be generated."}
                      </p>
                      {onRetry && !readOnly ? (
                        <button
                          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-orange px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-orange-hover disabled:cursor-wait disabled:opacity-60"
                          disabled={retrying || retryDisabled}
                          onClick={() => onRetry(character.id)}
                          type="button"
                        >
                          {retrying ? "Retrying…" : "Retry portrait"}
                        </button>
                      ) : null}
                    </div>
                  ) : stale ? (
                    <p className="mt-4 rounded-xl border-l-2 border-orange bg-orange/10 p-3 text-sm leading-6 text-orange-deep">
                      {readOnly
                        ? "This saved output cannot be retried here."
                        : "Recover the Portraits run above before retrying this item."}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {selectedCharacter ? (
        <ProjectDetailDialog
          onClose={() => setSelectedCharacter(null)}
          open
          title={`${selectedCharacter.name} portrait prompt`}
        >
          <p className="whitespace-pre-wrap">{selectedCharacter.prompt}</p>
        </ProjectDetailDialog>
      ) : null}
    </section>
  );
}
