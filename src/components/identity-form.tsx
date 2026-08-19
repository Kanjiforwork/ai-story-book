"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function IdentityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/session", {
        body: JSON.stringify({ email, name }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "We could not start your session.");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setError("The server could not be reached. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center bg-canvas px-5 py-8 sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <section className="hidden lg:block">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-orange">
            Book Illustration Studio
          </p>
          <h1 className="max-w-xl text-6xl font-semibold leading-[1.03] tracking-[-0.04em]">
            Give a story a visual world.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-ink-body">
            Save a book once, then shape its style, characters, and scenes in a
            deliberate five-step workspace.
          </p>
        </section>

        <section className="rounded-3xl bg-surface p-6 shadow-[0_16px_50px_rgba(35,31,32,0.08)] sm:p-8">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
              Start or resume
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              Welcome to the studio
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink-body">
              Use the same email to return to your saved projects.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="name"
              >
                Full name
              </label>
              <input
                autoComplete="name"
                className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-ink-muted focus:border-orange focus:ring-4 focus:ring-orange/15"
                id="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Mira Hassan"
                required
                value={name}
              />
            </div>

            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="email"
              >
                Email
              </label>
              <input
                autoComplete="email"
                className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-ink-muted focus:border-orange focus:ring-4 focus:ring-orange/15"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="mira@example.com"
                required
                type="email"
                value={email}
              />
            </div>

            {error ? (
              <p
                className="rounded-xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm leading-6 text-orange-deep"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              className="min-h-12 w-full rounded-xl bg-orange px-5 text-sm font-bold text-white transition hover:bg-orange-hover disabled:cursor-wait disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? "Opening your workspace…" : "Continue"}
              {!pending ? (
                <span aria-hidden="true" className="ml-2">
                  →
                </span>
              ) : null}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-ink-muted">
            No password is required for this local assessment workspace.
          </p>
        </section>
      </div>
    </main>
  );
}
