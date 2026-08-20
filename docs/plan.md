# Gradion Book Illustration Studio — Implementation Plan

## 1. Goal and success criteria

Build a small local Next.js application that turns a user's book text into a style, adult character descriptions, character portraits, one chapter prompt, and one chapter illustration through five explicit steps:

`Style → Characters → Portraits → Chapters → Illustrations`

The implementation is successful when a reviewer can:

- sign in with name and email, create multiple projects, and reopen a project later;
- create a project from pasted text or a `.txt` upload and read the full text at every pipeline stage;
- run each step explicitly and only in order using real server-side Gemini calls;
- see durable step progress and per-image progress after refresh, logout, or server restart;
- retry only a failed or explicitly recovered step without losing completed results;
- verify that duplicate requests do not create duplicate Gemini calls;
- inspect meaningful frontend and backend tests plus a real test report;
- understand the important trade-offs from `DECISIONS.md` and the implementation story from Git history.

The assessment is time-boxed to roughly 16 focused hours. The target is a complete, explainable local slice, not a distributed production platform.

## 2. Scope boundaries

### In scope

- Next.js App Router application using TypeScript.
- Tailwind CSS with small custom accessible primitives.
- SQLite metadata storage through `better-sqlite3`.
- Local filesystem storage for source book text and generated image assets.
- HTTP-only cookie session for the assessment's passwordless name/email identity flow.
- The first five sections of Google's Book Illustration notebook, including structured text output, context chaining, image generation, and portrait references for chapter illustrations.
- Server-side validation, ownership checks, atomic run claims, persisted progress, stale-run recovery, and explicit retry.
- Responsive UI matching the supplied demo's Gradion visual language. `DESIGN.md` is the UI source of truth.
- Focused frontend and backend tests, mocked Gemini calls, and deliberate local UAT with a real Gemini key.

### Explicitly out of scope

- Passwords, OAuth, multi-factor authentication, or production identity management.
- S3, blob storage, CDN, PostgreSQL hosting, Redis, queues, Docker, SSE, and WebSockets.
- Automatic Gemini retry loops or background scheduling.
- Notebook sections after illustrations: Veo, Lyria, TTS, media mixing, and audiobook output.
- More than 2 adult characters or more than 1 chapter in the core flow.
- Public deployment. The local in-process runner is an explicit limitation.
- Bonus features until the complete five-step flow, tests, and documentation are finished.

## 3. Product flow and user-visible behavior

### 3.1 Identity and projects

1. The user submits a name and email.
2. The server normalizes and validates both fields, finds or creates the user, creates an opaque session, and sets an HTTP-only cookie.
3. The project list shows only projects owned by that user.
4. The user creates a project with a title and either pasted book text or a `.txt` upload.
5. The server validates the payload, stores the book text outside the database, creates the project and five ordered step records, and returns the project view model.
6. Reopening a project always reads its state from the server; client-local progress is never authoritative.

### 3.2 Ordered pipeline

Each step has one explicit primary action. The server rejects a run when its predecessor is not complete. The UI never auto-advances after a successful response.

| Step | Input | Durable output | Next-step gate |
| --- | --- | --- | --- |
| Style | Book file reference and optional user style | Structured style text and Gemini interaction metadata | Style step complete |
| Characters | Chained text context plus style | Structured adult character list with names/prompts, capped at 2 | Characters step complete |
| Portraits | Character prompts and shared style context | One persisted image asset per character | Every required portrait complete |
| Chapters | Chained text context plus explicit character data and portrait references | Structured chapter list with prompts, capped at 1 | Chapters step complete |
| Illustrations | Chapter prompt, style, and explicit portrait references | One persisted scene image asset | Illustration complete |

Text/context calls retain the notebook's chaining model. Image calls use a shared immutable image context and run in parallel with `Promise.allSettled`; each successful asset is persisted as soon as it is available. Chapter generation receives explicit portrait references rather than relying on an implicit browser or model state.

### 3.3 Loading, failure, and recovery behavior

- `ready`: the current step has one enabled action.
- `running`: show the named step, run start time, and persisted item progress; disable the run action while the claim is active.
- `partial`: keep completed portraits or illustrations visible while failed items remain retryable.
- `failed`: explain the operation that failed and expose retry for that step only.
- `stale`: if the persisted heartbeat exceeds the stale timeout, show an explicit Recover action; recovery does not call Gemini.
- `complete`: show the finished result and no automatic regeneration.

