import Link from "next/link";
import type { ReactNode } from "react";

import type { AuthenticatedUser } from "@/server/auth";
import { SignOutButton } from "@/components/sign-out-button";

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AuthenticatedUser;
}) {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-line/60 bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 sm:px-8">
          <Link className="flex min-h-11 items-center gap-3" href="/projects">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-orange text-sm font-black text-white"
            >
              G
            </span>
            <span>
              <span className="block text-xs font-bold tracking-[0.18em] text-ink-body">
                GRADION
              </span>
              <span className="block text-xs text-ink-muted">
                Book Illustration Studio
              </span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="ml-4 hidden sm:block">
            <Link
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-body hover:bg-paper hover:text-ink"
              href="/projects"
            >
              Projects
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-orange text-xs font-bold text-white"
            >
              {initials}
            </span>
            <span className="hidden max-w-32 truncate text-sm text-ink-body sm:block">
              {user.name}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
