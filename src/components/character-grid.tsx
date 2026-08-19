import Image from "next/image";

import type { CharacterView } from "@/domain/project";

function portraitStatusCopy(character: CharacterView): string {
  if (character.portrait.status === "COMPLETED") return "Portrait saved";
  if (character.portrait.isStale) return "Run interrupted";
  if (character.portrait.status === "RUNNING") return "Generating portrait";
  if (character.portrait.status === "FAILED") return "Portrait failed";
  return "Portrait pending";
}

function portraitStatusClass(character: CharacterView): string {
  if (character.portrait.status === "COMPLETED") {
    return "border-ink/20 bg-ink text-white";
  }
  if (character.portrait.status === "FAILED" || character.portrait.isStale) {
    return "border-orange/35 bg-orange/10 text-orange-deep";
  }
  if (character.portrait.status === "RUNNING") {
    return "border-orange/35 bg-orange/10 text-orange-deep";
  }
  return "border-line bg-surface text-ink-muted";
}

export function CharacterGrid({
  characters,
  onRetry,
  retryingCharacterId,
}: {
  characters: CharacterView[];
  onRetry?: (characterId: string) => void;
  retryingCharacterId?: string | null;
}) {
  if (characters.length === 0) return null;

  const completedCount = characters.filter(
    (character) => character.portrait.status === "COMPLETED",
  ).length;
  const hasFailure = characters.some(
    (character) =>
      character.portrait.status === "FAILED" || character.portrait.isStale,
  );

  return (
    <section aria-labelledby="characters-heading" className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
            Portraits
          </p>
          <h2 className="mt-2 text-2xl font-semibold" id="characters-heading">
            Characters{" "}
            <span className="text-ink-muted">({characters.length})</span>
          </h2>
        </div>
        <p aria-live="polite" className="text-xs text-ink-muted">
          {hasFailure
            ? `${completedCount} of ${characters.length} saved · retry failed items`
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
              className="overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-[0_10px_30px_rgba(35,31,32,0.05)]"
              key={character.id}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-paper">
                {character.portrait.assetUrl ? (
                  <Image
                    alt={`Portrait of ${character.name}`}
                    className="object-cover"
                    fill
                    sizes="(min-width: 768px) 40vw, 100vw"
                    src={character.portrait.assetUrl}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div>
                      {character.portrait.status === "RUNNING" ? (
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
                        {portraitStatusCopy(character)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{character.name}</h3>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${portraitStatusClass(character)}`}
                  >
                    {portraitStatusCopy(character)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-body">
                  {character.prompt}
                </p>
                {failed ? (
                  <div
                    className="mt-4 rounded-xl border border-orange/30 bg-orange/10 p-3 text-sm leading-6 text-orange-deep"
                    role="alert"
                  >
                    <p>
                      {character.portrait.errorMessage ??
                        "This portrait could not be generated."}
                    </p>
                    {onRetry ? (
                      <button
                        className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-orange px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-orange-hover disabled:cursor-wait disabled:opacity-60"
                        disabled={retrying}
                        onClick={() => onRetry(character.id)}
                        type="button"
                      >
                        {retrying ? "Retrying…" : "Retry portrait"}
                      </button>
                    ) : null}
                  </div>
                ) : stale ? (
                  <p className="mt-4 rounded-xl border border-orange/30 bg-orange/10 p-3 text-sm leading-6 text-orange-deep">
                    Recover the Portraits run above before retrying this item.
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