The UI must follow the component and state contract in [`DESIGN.md`](../DESIGN.md). It must preserve completed assets, show the full book text, avoid generic spinner-only copy, and support keyboard focus, responsive layouts, and reduced motion.

## 4. Architecture and data flow

```text
Browser
  │ same-origin HTTP, HTTP-only session cookie
  ▼
Next.js App Router pages + route handlers
  │ auth/ownership/validation/state transition
  ├── SQLite (users, sessions, projects, steps, items, runs, AI metadata)
  ├── local filesystem (book text and image assets)
  └── Gemini adapter (server-only API key, notebook-compatible calls)
```

### Server boundaries

- React components render typed view models and own only transient form or modal state.
- Route handlers authenticate the session, verify project ownership, validate input, and call application services.
- Application services perform state transitions and orchestrate Gemini calls; they do not return raw database rows to the UI.
- Repository functions own SQLite transactions and queries.
- An asset service writes files using generated opaque IDs and resolves assets only after an ownership check.
- The Gemini adapter is the only module allowed to read `GEMINI_API_KEY` or invoke the SDK/REST client.

### Request and persistence sequence

1. A mutation arrives with the session cookie and project ID.
2. The server authenticates the session and checks ownership.
3. The server resolves the selected generation run and validates the requested step against that run's current state.
4. A SQLite transaction atomically creates a step-attempt claim and marks the step `running`; a second request observes the existing run instead of claiming it.
5. The runner loads the run's persisted source reference, style, and upstream outputs, calls the Gemini adapter, validates structured output, and writes each durable result with the generation-run ID.
6. Each item write is committed independently where partial progress is possible.
7. The step and step attempt are finalized in a transaction as `completed` or `failed`.
8. The client polls the selected generation run while a step is running, then renders the returned server state.

The runner is intentionally local and in-process. A process restart may strand a run, but the persisted timestamp makes it recoverable through the explicit stale recovery flow; no distributed worker guarantee is claimed.

## 5. Domain model and lifecycle

### 5.1 Entities

The database stores metadata and state. Book text and image bytes remain on the local filesystem.

- `users`: normalized email, display name, timestamps.
- `sessions`: opaque token hash, user ID, created/last-seen/revoked timestamps.
- `projects`: owner, title, book-text asset key, source snapshot/hash, optional Gemini source file URI, active generation-run ID, derived display status, and timestamps.
- `project_steps`: one row for each ordered step in a generation run, status, active step-attempt ID, attempt count, timestamps, error code/message, and last heartbeat.
- `characters`: project/generation-run-owned name and prompt, ordered position, portrait status, asset ID, and error details.
- `chapters`: project/generation-run-owned name and prompt, ordered position, illustration status, asset ID, and error details.
- `assets`: owner/project/generation-run relation, kind, opaque storage key, MIME type, byte size, checksum, and timestamps.
- `generation_runs`: one internal generation configuration for a project, including source snapshot, style value, style revision, prompt/model fingerprints, status, and timestamps.
- `pipeline_runs`: immutable step-attempt ID, generation-run/step relation, attempt, claimed/finished timestamps, input fingerprint, and terminal outcome.
- `gemini_interactions`: project/generation-run/step relation, interaction ID, previous interaction ID, model ID, source file URI/reference metadata, and timestamps. Do not store API keys or raw secrets.

Use foreign keys and indexes for ownership and ordered lookup. Use generated IDs, not user-controlled titles or paths, in filesystem keys.

### 5.2 Generation runs, style changes, and reuse semantics

Reuse is scoped to one project and one source snapshot. It is never a global cache shared by different stories or users.

- The project owns the uploaded source reference (`fileUri` or equivalent). Uploading the same book once is reusable input preparation, not reusable generated output.
- A `generation_run` represents one coherent style configuration, such as `anime` or `watercolor`. Characters, chapters, image items, interactions, and assets produced by that configuration reference its run ID.
- The project view resolves one active generation run. Previous runs remain read-only backend records for isolation and debugging; the primary UI does not expose run history.
- Reopening an existing run reads its persisted database state and local assets. It does not call Gemini again.
- An explicit style change creates a new generation run and new step attempts. It may reuse the project's uploaded source reference, but it starts a fresh text interaction chain so an old style cannot leak into the new run.
- A style change requires confirmation because downstream characters, portraits, chapters, and illustrations become stale and may consume text and image-generation credits. Old results are preserved as a previous run; they are not deleted.
- A non-empty user style is a direct input to the new run and does not require a Gemini acknowledgement call. A blank style uses a fresh Style generation call against the project's source reference.
- Internal run-selection routes remain available for backend isolation tests, but they are not part of the reviewer-facing product flow. Same inputs do not guarantee the same output when Gemini is called again.

