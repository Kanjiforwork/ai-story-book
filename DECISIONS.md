# Engineering Decisions

This file records six real decisions from the planning and implementation conversations. It is not a diary, requirement summary, or architecture reference. Requirements such as server-side Gemini calls, the five-step pipeline, and demo coverage belong in `docs/plan.md` and `AGENTS.md`.

## 1. SQLite instead of JSON files

- AI suggestion: JSON files could fit a small take-home.
- My pushback: the app needs atomic step claims, concurrent-request protection, project queries, and durable per-image progress.
- Decision: use SQLite for users, projects, step state, run claims, item progress, and Gemini metadata. Keep book text and generated images on the local filesystem.
- Trade-off: I accepted a database schema and local dependency in exchange for state transitions that are easier to inspect and test.

## 2. Separate pipeline progress from execution state

- Question: should one status value represent both overall progress and the step currently running?
- My decision: keep durable progress, current execution state, and image-item state separate.
- Result: the UI can show completed progress while a later step is running, failed, or stale; a successful portrait remains visible when another image fails.
- Trade-off: image generation runs in parallel with per-item persistence, which requires more state fields and transition tests.

The external call begins only after SQLite atomically creates and persists a step-attempt claim. A heartbeat keeps that claim fresh, and a persisted generation-run ID keeps every result attached to the same pipeline. Client-side button disabling is useful feedback, but it is not the duplicate-call guarantee.

## 3. Failure-first UX

- Problem I observed: a generic spinner does not explain a Gemini call that takes tens of seconds or fails halfway through.
- My decision: use named running states, visible progress, partial results, inline errors, explicit retry, and stale recovery.
- Scope note: this is my product decision from testing the UX, not a claim that the assessment dictated every visual detail.
- Trade-off: more UI states, copy, and frontend tests in exchange for a workflow users can trust.

## 4. Lightweight workflow for a single-developer take-home

- AI suggestion: use short-lived feature branches and commit completed slices automatically.
- My pushback: this is a small local take-home with one developer and no production release or pull-request workflow; an earlier unapproved commit also showed why the approval boundary matters.
- Decision: work on `main`, keep meaningful milestone commits, and require my explicit approval before every commit.
- Trade-off: less branch isolation and a manual approval pause, but a simpler Git history and no accidental commits.

## 5. Project-scoped saved progress instead of a user-facing cache

- AI/implementation result: the cache work exposed generation history, saved runs, and a `Use previous run` action.
- My pushback: users should not need to understand cache keys, run versions, or internal Gemini interactions.
- Decision: show one current pipeline per project. Reuse book context and saved results inside that project, but keep another project with the same text independent.
- Behavior: reopening a project reads saved state without a Gemini call; changing style explicitly regenerates downstream results. Internal run metadata stays available for duplicate protection, stale recovery, and debugging, but remains hidden from the primary UX.
- Trade-off: two projects with identical text may call Gemini independently and produce different output, but the product is easier to understand and safer to isolate.

## 6. Tested model IDs instead of a moving “latest” default

- AI review suggestion: replace empty model examples with current-looking defaults.
- My pushback: a newer-sounding model name is not evidence that this application and its interaction/image contracts work with it.
- Decision: document `gemini-3.6-flash` for text and `gemini-3.1-flash-image` for images because those are the environment values used by the real local flow. Keep both as environment overrides so a retired model can be changed without a code edit.
- Trade-off: the examples will eventually age, but they give the reviewer a reproducible starting point instead of silently selecting an untested model.

## If I had one more day

I would add a small focal-point control for generated images. Edited single-image prompts and item-level retries now cover art direction, and square chapter generation matches the completed-project layout, but a technically valid image can still place its subject away from the preferred crop. A persisted focal point would let the user correct presentation without spending another image-generation call.
