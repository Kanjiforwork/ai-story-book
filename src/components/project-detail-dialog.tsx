"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ProjectDetailDialog({
  children,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      const activeElement = document.activeElement;
      returnFocusRef.current =
        activeElement instanceof HTMLElement ? activeElement : null;
      closeButtonRef.current?.focus();

      return () => {
        const returnFocus = returnFocusRef.current;
        if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
        returnFocusRef.current = null;
      };
    }

    const returnFocus = returnFocusRef.current;
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocusRef.current = null;
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const dialog = event.currentTarget;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="project-detail-dialog fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
    >
      <div className="flex max-h-[min(82vh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line/60 bg-surface shadow-[0_24px_70px_rgba(35,31,32,0.2)]">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line/60 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold" id={titleId}>
            {title}
          </h2>
          <button
            aria-label="Close dialog"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-xl leading-none text-ink-body transition hover:bg-paper hover:text-ink"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-5 text-sm leading-7 text-ink-body sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
