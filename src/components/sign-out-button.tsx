"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="min-h-11 rounded-lg px-3 text-sm font-semibold text-ink-muted transition hover:bg-paper hover:text-ink disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      onClick={handleSignOut}
      type="button"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
