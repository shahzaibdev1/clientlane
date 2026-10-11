# Clientlane product walkthrough

The user wants to understand who the app serves and how someone actually uses it without signing up. Create a short captioned recording and a readable companion guide, using the existing application rather than mock screens. The choice of a silent, captioned video is the builder's call; no speech tool is available.

- [x] Produce a complete example: freelance website designer and café client; owner overview, requests, client response, feedback/revision, approval, extra-work quote, accepted deadline and handover.
- [x] Record actual app controls. Prefer a real temporary local owner and real bearer client portal, prepared before recording so login credentials/private invitation URLs are never filmed. Isolate and clean fixture accounts/files; never alter existing user workspaces or send external mail.
- [x] Make a polished standalone HTML guide with video controls, readable explanation, who/when/why examples, chapter jumps and transcript. Clearly explain that it coordinates client delivery and does not collect payments.
- [x] Generate video/transcript/chapters reproducibly; keep recording tools separate from application code. Serve the guide locally on a separate port with correct video MIME and seeking support.
- [x] Verify playback, chapter navigation, mobile readability/overflow and actual recorded outcomes; inspect sample video frames/screenshots. Preserve existing app verification and final review.

Artifacts live in `docs/product-tour`; recording/serving helpers in `scripts`. Root coordinates a focused artifact review and the already-pending whole-product review. No dependency installation or new external service is necessary.
