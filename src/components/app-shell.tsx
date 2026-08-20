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
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-7 gap-y-2 px-5 py-4 sm:px-8">
          <Link className="flex min-h-11 items-center" href="/projects">
            <span>
              <span className="block text-sm font-black tracking-[0.24em] text-orange">
                GRADION
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                Book Illustration Studio
              </span>
            </span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="order-3 flex w-full gap-6 border-t border-line/50 pt-2 sm:order-none sm:w-auto sm:border-0 sm:pt-0"
          >
            <Link
              aria-current={
                activeNavigation === "projects" ? "page" : undefined
              }
              className={`relative inline-flex min-h-11 items-center px-1 text-sm font-semibold transition hover:text-ink ${activeNavigation === "projects" ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-orange" : "text-ink-body"}`}
              href="/projects"
            >
              Projects
            </Link>
            <Link
              aria-current={
                activeNavigation === "attempts" ? "page" : undefined
              }
              className={`relative inline-flex min-h-11 items-center px-1 text-sm font-semibold transition hover:text-ink ${activeNavigation === "attempts" ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-orange" : "text-ink-body"}`}
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
            <span className="hidden max-w-40 truncate text-sm text-ink-body sm:block">
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