Implementation identity for a reusable result is `project_id + generation_run_id + step/item + prompt_version + model_id`. A source hash and style fingerprint should be stored for diagnostics and to explain why a result is reusable or stale. Never select a result by project ID alone.

### 5.3 Step state machine

```text
pending ──start──▶ running ──success──▶ completed
   ▲                 │  │
   │                 │  └──error──────▶ failed ──retry──▶ running
   │                 │
   └──── recover ◀── stale running
```

Rules:

- Only the next incomplete step may be claimed.
- A claim requires the prior step to be `completed`.
- `running` is valid only while its run heartbeat is fresh.
- A stale run can be explicitly recovered once; recovery marks it retryable and never invokes Gemini.
- A failed step may be retried only by an explicit user action.
- A retry creates a new step-attempt ID inside the same generation run and preserves completed upstream outputs.
- An explicit style change creates a new generation run; it never mutates the old run's outputs.
- For image steps, item state is independent. Completed items are skipped on retry; failed or pending items are eligible.
- A project is `Draft` when no step has completed in the active generation run, `In progress` when work exists but the final step is not complete, and `Done` only when all five steps are complete. The project status is derived, not separately mutated by the browser.

### 5.4 Run claim and stale recovery rules

- `start` performs a conditional transactional update/insert that succeeds only for a claimable step (`pending` or `failed`) with no fresh active run.
- The active step-attempt ID is random and persisted before the external Gemini call.
- A duplicate request returns the existing run view or a typed `RUN_ALREADY_ACTIVE` response; it never starts another Gemini call.
- The runner updates `heartbeat_at` between external calls and item writes.
- Default stale threshold: 2 minutes since the last heartbeat, configurable for tests through an environment variable.
- `recover` requires ownership and a stale run. It atomically changes the step to `failed` with `STALE_RUN`, clears the active claim, and leaves all completed item assets untouched.
- The next `retry` is the only operation that starts external work again.

## 6. API contract

All API responses use JSON. Errors have a stable `code`, human-readable `message`, and optional field details. Mutations require an authenticated same-origin session.

| Method | Route | Behavior |
| --- | --- | --- |
| `POST` | `/api/session` | Validate name/email, find or create user, set HTTP-only cookie, return user summary. |
| `DELETE` | `/api/session` | Revoke current session and clear cookie. |
| `GET` | `/api/projects` | Return the authenticated user's projects with derived status and five-step progress. |
| `POST` | `/api/projects` | Validate title/text or normalized `.txt` content, persist project, return project summary. |
| `GET` | `/api/projects/:projectId` | Return the owned project view model, full book text, steps, characters, chapters, and safe asset URLs. |
| `GET` | `/api/projects/:projectId/generation-runs` | Internal owned-run read endpoint retained for isolation tests and diagnostics; it is not exposed by the primary UI. |
| `POST` | `/api/projects/:projectId/generation-runs` | Create a new style configuration from the stored source reference. A non-empty style is persisted directly and marks `STYLE` complete; a blank style leaves `STYLE` pending for Gemini generation. The old run remains read-only. |
| `POST` | `/api/projects/:projectId/generation-runs/:runId/select` | Internal owned-run selection endpoint retained for backend tests; it does not invoke Gemini and is not a primary UI control. |
| `POST` | `/api/projects/:projectId/steps/:step/run` | Validate order for the selected `generationRunId`, atomically claim the step, and start the local runner. It never falls back to a different run. |
| `POST` | `/api/projects/:projectId/steps/:step/recover` | Explicitly recover an owned stale run without invoking Gemini. |
| `GET` | `/api/assets/:assetId` | Stream an asset only after checking that the current session owns its project. Never accept a raw filesystem path. |

### Validation and error codes

