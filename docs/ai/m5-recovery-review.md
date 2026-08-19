# M5 Recovery Review Artifact

## Review prompt used

> Audit the existing five-step Gradion Book Illustration Studio flow for recovery and concurrency risks. Do not add product features. Check wrong-order execution, duplicate claims, persisted run IDs, stale heartbeats (including missing and invalid values), stale recovery before external calls, explicit retries, partial portrait success, failed-only portrait retry, chapter/illustration retry preservation, malformed model output, hard caps, ownership, asset path safety, and refresh/restart persistence. Then review the existing UI states at mobile and desktop widths for loading, running, failed, stale, partial-success, completed, focus visibility, reduced motion, and private asset rendering. Preserve unrelated working-tree changes.

## Evidence produced

- Added server-side active-claim checks immediately before external Gemini calls, closing the known stale-run race where a recovered runner could continue after its claim became invalid.
- Added regression coverage for missing/invalid heartbeats, no-Gemini-after-recovery, malformed output, chapter caps, failed-only retries, upstream preservation, asset ownership/backing-file checks, and restart read-back.
- Added frontend assertions for running/stale copy, failed illustration progress, private asset URLs, and polling response ordering.
- Reviewed the production-shaped UI at 375px and desktop width. No horizontal overflow was observed; the workspace retained real controls, labels, and visible focus treatment.

## Decisions intentionally not made

No automatic Gemini retry, queue, distributed worker, new persistence service, or real Gemini UAT was introduced. Those would change the reliability model or incur external cost without being necessary to prove the current five-step flow.
