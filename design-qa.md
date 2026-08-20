# Design QA

## Visual target

The supplied `docs/reference/app-demo.html` is the portable visual baseline. QA
was performed on the active `/projects/:projectId` route; machine-local captures
are intentionally not presented as reviewer evidence.

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
- The current completed project was rechecked on the live dev server at 390px and 1440px after the review fixes; document width matched the viewport at both sizes, step names remained available to assistive text, and the gallery kept its intended reading order.
- Active work names the running step inside the compact header action. Image cards carry their own specific loading states, so no elapsed label or decorative progress track is shown below the action; reduced-motion users receive a static ring instead of an infinite spinner.

## Result

Passed for the selected workspace layout and edited-prompt retry flow. No production build was rerun because the user explicitly requested the dev server workflow.