- Email: trim, lowercase, and validate a practical email shape; no password is collected.
- Name: required, trimmed, 1–100 characters.
- Project title: required, trimmed, 1–120 characters.
- Book text: required, UTF-8 text, maximum 200,000 characters.
- Upload: `.txt` extension and `text/plain`-compatible content, maximum 2 MB; normalize line endings and reject unreadable/binary content.
- Optional style: maximum 500 characters and accepted only on the Style step.
- Generation run: every step mutation must include or resolve an owned active `generationRunId`; a previous run cannot be mutated after selection.
- Gemini structured outputs: reject malformed JSON, missing required fields, non-adult character entries, more than 2 characters, or more than 1 chapter before persistence.
- Error codes: `AUTH_REQUIRED`, `FORBIDDEN`, `VALIDATION`, `STEP_ORDER`, `RUN_ALREADY_ACTIVE`, `STALE_RUN`, `GEMINI_FAILED`, `GEMINI_RATE_LIMIT`, `GEMINI_INVALID_OUTPUT`, `ASSET_WRITE_FAILED`, and `NOT_FOUND`.

## 7. Gemini orchestration contract

The implementation must first run and understand the notebook section “Illustrate a book: The Wind in the Willows”, steps 1–5. The notebook is the source for call mechanics; do not invent a simplified fake pipeline.

### Shared rules

- Read the API key only on the server from `GEMINI_API_KEY`.
- Configure text and image model IDs through environment variables. Defaults must be verified against the current notebook/API before implementation because model IDs change.
- Upload the source book content once per source snapshot and persist the returned source file URI or equivalent reusable reference at project level.
- For every generation run, start a fresh text interaction chain that references the stored source file; persist each interaction ID and chain Style → Characters → Chapters only within that run.
- Validate every structured response at the server boundary before changing durable step state.
- Do not send the full book text again for every step.
- Do not automatically retry a failed Gemini request.

### Step-specific behavior

1. **Style**: for a non-empty user style, persist the exact normalized value as a direct override without a Gemini acknowledgement call; for blank input, use the persisted book reference in the new run's root interaction and request structured style output.
2. **Characters**: continue the current generation run's text context, request adult characters with image prompts, enforce the maximum of 2 server-side, and persist the ordered list with that run ID.
3. **Portraits**: construct image requests from the shared style and character prompts; execute eligible characters with `Promise.allSettled`; write each successful image asset immediately and retain item-level failures.
4. **Chapters**: continue text context and pass explicit character names/prompts plus explicit portrait references; enforce the maximum of 1 chapter before persistence.
5. **Illustrations**: generate the eligible chapter image with the style, chapter prompt, and portrait references; persist the image before finalizing the step.

The image runner must be idempotent at the application level: a retry checks existing completed item assets and does not regenerate them. Gemini itself is treated as an external side effect, so the atomic run claim is established before the first call.

## 8. Security, reliability, and local storage

- Never expose `GEMINI_API_KEY` to client bundles, error responses, logs, or committed files. Ship only variable names in `.env.example`.
- Use an opaque random session token in an HTTP-only, `SameSite=Lax` cookie; persist only a hash of the token. Use `Secure` when served over HTTPS and revoke the session on sign out.
- Every project, step, character, chapter, and asset query is scoped through the authenticated owner. Never trust a client-supplied user ID.
- Store files beneath a configured application data directory using generated asset IDs. Resolve and verify paths server-side; reject traversal and arbitrary path segments.
- Write assets to a temporary generated filename, flush/close the file, then atomically rename it into its final key before exposing it.
- Do not log book text, image bytes, API keys, cookies, or full prompts. Log only request ID, project ID, step, run ID, duration, item ID, and stable error code.
- Set explicit request/body limits and reject unsupported MIME types before writing to disk.
- Use SQLite transactions for claims, state transitions, and metadata. Keep writes short and never hold a database transaction across a network call.
- Treat Gemini rate-limit, timeout, malformed-output, and asset-write failures as retryable step failures with actionable UI copy.
- Preserve completed work on every failure. A process restart may leave a fresh run marked `running`; only timeout plus explicit user recovery may release it.
- Make the local-only/in-process limitation explicit in `README.md`; do not imply distributed worker durability.

## 9. UI implementation contract

`DESIGN.md` owns the visual and interaction details. Implementation must use its component map, tokens, state matrix, copy rules, responsive requirements, and accessibility checklist.

The detail workspace follows the demo-first structure selected during planning:

