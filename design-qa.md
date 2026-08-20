# Design QA

## Visual target

- Selected layout reference: `/var/folders/yw/cw8hv8gs6pgghzc7l2m18x8w0000gn/T/codex-clipboard-2bd15102-3ea3-4133-a7bc-e7b68235dff7.png`
- Regeneration-state correction: `/var/folders/yw/cw8hv8gs6pgghzc7l2m18x8w0000gn/T/codex-clipboard-7ea98e9c-ad6d-4552-b28d-8e2b2e8edd70.png`
- Route checked: `http://127.0.0.1:3000/projects/536e29c5-dfe1-4d4f-b8c2-7e9864ad90fe`
- Partial route checked: `http://127.0.0.1:3000/projects/d21631d8-bbd1-46c4-b41c-6476648d9646`

## Captures

- Completed workspace: `/Users/bao/.codex/visualizations/2026/08/20/01a01d89-a739-7950-84ff-810140f97f5b/implementation-caption-links.png`
- Attempt-history modal: `/Users/bao/.codex/visualizations/2026/08/20/01a01d89-a739-7950-84ff-810140f97f5b/implementation-attempt-modal.png`
- Editable prompt modal: `/Users/bao/.codex/visualizations/2026/08/20/01a01d89-a739-7950-84ff-810140f97f5b/implementation-edit-prompt.png`
- Reference comparison: `/Users/bao/.codex/visualizations/2026/08/20/01a01d89-a739-7950-84ff-810140f97f5b/design-comparison.png`

## Checked states

- Desktop completed contact sheet keeps a compact shell, serif project title, five-step progress, and a four-card reading order: metadata, two portraits, then the wide chapter image.
- From the Characters step onward, pending, running, failed, and completed image items stay in that same contact-sheet layout; the next-step action replaces the header status pill, while running uses a compact spinner in that button.
- The 0-of-5 state now uses the same contact sheet too: `Generate style` is the header action, the optional style direction lives inside the first context card, and no legacy ready/status card is mounted.
- Every generated image exposes `Read full prompt`, and current prompts open in a bounded modal.
- Current-run prompts can enter edit mode; unchanged or blank prompts cannot retry; changed prompts expose `Save & retry`.
- While an edited prompt is regenerating, the image frame becomes a clean white loading state with the demo's orange-ring spinner and a specific per-item caption. The previous asset remains persisted for failure recovery but is not shown while the request is running.
- Chapter illustrations use a square API output and a square UI frame; the generation prompt keeps important subjects inside a central safe area instead of relying on `object-cover` to crop a landscape image.
- Attempt history is a modal with a bounded internal list rather than a page-length expansion.
- Real project content differs from the reference title and watercolor assets by design; layout, hierarchy, density, and interactions are the comparison targets.
- Desktop and narrow viewport checks found no horizontal overflow; dialog focus and Escape return are covered by component tests.
- The real 2-of-5 A Christmas Carol project was checked at 1280px and 390px: the old generated-results section is absent, the metadata card leads the contact sheet, and two pending portrait frames follow without horizontal overflow.

## Result

Passed for the selected workspace layout and edited-prompt retry flow. No production build was rerun because the user explicitly requested the dev server workflow.
