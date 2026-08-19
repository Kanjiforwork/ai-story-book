# Engineering Decisions

This file records real decisions and trade-offs, not a diary. Each completed entry must say who proposed the idea, who pushed back, where we landed, and what cost we accepted. At least three entries must describe genuine AI overrides. Do not count the working entries below as final AI-override evidence until the relevant planning or implementation interaction actually happens.

## Working decision: SQLite metadata instead of JSON files

**Status:** Direction agreed; AI-override evidence pending.

For the local assessment, use SQLite for users, projects, ordered step state, run claims, item progress, and Gemini interaction metadata. Keep book text and generated images on the local filesystem. JSON files appear attractive because the scope is small, but overlapping requests, atomic claims, and querying a user's projects are easier to make correct with SQLite transactions. The accepted cost is a small schema and local database dependency; this remains a single-process local application, not a production distributed system.

When the implementation agent proposes the concrete storage design, update this entry with the actual proposal, the human pushback, and the final evidence.

## Working decision: durable progress is separate from execution state

**Status:** Direction agreed; AI-override evidence pending.

Do not represent the pipeline with one overloaded status enum. Persist completed progress separately from the currently running or failed step, and persist image-item state separately so a partial result remains visible. The progress bar should be derived from persisted state, not treated as the source of truth. The accepted cost is more fields and more transition tests, plus explicit stale-run recovery.

When the implementation agent proposes its state model, update this entry with the actual proposal and the specific correction made.

## Working decision: failure-first UX instead of a happy-path spinner

**Status:** Direction agreed; AI-override evidence pending.

The detail page must make the current step, partial image progress, errors, retry actions, and interrupted-step recovery visible. A generic “Generating…” state is not enough for calls that can take 10–30 seconds or survive refresh. The accepted cost is more UI states, copy, and frontend tests; the benefit is that the interface explains what the user can do when generation is slow or incomplete.

When the implementation agent proposes its first UX flow, update this entry with the actual AI suggestion and the human override.

## Working decision: demo as the UX floor, not the runtime implementation

**Status:** Direction agreed; AI-override evidence pending.

Use `app-demo.html` to define the minimum visual scope, screens, interaction coverage, and state naming. Do not copy its localStorage store, fake timers, placeholder images, fake timings, or one-tab duplicate guard into the real app. The accepted cost is that the real UI needs more explicit components and state tests, but the result will represent the actual server/Gemini behavior instead of a polished prototype with misleading guarantees.

When the implementation agent proposes its first component structure or attempts to reuse demo behavior, update this entry with the actual proposal and the correction made.

## Working decision: main-only workflow for the local take-home

**Status:** Direction agreed during planning.

The AI initially required a short-lived `codex/<topic>` branch for implementation. Bao pushed back because this is a small, single-developer, local take-home with no production release, parallel feature work, or pull-request review. We landed on working directly on `main` and using small, meaningful commits as the primary safety and review mechanism. A short-lived branch remains available for parallel work, PR/review, or a risky experiment that needs isolation. The accepted cost is less branch-level isolation during normal work; the benefit is less workflow overhead and a clearer linear Git history for the assessment. This is a scope-specific choice, not a general production branching policy.

## Decisions still to settle during planning

- Gemini notebook mechanics: file/document input, context chaining, structured output, current model IDs, and image limits.
- Polling versus SSE/WebSockets: likely polling for the local time-boxed scope unless evidence shows otherwise.
- Lightweight server-owned session representation and its cookie/security trade-off.
- Asset API shape and path-traversal protection.
- Exact test boundary and the commands that produce the real report.

## If I had one more day

To be completed after the core flow is working and the remaining limitation is known. The answer must name one concrete next feature and why it would improve the product or engineering confidence.
