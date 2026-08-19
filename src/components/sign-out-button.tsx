"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSignOut() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Sign-out failed");
      router.push("/");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="min-h-11 rounded-lg px-3 text-sm font-semibold text-ink-muted transition hover:bg-paper hover:text-ink disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={handleSignOut}
        type="button"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span
          className="max-w-44 rounded-lg border border-orange/30 bg-orange/10 px-2 py-1 text-xs font-semibold text-orange-deep"
          role="alert"
        >
          Sign out failed. Try again.
        </span>
      ) : null}
    </>
  );
}
