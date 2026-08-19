import type { CharacterView } from "@/domain/project";

export function CharacterGrid({ characters }: { characters: CharacterView[] }) {
  if (characters.length === 0) return null;

  return (
    <section aria-labelledby="characters-heading" className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
            Text result
          </p>
          <h2 className="mt-2 text-2xl font-semibold" id="characters-heading">
            Characters{" "}
            <span className="text-ink-muted">({characters.length})</span>
          </h2>
        </div>
        <span className="text-xs text-ink-muted">Portraits come next</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {characters.map((character) => (
          <article
            className="overflow-hidden rounded-2xl border border-line/60 bg-surface"
            key={character.id}
          >
            <div className="flex min-h-32 items-center justify-center bg-paper px-6 text-center">
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
                Portrait pending
              </span>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-semibold">{character.name}</h3>
              <p className="mt-3 text-sm leading-6 text-ink-body">
                {character.prompt}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
