# Product tour verification — 2026-10-11

The walkthrough was recorded from the actual application at product HEAD `6822008`, using `http://127.0.0.1:3001` and isolated local Supabase. No product source, dependencies, package configuration, existing workspaces, or final-review files changed. The original frozen-HEAD product review remains independent.

## Artifacts

- `docs/product-tour/index.html`: responsive, standalone guide explaining audience, purpose, separate owner/client roles, six workflow steps, quote/payment distinction, chapters and complete transcript.
- `docs/product-tour/clientlane-tour.webm`: 1440 × 900 WebM, 13,409,451 bytes, native decoded duration 114.84 seconds. Silent by design; readable captions and role labels are burned into actual application footage.
- `docs/product-tour/chapters.json`, `captions.vtt`, `transcript.md`: generated from the recording's measured timings.
- `docs/product-tour/recording-evidence.json`, `playback-evidence.json`: machine-readable outcome, cleanup and viewing evidence without credentials, user IDs, workspace IDs, or bearer URLs.
- `docs/product-tour/guide-desktop.png`, `guide-mobile.png`, `video-frame-*.png`, `handover.png`: rendered guide and decoded application frames used for visual inspection.
- `scripts/record-product-tour.mjs`, `serve-product-tour.mjs`, `test-product-tour-server.mjs`, `verify-product-tour.mjs`: reproducible recording, bounded local serving, focused server checks and browser playback checks. Run instructions are in the artifact README.

## Actual workflow evidence

The final recording finished successfully with 113.025 seconds of measured script activity, plus encoder startup/tail. Persisted fixture data and actual application controls confirmed:

1. Freelancer dashboard and Field Coffee project opened.
2. Owner created Launch headline request; real client portal response saved with `received` status.
3. Client feedback saved on homepage version 1; decision `needs_changes` recorded and one revision round shown.
4. Owner published version 2 with an uploaded private text handover file; client approval saved for that latest version.
5. Client requested illustrations; owner quoted exactly 12,550 USD cents; client accepted the quote. No payment was processed.
6. Owner proposed October 28, 2026; client accepted; project due date persisted as `2026-10-28`.
7. Handover showed approved version 2. The private file returned HTTP 200 with the expected fixture content. Actual export JSON contained one delivery, version 2.

The extra illustration quote describes agreed future work. The approved homepage is the demonstrated handover. The video demonstrates coordination and actual state changes; it does not claim a café website or artwork was designed during capture.

## Cleanup and privacy

Account creation, login, sample loading, and bearer link preparation happened before recording. No login, password, private invitation URL, external email send, or existing user workspace was filmed or modified. Fixtures use fictional sample data and an `example.test` account. The ignored local environment file was loaded without printing its contents.

Three fixture attempts were made. Two recorder-only checks were corrected before the final capture (an ambiguous deadline locator, then a relative private download URL). Every attempt ran fixture cleanup. Final cleanup evidence confirms the temporary owner is unavailable, zero owner workspaces remain, and the exact uploaded storage object was removed and its download subsequently failed. Cleanup paths came only from that owner's fixture workspace file registry. Partial recordings were removed; only the completed walkthrough is delivered.

## Focused verification

- `node scripts/test-product-tour-server.mjs` — PASS: HTML MIME, WebM MIME, HTTP 206 with exact 100-byte range body, HTTP 416 invalid range, HTTP 403 encoded parent traversal, HTTP 405 unsupported method.
- `node scripts/verify-product-tour.mjs` — PASS: native video playback advanced, finite duration 114.84 seconds, all six chapter jumps within two seconds of measured targets, complete transcript loaded, 1440 × 900 decoded frames extracted.
- Mobile verification at 375 × 812 — PASS: document width 375, body width 375, zero overflowing elements, content text at least 15px, final chapter jump works.
- `npx eslint scripts/record-product-tour.mjs scripts/serve-product-tour.mjs scripts/test-product-tour-server.mjs scripts/verify-product-tour.mjs` — exit 0.
- Helper syntax checked with `node --check`; new authored helper/guide files formatted with Prettier.
- Visually inspected decoded intro, input, feedback, revision, scope and handover frames plus desktop/mobile guide screenshots. Captions are legible at native size; guide copy directs small-screen viewers to full screen and provides readable parallel explanations/transcript.

The local static server runs independently of the app and Supabase and binds to loopback. No full application suites or build were rerun for these artifact-only changes. Later product fixes can proceed without affecting playback. Regeneration should be verified again if the application's controls or terminology change.