- header and five-step pipeline stepper;
- primary generation panel on the left;
- book/style context on the right;
- character and chapter result cards below;
- inline state panels beside the relevant step or item rather than toast-only feedback.

The UI language is English-only. Portrait cards use the demo's 3:4 framing and chapter cards use square 1:1 framing; prompts keep important subjects inside a central safe area so the UI does not need to crop them.

While polling, the client may update transient visual state but must always replace it with the latest server view model. Polling stops on `completed`, `failed`, or `stale`; it must not create a second run. The browser must show completed image items as soon as they appear in the server response.

### UX hardening action plan

This is a focused UX fix slice before handoff. It addresses observed trust, layout, and waiting-time problems without adding new product scope.

Approved implementation boundary for this slice: keep the active route focused on
one project pipeline and its saved results. The active route must not present
generation history, cache keys, previous-run selectors, or internal Gemini
details. Server-side run metadata and recovery contracts remain unchanged.

#### P0 — Make long-running work legible

- Replace spinner-only feedback with an animated indeterminate progress bar, named phase copy, and elapsed time from the persisted run start. Never show a guessed percentage or promise an ETA that Gemini does not provide.
- For image steps, show honest determinate item progress such as `1 of 2 portraits saved`; keep each completed image visible while the remaining item runs.
- Keep a fixed 3:4 portrait frame and square 1:1 illustration frame during loading, success, and failure so content never changes the media ratio.
- Add a concise `aria-live` status update when the phase or item count changes; do not announce every polling tick.
- Acceptance: after starting any step, a user can identify the step, current phase, elapsed time, and completed item count without relying on a frozen-looking icon.

#### P0 — Make custom style input fast and clear

- Treat a non-empty style input as a user-owned override. Save it exactly as entered and skip the redundant Gemini acknowledgement call.
- Defer source-book upload/context creation until the first text-generation step that needs it; this preserves the one-source-context rule without making `anime` wait for a no-op request.
- Use `Style direction` as the label, `Use this style` as the action when text is present, and explain that the value is applied to later prompts.
- Keep the blank-input path explicit: `Generate style from book`, with copy that acknowledges it requires a Gemini call.
- Acceptance: entering `anime` completes Style without a Gemini text call, displays `anime` as the saved style, and passes it to Characters/Images; a blank style still invokes the style-generation path.

#### P1 — Reveal new results without stealing the page

- Never scroll the document automatically after polling or result creation. Users keep control of their reading position while the server view updates.
- Keep result sections in a predictable order and expose honest item-level progress so newly saved work is discoverable without moving focus or changing the viewport.
- Acceptance: portraits, chapter results, and the final illustration render from the latest server view without calling `scrollIntoView`, `window.scrollTo`, or an equivalent API.

#### P1 — Keep the detail page compact

- Replace the permanent full-book panel with a short source preview, character count, and `Read full text` action. Keep the complete text in a bounded accessible dialog with Escape and focus return.
- Keep the saved style and source preview together as compact context cards so either remains available at every pipeline stage.
- Bound portrait media near 3:4 and illustration media at 1:1 with responsive widths and stable frames; prompt content must not determine image height.
- Use a code-native editorial paper composition for missing media: no centered spinner, avatar icon, or empty white gutters; keep the state label anchored away from the focal center.
- Acceptance: the primary workspace is scannable at 375px, 768px, 1024px, and 1440px without hiding the source, style, status, retry, or recovery paths.

#### P1 — Keep prompts from resizing artwork

- Replace inline expanding `<details>` for long illustration prompts with an accessible modal or bounded prompt panel (`max-height` plus internal scrolling).
- Show a short prompt preview in each character/chapter card so the result is understandable before opening the full prompt.
- Keep the preview to one readable line and use the existing brand paper/ink/orange tokens with restrained borders.
- Keep the image container fixed and top-aligned even when prompt content grows; the prompt must never determine the illustration height.
- Acceptance: opening `Read full prompt` does not change the illustration's square framing or create a long viewport jump; Escape, focus return, keyboard access, and reduced motion work.

#### P1 — Remove low-value visual noise

- Hide `Attempt 1` on the first run; show attempt history only when a retry exists.
- Keep the saved-style card content-sized and top-aligned instead of stretching it to the full height of the book-text panel.
- Add a subtle `New`/saved transition only when a real result arrives; do not animate the entire page or replace existing assets.

#### P2 — Verify the interaction contract

