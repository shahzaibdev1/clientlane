# Clientlane

A client delivery workspace for independent freelancers and small agencies, built with Next.js and Supabase. Working product name; brand/domain clearance is still required before public launch.

## Local development

Requirements: Node22+, Docker Desktop using Linux containers. Run `npm ci`, `npm run setup:local`, then `npm run dev`. Open http://127.0.0.1:3001. Demo /demo is separate from real accounts. Local test email inbox: http://127.0.0.1:55324. PricePilot on port3000 is unaffected.

The setup creates an isolated Supabase project on API55321/database55322. Development email confirmation is disabled locally; hosted confirmation must be enabled. Local secrets are written to ignored .env.local, never committed. Do not share this file. Service-role access is only for server-controlled operations after authorization, never for browser use.

Repeated local setup preserves the existing jobs/encryption key. It refuses to overwrite a hosted or malformed environment file, and refuses to silently replace an invalid existing key. Manually configured keys that require dotenv escaping or expansion are left intact with an error; keep the environment file rather than changing a live encryption key.

Run `npm run worker` in a second terminal for local automatic reminders and weekly updates. It checks the authenticated notification queue every 60 seconds while the app is running; local messages go to the test inbox. `node scripts/notification-worker.mjs --once` performs one check. Hosted deployment should use a durable scheduler instead of relying on a workstation process.

## Public launch prerequisites

1. Create a hosted Supabase project and apply the SQL migrations; configure private Storage. Set deployment environment from .env.example. NEXT_PUBLIC_APP_URL must be the exact HTTPS public origin; register its auth callback URL.
2. Configure Supabase authentication SMTP, enable email confirmation, rate limits, and bot protection. Configure application SMTP separately for invitations and reminders. Use a verified sender domain with SPF/DKIM/DMARC and a real support contact.
3. Configure a strong server-only JOBS_SECRET and authenticated scheduler for the jobs endpoint. Preserve the encryption secret; rotation requires replacing existing portal links. Application reminder jobs are not active in a publicly hosted environment until its scheduler is configured.
4. Publish accurate operator/privacy/retention/terms information and support details appropriate to your business before collecting real client data. The repository does not invent legal compliance promises or company information.
5. Verify account confirmation/recovery, two separate user accounts, file access, invitation expiry/revocation, and production SMTP delivery on the actual deployment. Configure backups and monitoring.
6. Choose and integrate your payment provider later. There is no checkout, subscription enforcement, card collection, or payment processing in this release.

No public deployment, search ranking, marketplace partnership, or measured customer outcomes are implied. Project links to external tools are references, not live synchronization. Keep marketplace payments and communication within the applicable marketplace requirements.

Client project links are bearer credentials: anyone who possesses an active link can act within that project. Approval records identify the named recipient associated with the link; they are not identity verification or digital signatures. Revoke a link when access should end. Internal notes stay separate from portal content.

## Optional client accounts

Clients can choose the client entry on `/signup` or sign in at `/login?next=/client`. Client accounts are free and list accepted projects across existing freelancers and agencies. A studio owner opens a project and selects **Invite client account** to create a seven-day invitation for that project's current client email. Preview/copy works without SMTP; **Send invitation email** uses the existing configured queue. The recipient must sign in with the confirmed invited email and accept before account access exists.

A client can select **Invite your provider** on `/client`, enter their existing provider's email and a project brief, then copy or send the invitation. The provider reviews and accepts using that confirmed email. Acceptance creates the project and client together in their owner workspace and links the originating client's account; repeated acceptance does not create duplicates. Pending briefs grant no studio access. Recipients may decline and senders may revoke pending invitations.

Accepted clients can respond/upload, leave version feedback, approve or request revisions, request extra work, accept quotes/deadlines and open/export handover using the same client-only project view as a private link. Internal notes and studio/team controls stay private. One account can use both **My client projects** and **Studio workspace**; navigation never grants permissions. Owners revoke account access independently from private links. Revocation blocks all earlier account invitations for that project, while a fresh owner invitation can restore access deliberately. Project deletion/replacement and changing the client email invalidate existing relationships instead of transferring them to someone else.

The additive `202610110002_client_accounts.sql` migration is required. Existing installations must apply only unapplied migrations; preserve existing data and environment secrets. Account routes are private/no-store/noindex and suppress referrers. Confirmed email ownership does not imply verified real-world identity or a digital signature. There is no marketplace, billing setup or payment processing.

## Verification

`npm test` runs domain/unit tests. `npm run test:integration` requires local Supabase. `npm run lint`, `npm run typecheck`, and `npm run build` cover static and production compilation. `npm run test:e2e` checks Chromium workflows. Use `PLAYWRIGHT_SERVER=production` for the production browser suite after building. See docs/VALIDATION.md for the actual final evidence and limits.

SMTP cannot provide exactly-once delivery: the queue prevents normal duplicate jobs and retries failures, but a connection failure after a server accepted mail can produce a duplicate. Eligibility is checked immediately before sending; mail already handed to the SMTP server cannot be recalled.
