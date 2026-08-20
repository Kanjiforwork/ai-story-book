import Link from "next/link";
import type { ReactNode } from "react";

import type { AuthenticatedUser } from "@/server/auth";
import { SignOutButton } from "@/components/sign-out-button";

export function AppShell({
  activeNavigation = "projects",
  children,
  user,
}: {
  activeNavigation?: "attempts" | "projects";
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-8">
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
          <nav
            aria-label="Main navigation"
            className="order-3 flex w-full gap-1 border-t border-line/50 pt-2 sm:order-none sm:ml-4 sm:w-auto sm:border-0 sm:pt-0"
          >
            <Link
              aria-current={
                activeNavigation === "projects" ? "page" : undefined
              }
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-paper hover:text-ink ${activeNavigation === "projects" ? "bg-paper text-ink" : "text-ink-body"}`}
              href="/projects"
            >
              Projects
            </Link>
            <Link
              aria-current={
                activeNavigation === "attempts" ? "page" : undefined
              }
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-paper hover:text-ink ${activeNavigation === "attempts" ? "bg-paper text-ink" : "text-ink-body"}`}
              href="/attempts"
            >
              Attempts
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
