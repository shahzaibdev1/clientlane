# Clientlane product tour

This standalone guide explains Clientlane for freelancers, small studios, and their clients. It contains a silent, captioned WebM recorded from the actual local application using a temporary studio and a real bearer client portal. No sign-up is required to watch. Login, passwords, private portal URLs, and account setup are outside the recording.

From the repository root:

```powershell
node scripts/serve-product-tour.mjs
```

Open http://127.0.0.1:3012. The server only reads this artifact folder, binds to loopback, sets video MIME types, and supports byte ranges for seeking. The app and Supabase can be stopped after recording; the guide remains playable. Current Chromium, Edge, and Firefox support the WebM file. Native video controls include full screen. The captions are burned into the video; there is intentionally no audio track.

To regenerate against the local app on port 3001 and the configured local Supabase:

```powershell
node scripts/record-product-tour.mjs
node scripts/test-product-tour-server.mjs
node scripts/verify-product-tour.mjs
```

The recording helper loads the ignored `.env.local` without printing it, refuses nonlocal fixtures, creates a confirmed temporary account, loads the built-in sample projects, and creates a private client portal before starting video capture. It drives actual controls, checks persisted decisions, checks the private file and handover export, and removes the exact fixture storage files, owner, and cascading workspace records in `finally`. It does not send invitations or external email. No product code or dependency changes are needed.

Outputs: `clientlane-tour.webm`, `chapters.json`, `captions.vtt`, `transcript.md`, `handover.png`, and `recording-evidence.json`. Verification adds `guide-desktop.png`, `guide-mobile.png`, `video-frame-*.png`, and `playback-evidence.json`. Chapters and transcript use timings measured during each recording. The quoted $125.50 represents accepted scope; no payment is processed. The extra illustrations are agreed future work, while the approved homepage is the demonstrated handover.

The fixtures are fictional. The recording shows application behavior, not a claim that a production café website or illustration set was designed during capture.

The guide now also explains optional free client accounts and both invitation directions. The recorded video continues to demonstrate the valid anonymous private-link workflow; it does not claim to record the newer account screens. Account invitations require confirmed invited-email acceptance, while client account and bearer-link access can be revoked separately. The local account links require the app on port 3001; guide playback remains independent on port 3012.
