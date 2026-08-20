# Testing and Verification

## Strategy

Backend tests exercise the pipeline as a state machine: ordered step claims, persisted generation-run IDs, ownership checks, SQLite transitions and upgrades, mocked Gemini adapters, local asset storage, and recovery after failures or stale heartbeats. The generation-run tests also cover exact direct styles, lazy source upload/reuse, expired-source reupload, fresh interaction roots, isolated outputs, previous-run selection, and cross-project isolation. Tests deliberately inspect both the database view and the returned project view so a successful response cannot hide a missing persisted result.

Frontend tests exercise the project page with mocked API responses. They cover ordered action availability, hidden generation-history controls, neutral saved-output rendering, code-native missing-media frames, one-line prompt previews with full source/style and prompt dialogs, running and stale copy, retry affordances, private non-cacheable asset responses, item progress, compact completion, bounded media, Escape/focus return, the no-scroll contract, and the polling race where an older response must not overwrite newer state. The responsive/accessibility pass also used the local production server at 375px, 768px, 1024px, and 1440px to check overflow, labels, real controls, visible focus treatment, and the absence of history copy.

## Manual real-Gemini smoke

The application flow was also run manually with a real Gemini key using `gemini-3.6-flash` for text and `gemini-3.1-flash-image` for images. This is product smoke evidence, separate from the repeatable mocked test report below; no paid Gemini call is part of the automated gate.

## Actual generation-run verification

Commands were run sequentially from `/Users/bao/GitHub/ai-story-book`.

### `npm test`

```text
Test Files  15 passed (15)
Tests       74 passed (74)
```

### `npm run check`

```text
Prettier: all matched files use Prettier code style.
ESLint: passed.
TypeScript: passed.
Environment valid for local development and CI; Gemini key is optional.
Pipeline contract valid: 5 ordered steps, caps 2/1.
```

### `npm run build`

```text
Next.js 16.3.1 production build completed.
Compiled successfully, TypeScript passed, and static pages 5/5 completed.
```

### `git diff --check`

Passed with no whitespace errors.

### Production server and restart fixture

The production server was built and started with the repository's `next start` command at:

```text
http://127.0.0.1:3000
```

`GET /api/health` returned HTTP 200:

```json
{
  "database": "ok",
  "service": "gradion-book-illustration-studio",
  "status": "ok"
}
```

A separate temporary data directory was used on port 3001 for a no-cost restart fixture. It contained book text, style, two characters with portrait assets, one chapter prompt, and one illustration asset. The project API returned the same completed state before and after stopping and restarting the production server. Authenticated portrait and illustration asset requests both returned HTTP 200 with `image/png`. The browser DOM retained the correct private same-origin asset URLs and labels at 375px; the browser pixel decode was not treated as a pass criterion because the in-app browser did not report a natural image size for that temporary fixture.

## Ugly-path checklist

Covered by automated tests unless marked otherwise:

- Wrong-order execution is rejected.
- Duplicate request/double-click and a second concurrent claim are rejected by the atomic claim.
- The persisted run ID is written to both the step and run record.
- Old, missing, and invalid heartbeats are considered stale.
- A long in-flight Gemini call refreshes its persisted heartbeat and does not become falsely stale.
- Recovering a stale run prevents the old runner from making a Gemini call in the checked race path.
- Explicit retry creates a new step attempt inside the selected generation run and increments the attempt.
- Portrait partial success preserves completed assets.
- Portrait retry runs only failed items.
- Chapter and illustration retries preserve upstream style, character, portrait, and chapter results.
- Malformed or empty Gemini output fails the step with an actionable persisted error.
- An expired stored Gemini file is uploaded again before a fresh interaction root; transient lookup errors do not trigger a hidden retry.
- Server-side caps reject more than two adult characters or one chapter.
- Project and asset ownership are checked server-side.
- Successful private asset responses use `private, no-store` rather than a long-lived shared cache policy.
- Traversal-like asset keys and missing backing files are rejected.
- Refresh/read-back and server restart preserve book text, style, characters, prompts, and asset records.
- Frontend running, failed, stale, partial-success, completed, private-asset, compact-source, missing-media-frame, one-line prompt-preview/full-dialog, bounded-media, focus-return, and no-automatic-scroll states have regression coverage.
- Generation-run direct-style, source-reuse, isolation, selection, and read-only persistence behavior remains covered on the backend; the active project route does not expose those internal run controls.

## Deliberate omissions

- No real Gemini calls were made during M5 verification; tests use mocked adapters to avoid API cost.
- No distributed worker, queue, Redis, Supabase, Prisma, Docker, SSE, or WebSocket layer was added.
- No automated browser screenshot or full keyboard traversal suite was added; the local browser review was a focused smoke check of the active project route at 375px, 768px, 1024px, and 1440px, including DOM overflow, source-dialog Escape/focus return, labels, and focus visibility. Prompt-dialog behavior is covered by component tests and uses the same dialog implementation. The reduced-motion rule for the new progress bar was verified in `app/globals.css`; the browser surface did not expose media emulation for a toggled run.
- No migration/reset command was run.

These omissions are consistent with the local, single-process assessment scope and are limitations rather than claims of production-scale guarantees.