- Add focused component tests for the compact completed panel, source preview/full-text dialog, bounded media, running and item-level progress, prompt dialog behavior, failure/retry/stale recovery, keyboard Escape/focus return, reduced motion coverage, and the absence of automatic scrolling.
- Manually verify the primary flow at 375px, 768px, 1024px, and 1440px, including keyboard focus, reduced motion, long prompts, slow Gemini calls, partial image failure, refresh during polling, and stale recovery.
- Record actual commands and the manual UX checklist in `TESTING.md`; do not claim progress or visual verification without running it.

## 10. Test and evidence plan

Automated tests use mocked Gemini and a temporary SQLite/filesystem data directory. Real Gemini is reserved for deliberate local UAT and must not be required for the test command.

| Critical requirement | Acceptance evidence | Test/scenario |
| --- | --- | --- |
| Identity ownership | A user can sign in, sign out, and see only their projects | Backend session tests; project ownership test; frontend identity states |
| Project creation | Pasted text and valid `.txt` upload create a durable project | Validation tests for title/text/file type/size; project persistence test |
| Ordered execution | Each step requires explicit action and a completed predecessor | Backend state-transition tests for wrong order and repeated completion |
| Hard caps | At most 2 adult characters and 1 chapter survive server validation | Malformed/over-limit Gemini output tests; UI does not bypass server cap |
| Single source upload/context | Book content is uploaded once and later text calls reuse persisted context | Gemini adapter spy asserts one upload and chained interaction references |
| Generation-run isolation | Two styles in one project keep separate outputs while reusing the same source reference | Create `anime` and `watercolor` runs; assert fresh interaction roots, run-scoped assets, no cross-run characters, and one source upload |
| Saved-state reuse | Reopening the active project makes no model call; a new style run creates isolated output | Stub Gemini and count calls for reopen versus a new run; assert the old run remains unchanged |
| Duplicate protection | Double-click, refresh, and second tab share one active run | Concurrent claim test with two requests; only one Gemini invocation occurs |
| Durable resume | Refresh/logout/restart preserves completed steps and assets | Reopen project after each step; restart fixture and persisted-state test |
| Image partial progress | Successful portrait remains visible when another image fails | `Promise.allSettled` test; asset persisted before step finalization; retry skips success |
| Retry semantics | Explicit retry affects only the failed/recovered step | Failed step retry test; completed upstream rows/assets remain unchanged |
| Stale recovery | A stale running step exposes Recover and becomes retryable without a Gemini call | Clock-controlled stale test; recovery endpoint test; fresh run is rejected |
| Asset security | Owned assets stream; foreign or traversal requests fail | Ownership, invalid ID, and path traversal tests |
| UI state coverage | Loading, empty, error, disabled, success, partial, stale, focus, and modal states are usable | Focused component tests plus manual keyboard/responsive/reduced-motion checklist |
| Real end-to-end confidence | Five steps work against the real Gemini API with actual persisted results | Deliberate local UAT report with model IDs, date, steps, and known limitations |

The final `TESTING.md` must distinguish automated mocked tests from real Gemini UAT and contain actual command output. Never write a passing result before running it.

## 11. Implementation milestones and stop lines

Each milestone is a candidate small, reviewable commit boundary with focused checks and an honest commit body when AI authored most of the work. Follow `AGENTS.md`: prepare the exact commit proposal, but wait for Bao's explicit approval before running `git commit`.

### M0 — Harness and foundation

- Initialize Next App Router, TypeScript, Tailwind, test runner, formatting/linting, environment validation, and `.env.example`.
- Add `npm run dev`, `npm test`, `npm run check`, and `npm run build` with deterministic sequential checks.
- Add SQLite connection/migration/bootstrap and safe local data-directory helpers.
- Evidence: app boots, test runner executes, environment validator rejects missing configuration.

### M1 — Identity, projects, and durable view model

- Implement session cookie, user lookup/create, sign out, project creation, `.txt` validation, book-text persistence, project list, and project detail read model.
- Add schema and repository tests before wiring the complete UI.
- Evidence: refresh/reopen preserves a created project and ownership tests pass.

### M2 — Text pipeline: Style and Characters

