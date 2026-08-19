# Engineering Decisions

This file records five real decisions from the planning and implementation conversations. It is not a diary, requirement summary, or architecture reference. Requirements such as server-side Gemini calls, the five-step pipeline, and demo coverage belong in `docs/plan.md` and `AGENTS.md`.

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

## If I had one more day

- Status: not decided yet.
- Before submission, I will choose one concrete next feature based on real UAT instead of inventing a retrospective answer.
