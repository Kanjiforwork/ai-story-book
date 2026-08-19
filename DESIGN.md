# Book Illustration Studio — Design Contract

## Purpose

This is the UI source of truth for the Gradion take-home app. The supplied demo at `docs/reference/app-demo.html` is the floor for visual scope and interaction coverage. The implementation should feel at least as complete and polished, while using real server state and real Gemini results.

This document is intentionally about product experience and component boundaries. It must stay aligned with the official assessment and the approved `docs/plan.md`.

## Authority and boundaries

Use these sources in order:

1. User instructions and the official assessment.
2. `docs/reference/app-demo.html` for visual language, screens, and baseline interactions.
3. This document for the component map, state coverage, and interaction rules.
4. Implementation details chosen in the approved plan.

The demo is a reference, not production code. Do not copy its `localStorage` data layer, fake timers, placeholder images, fake numbers, or one-tab duplicate guard. Replace them with server-owned sessions, persisted project state, real Gemini calls, local asset storage, and server-side concurrency protection.

## Product experience

The primary workflow is explicit and linear:

`Style → Characters → Portraits → Chapters → Illustrations`

The user should always understand:

- what has already been generated;
- which step is current;
- what one action is available next;
- what is happening during a long-running call;
- what failed and how to recover;
- which partial images are already safe to keep.

Do not auto-advance steps, hide the full book text, or replace an existing result with an optimistic placeholder.

## Visual direction

The demo establishes a warm editorial storybook language:

- paper and white surfaces with ink-colored text;
- Gradion orange reserved for primary actions, current progress, and attention;
- restrained borders, rounded cards, and soft elevation;
- readable sans-serif body text with a clear display hierarchy;
- subtle opacity/transform motion only, with reduced-motion support;
- real generated imagery as the visual focus once assets exist.

Use the demo's tokens as the starting point rather than introducing a second visual system:

```text
orange:  #FF6B00
ink:     #231F20
body:    #595959
muted:   #919699
line:    #BAB7B1
paper:   #F2EEE7
surface: #FFFFFF
canvas:  #F8F8F8
```

An external design search suggested an editorial serif direction, but the supplied Gradion demo is the closer product-specific source of truth. Any typography change must improve readability and hierarchy without losing the demo's recognizable tone.

## Screen and component map

Keep page/container logic separate from presentational components. Components receive typed data and callbacks; they do not call Gemini, access the database, read arbitrary filesystem paths, or decide ownership.

### Shared shell

- `AppShell` — navigation, user identity, sign out, page container.
- `StatusPill` — Draft, In progress, Done, and error variants.
- `ProgressSegments` — five-step project progress, derived from persisted state.
- `Button`, `Input`, `Textarea`, `FieldError`, `Spinner`, `EmptyState` — small accessible primitives.

### Identity and projects

- `IdentityForm` — name/email validation, loading, and submission error.
- `ProjectList` — loading, error, empty, and populated states.
- `ProjectRow` — title, creation date, status, and five-step progress.
- `NewProjectForm` — title, pasted text, `.txt` upload, validation, and submit state.
- `TextFileDropzone` — visible browse control with keyboard alternative and selected-file feedback.

### Project detail

- `ProjectHeader` — title, creation date, and back navigation.
- `PipelineStepper` — done/current/pending states for all five steps.
- `StepActionPanel` — one clear action for the current step, named running state, error, retry, and stale recovery.
- `StyleField` — optional user-supplied style on step 1 only.
- `CharacterGrid` / `CharacterCard` — name, prompt, portrait, per-item loading/error state.
- `ChapterList` / `ChapterCard` — name, prompt, illustration, per-item loading/error state.
- `BookTextPanel` / `BookTextModal` — readable full text at every pipeline stage.
- `GenerationProgress` — item-level progress; completed images remain visible while other items run.

Prefer domain names over generic components such as `Card1`, `Panel`, or `MagicGenerator`. Extract a component when it owns a meaningful state boundary or is reused; do not split every wrapper into a component.

## State coverage matrix

Every screen must define and test the important states below.

| Surface | Required states | Primary recovery/action |
| --- | --- | --- |
| Identity | empty, invalid, submitting, server error | correct fields and retry |
| Project list | loading, error, empty, populated | retry or create project |
| New project | empty, file selected, invalid, submitting, server error | edit input or retry |
| Step action | ready, running, failed, stale, complete | run next step, retry, recover |
| Portraits | pending, per-item running, partial success, item failure, complete | keep completed images and retry failed work |
| Illustrations | pending, running, failed, complete | retry without touching prior steps |
| Book text | preview, full modal, loading/error if applicable | reopen/close without losing focus |

The UI must derive these states from the server view model. Local component state may control transient form input or modal visibility, but it must not become the source of truth for pipeline progress.

## Responsive and accessibility rules

- Design mobile-first and verify at approximately 375px, 768px, 1024px, and 1440px widths.
- Preserve the demo's two-column detail layout on wide screens and collapse cleanly to one column on narrow screens.
- Every input has a visible label; placeholders are examples, not labels.
- Every meaningful action is keyboard reachable with a visible focus ring.
- Dialogs have a label, focus entry, Escape close, and focus return.
- Do not communicate state by color alone; include text, icon, or structure.
- Keep primary controls large enough to use comfortably and prevent layout jumps while content loads.
- Respect `prefers-reduced-motion`.
- Use real buttons and links instead of clickable `div`s.
- Escape user text before rendering and keep error messages close to their source.

## Interaction and copy rules

- One primary action per screen or current pipeline state.
- Status copy answers “what is happening?”, “what can I do?”, or “what happened?”
- Loading text names the exact step: “Generating character portraits”, not just “Loading”.
- Errors explain the failed operation and give the next safe action.
- Avoid marketing copy, technical implementation commentary, and repeated explanatory subtitles.
- Never promise that a retry is safe unless completed results are persisted and the server transition actually makes it safe.

## Acceptance checklist

Before calling the UI complete, manually and through focused tests verify:

- identity form and sign out;
- empty and populated project list;
- new project from pasted text and `.txt` upload;
- optional style input;
- all five steps shown in order;
- refresh and reopening during a running step;
- per-item portrait/illustration progress;
- partial success and retryable errors;
- stale-step recovery;
- full book text access;
- responsive layout, keyboard flow, focus, and reduced motion.

The demo is the minimum coverage. The real app must additionally handle failure, server restart, ownership, duplicate requests, hard caps, and durable assets.