- Implement Gemini adapter, one-time source upload, generation-run creation, style override/blank-style branching, structured output validation, interaction metadata, atomic step claims, and ordered Style/Characters execution.
- Keep each generation run's text chain separate while reusing the project-level source reference.
- Add explicit running, failed, retryable, and stale state responses.
- Evidence: mocked notebook-shaped responses produce durable style and at most 2 adult characters.

### M3 — Portraits and partial progress

- Implement parallel settled image execution, per-character item state, immediate asset persistence, safe asset route, and retry that skips completed portraits.
- Build the card/progress states required by `DESIGN.md`.
- Implemented boundary for this milestone: `STYLE`, `CHARACTERS`, and `PORTRAITS`. `CHAPTERS` and `ILLUSTRATIONS` remain visible in the stepper but are rejected by the server and locked in the UI.
- Evidence: one successful and one failed portrait survives refresh and only the failed item is retried.

### M4 — Chapters and Illustrations

- Implement chained chapter prompt generation with explicit portrait references, 1-chapter cap, illustration generation, and final project completion.
- Add full five-step stepper and book-text access at every stage.
- Evidence: mocked full pipeline reaches `Done`; real UAT produces actual assets.

### M5 — Recovery, quality pass, and handoff

- Add stale timeout/recovery, concurrent-request tests, internal generation-run isolation, style-change cost confirmation, accessibility/responsive review, error-copy pass, and server restart verification.
- Write `README.md` and `TESTING.md` with actual setup, limitations, test strategy, and report.
- Review `DECISIONS.md` only with real human/AI trade-offs and evidence; do not back-fill invented history.
- Evidence: complete check/build, focused frontend/backend tests, manual ugly-path checklist, clean staged diff, and honest incremental Git history.

### Stop lines

Stop feature work and polish the core flow when all five steps, persistence, duplicate protection, stale recovery, frontend/backend tests, and required docs are working. Do not start bonus features before this point. If time is short, prefer a smaller polished failure-safe flow over additional generation modes.

## 12. Required handoff artifacts

- `README.md`: prerequisites, one start command, one test command, environment variables, architecture, local storage, testing, and limitations.
- `DECISIONS.md`: 4–6 real decisions, including at least 3 genuine AI overrides and the one-more-day answer; update only from actual planning/implementation exchanges.
- `TESTING.md`: frontend/backend strategy, deliberate omissions, edge cases, and the real test report.
- `.env.example`: variable names and safe local defaults only.
- `docs/ai/`: only prompts, review notes, or agent artifacts that materially contributed to the implementation.
- Git history: small meaningful commits; no fabricated timestamps, output, or AI worklog.

## 13. Definition of done

- The real five-step pipeline works locally with a real Gemini key.
- The book is uploaded/referenced once per source snapshot and context is reused across text steps within each generation run.
- Different styles in the same project have isolated run-scoped outputs; the primary UI renders only the current project pipeline and saved results.
- The 2-character and 1-chapter limits are enforced server-side.
- Refresh, logout, and restart preserve completed progress and assets.
- Duplicate execution is blocked by an atomic server-side claim.
- Partial images remain visible and retry does not regenerate completed items.
- Failed and stale steps have explicit user-triggered recovery.
- The UI covers all `DESIGN.md` states, responsive widths, keyboard flow, focus visibility, and reduced motion.
- Backend and frontend tests pass with mocked Gemini; real UAT is recorded separately.
- `README.md`, `TESTING.md`, `DECISIONS.md`, `.env.example`, and Git history are honest and complete.
- Intentionally out-of-scope work and local runner limitations are documented.

## 14. Approved optional bonus slice

- Offer two bundled, allowlisted public-domain books on the New Project form; the server resolves the selected ID and the existing project-creation path remains authoritative.
- Expose persisted `pipeline_runs` as project-scoped attempt history, plus an authenticated `Attempts` navigation page that lists all owned attempts and links back to each project.
- Do not add a schema migration, runtime book download, generation-run management UI, higher content caps, or another Gemini step.
- Verify both bonuses with focused backend/frontend tests, then run the existing full quality gates.

## References

- Official local assessment: [`docs/reference/gradion-assessment.md`](reference/gradion-assessment.md)
- Supplied visual baseline: [`docs/reference/app-demo.html`](reference/app-demo.html)
- Google notebook: [Book illustration notebook](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/examples/Book_illustration.ipynb)
- Gemini API documentation: [ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs)
- ADR structure: [MADR ADR template](https://adr.github.io/madr/decisions/adr-template.html)
