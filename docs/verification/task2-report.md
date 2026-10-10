# Task 2 — secure backend handoff

Backend implementation is complete for independent review. Root owns the production build and browser workflow verification; this task did not run a Next build or change public marketing/UI files. Three migrations were applied non-destructively to the running local clientlane database. No database reset, external email, secret output, or deployment was performed.

## Binding UI contracts

Import server actions from `@/lib/backend/actions`. Every action returns `Promise<{ok:true,data:T}|{ok:false,error:string}>`. Always branch on `ok`. `Command`, `WorkspaceState`, `PortalProject`, and file-reference types come from `@/lib/domain`. `WorkspaceView` is exported as a type from `@/lib/backend/service`; use a type-only import. No action accepts an actor, user ID, owner role, or trusted project scope from the browser.

```ts
loadWorkspace(workspaceId?: string)
mutateWorkspace({ workspaceId?: string, version: number, command: Command })
loadSample({ workspaceId?: string, version: number, replace?: boolean })
loadPortal(token: string)
mutatePortal(token: string, { version: number, command: Command })
createPortalLink({ workspaceId: string, projectId: string, expiryDays?: number })
revokePortal({ workspaceId: string, projectId: string })
sendPortalInvite({ workspaceId: string, projectId: string })
inviteMember({ workspaceId: string, email: string, projectIds: string[] })
acceptMemberInvite(token: string)
revokeMember({ workspaceId: string, memberId: string })
revokeMemberInvite({ workspaceId: string, invitationId: string })
listMembers(workspaceId: string)
listEmailQueue(workspaceId: string)
retryEmail({ workspaceId: string, queueId: string })
```

`loadWorkspace`, `mutateWorkspace`, and `loadSample` return:

```ts
{
 state: WorkspaceState,
 version: number,
 role: 'owner' | 'member',
 projectIds: string[],
 userId: string,
 userEmail: string,
 workspaces: { id: string, name: string, role: 'owner' | 'member' }[]
}
```

The default workspace is always the user's own workspace. Every authenticated user has exactly one empty owner workspace (builtin templates only); invited workspaces are selectable through the `workspaces` list. An explicit workspace ID is checked against current access. Member state contains assigned projects and their clients, with no templates. Assignment IDs must identify an active member assigned to that project; null means unassigned/owner-managed. `loadSample` requires `replace:true` when either clients or projects already exist. Version conflicts return an error asking the UI to reload; preserve form values while recovering.

`loadPortal`/`mutatePortal` return `{project: PortalProject, settings:{brandName,brandColor,logoUrl,currency}, version:number, expiresAt:string}`. Portal settings omit notification preferences; project projection excludes internal notes, internal events, assignee/client IDs, and creation metadata. Client actors are constructed from the current grant and actual project client. Portal pages should pass the bearer token only to portal/file calls.

`createPortalLink` returns `{id,token,url,expiresAt}`; expiry defaults to 30 days and accepts 1–90 days. Rotation invalidates all preceding links atomically. Links use `/portal/[token]`. `inviteMember` returns `{invitationId,url,expiresAt,id,status,error,sent_at}`; its URL uses `/app/invite/[token]`. The signed-in invited user must confirm the invited email before `acceptMemberInvite`, which returns `{workspaceId}`. After accepting, load/select that workspace. Invitation expiry is seven days. Invitations and existing memberships have separate revocation actions.

`revokePortal`, `revokeMember`, and `revokeMemberInvite` return `{revoked:true}`. `listMembers` returns `{members,invitations,grants}`. Member rows expose `user_id,email,project_ids,revoked_at`; invitation rows expose `id,email,project_ids,expires_at,revoked_at,accepted_at`; grants expose `id,project_id,email,expires_at,revoked_at`. Hashes and encrypted tokens never appear in this metadata.

`sendPortalInvite` and `retryEmail` return `{id,status,error,sent_at}`. Status is `pending|sending|sent|error|cancelled`; success of the action does not imply `status:'sent'`. `sent` means SMTP accepted the recipient. `listEmailQueue` is owner-only and returns the newest 100 `{id,kind,status,error,sent_at,created_at}` rows with friendly error text. Retry is allowed only for an error row owned by that workspace; it resets the retry budget and actually processes the queue.

Browser authentication helper: `createBrowserSupabase()` from `@/lib/supabase/browser`. Use the real Supabase auth methods for signup/signin/signout/password recovery/password update. Server helper `createServerSupabase()` and `requireUser()` live in `@/lib/supabase/server`, which is server-only. Recovery redirect should use `/auth/callback?next=/reset`. Proxy refreshes authenticated cookies, protects `/app/**`, and sends unauthenticated users to `/login?next=...`. Callback supports PKCE code exchange and supported OTP token hashes. Safe next paths are restricted to `/app` and `/reset`; external origins, protocol-relative paths, backslashes, controls, and encoded CR/LF/backslashes are rejected.

## File API

`POST /api/files`: multipart `file`, `projectId`, plus `workspaceId` for a selected owner/member workspace or `token` for a portal. Response is the same result union with `data: FileRef` on success. Upload first, then attach the returned exact reference using the relevant domain command. Multipart input is bounded even without Content-Length; each actual file remains capped at 20MB. Domain filename/MIME validation is supplemented with signature checks and normalized executable-extension rejection. The private object path is generated by the server.

`GET /api/files?path=...` uses the authenticated session; append `&token=...` for clients. It responds with attachment bytes, never a storage URL. Every request rechecks current owner/member/grant access, registered path/project ownership, and, for clients, the file's presence in the actual public project projection. Client-uploaded file references can only be submitted by their originating current grant. Download failures use `{ok:false,error:string}` and status 403; upload failures use status 400. Files are stored in `clientlane-private`, with public access and authenticated direct listing/download denied. Content is opaque, downloaded as an attachment; signatures are type guards, not a malware scan.

Portal, auth, and file responses use `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff` through the proxy/file route.

## Persistence, access, and jobs

Tables: `workspaces`, `memberships`, `member_invites`, `portal_grants`, `file_registry`, `mail_queue`. RLS is enabled; anon/authenticated direct access is revoked. Service-role credentials are instantiated only in a server-only helper. All domain commands and persisted aggregates are strictly parsed.

`save_workspace` locks the aggregate before checking current owner/member/grant authorization and expected version together. Membership/grant revocation takes the same aggregate lock. Member/project and client/project boundaries are independently checked in the RPC; the service performs narrower domain command validation. Client email changes revoke old portal grants within the save transaction. Portal rotation uses `rotate_portal_grant` and a unique active-grant index. Membership acceptance is an atomic service-only RPC checking current invitation, expiry/revoke, confirmed auth email, and assigned project existence.

Bearer tokens are 256-bit random base64url values. Database lookup uses SHA-256; recoverable reminder links use authenticated AES-256-GCM ciphertext with a key derived from a JOBS_SECRET of at least 32 characters. Queue payloads contain identifiers, never plaintext tokens.

`POST /api/jobs` requires `Authorization: Bearer JOBS_SECRET` and returns `{ok:true,data:{queued,sent,errors,cancelled}}`. `queued` counts eligible schedule candidates, including deduplicated existing records; `sent/errors/cancelled` count this processing run. Unauthorized requests return 401; processing/setup failures return 500. No GET job route. Local notification-worker setup is owned by root's Task 4.

Reminders use nextDueDate and stop for received work, archived/completed projects, disabled reminders, or inactive grants. Unique keys include workspace, request schedule, and grant identity. Weekly digests group one email per client per UTC Monday-based week; notification settings and fresh project/grant eligibility are checked before sending. Queue claiming uses SKIP LOCKED, five-minute leases, per-send lease renewal/attempt validation, exponential retry, and an eight-attempt budget. Successful reminder emails advance dates only after SMTP accepts; failed schedule transactions are repaired from sent records without re-sending. Missing SMTP produces an explicit setup error.

SMTP and Postgres cannot participate in one atomic transaction. A crash after SMTP acceptance but before recording sent can lead to at-least-once delivery. The queue never claims transport success before acceptance. Hosted operation still needs real SMTP, application/redirect URLs, Supabase confirmation/security settings, JOBS_SECRET, and a scheduler/worker. Task 2 did not configure external providers or deploy.

## Exact RED/GREEN evidence

Read TDD and writing-good-tests before test implementation. Tests call the real local Auth, Postgres RPC, private Storage, SMTP and Mailpit APIs. No mocked database/storage/email behavior.

- 23:14 startup: integration configuration failed because Vite rejects mode `local`; changed config to `test`, which still reads `.env.local`. This is setup failure, not behavioral RED.
- 23:15:13 initial scaffold: 5 failed. Behavioral RED: outsider load resolved and two optimistic race mutations both resolved. Other failures were publishable-key naming and dependent missing fixture data; not counted as feature RED.
- 23:18:58 first implementation: 3 passed, 2 failed because note fixture used `text` instead of domain `body`; fixture errors were corrected.
- 23:19:49 redirect RED: expected `/app?project=a`, got `/app`. File/invite/mail behavioral RED: empty private roundtrip; wrong email accepted; SMTP failure count stayed zero.
- 23:21:59: 7/8 integration passed; invitation SQL failed on an ambiguous text/uuid alias. Corrected alias; did not weaken email/expiry checks.
- 23:24:09 tenant-reminder RED: only one of two workspace records existed. Corrected reminder dedupe key to include workspace and grant identity.
- 23:25:03: 13/13 integration passed, including expiry/confirmation, stale revoked authority RPC, email invalidation, digest pause/grouping, and reminder error/advance behavior.
- 23:25:45 rotation/script RED: simultaneous rotations left three active grants; `run.sh` text upload was accepted. Added atomic rotation and executable filename checks.
- 23:27:26: 15/15 integration passed.
- 23:28:43: 18/18 integration passed, including real Mailpit content delivery, authenticated direct-write/private-download denial, received-reminder cancellation, and expired downloads.
- 23:29:44 multipart initial malformed-body assertion was improved to a valid oversized multipart fixture. 23:30:02 behavioral RED: 22MB multipart resolved without a length header. Implemented bounded stream reading. 23:30:27 full unit suite 67/67 passed; integration 18/18 passed at 23:30:31.
- 23:31:21 normalized-filename RED: `run.sh ` was accepted. 23:32:18 sent-schedule-repair RED: nextDueDate stayed `2020-01-01`; implemented repair without re-send. 23:33:34 retry RED: outsider retry resolved; added owner-scoped real exhausted-queue retry.
- 23:34:24: 21/21 integration passed; full unit 67/67 passed. A test-only unused assignment was then removed for lint.
- 23:37:02 sample safety RED: an owner with clients but no projects had their state replaced without confirmation. Require explicit replacement whenever clients or projects exist.
- 23:37:36 final complete integration run: 22/22 passed. Typecheck, backend/auth/API/tests ESLint, and Prettier check exited 0. Last full `npm test` at 23:37:31 had 67 passed and three root-owned worker tests failing while Task4 was in its declared RED phase: `notification worker invokes the authenticated scheduled endpoint without exposing its secret`, `notification worker reports failed delivery processing with a failing exit code`, `notification worker refuses an unencrypted remote destination`. No domain/backend test failed in that run. Root is implementing those tests; this report does not conceal their failures or claim whole-branch final verification.

No production build or product-browser pass is claimed by this task. Root coordinates final build/browser verification and independent review. Local integration fixtures are random example.test accounts and are removed through admin auth cleanup; real account data was not reset.

## Independent review fix round 1

Read systematic-debugging and the complete Task2 review before changes. Addressed both Important findings and the scoped fixture-cleanup Minor finding. No UI, worker, marketing, migration, or external provider files were changed in this round; public action signatures are unchanged.

### Durable reminder advancement

The root cause was the durable sent update clearing error before a separate advance transaction; repairs depended on error, leaving a process-crash gap. Every queued reminder now retains the exact `{enabled,intervalDays,nextDueDate}` schedule snapshot. The SMTP-success database update atomically writes `status:'sent'` and `payload.advancePending:true`. Repairs select that marker independently of error, and clear it only after the matching generation has advanced or is no longer eligible. A changed schedule is left untouched. A crash after advancement but before clearing the marker is also safe: the next repair sees the changed nextDueDate and clears the old marker without advancing again. Failed repairs retain the marker and count as processing errors. Once sent has been durably recorded, an advancement/marker-clear failure cannot turn the row into a retryable SMTP error.

Dedupe keys now include intervalDays alongside nextDueDate, workspace/project/request and grant. This allows an edited interval to create its own eligible generation rather than inheriting an old cancelled/sent key. Queue payload remains JSON and contains no plaintext bearer token; no database schema change is needed.

Compatibility: historical sent rows lacking both the pending marker and original schedule snapshot remain sent. The code does not guess that a current edited schedule belongs to a historical send, and does not blindly advance such rows. The next scheduler can create a current generation using the new interval-bearing key, so an old overdue legacy schedule cannot stay trapped behind its previous sent key. This upgrade can produce one fresh reminder for an old overdue schedule; new records recover recorded sends without re-sending. Old unsent reminders without a schedule snapshot are cancelled on eligibility checking and superseded by a fresh current generation. There were no non-fixture legacy reminder records to migrate in the local task database.

### Active document upload rejection

Filename extensions must now match their supported MIME type (PNG, JPEG, GIF, WebP, PDF, TXT/MD/LOG, CSV, ZIP, DOCX/XLSX/PPTX, MP3/WAV, MP4/WebM). XHTML and all unsupported active extensions are excluded. Normalized executable-extension checks remain. Text/CSV sniffing scans for active HTML/SVG/XML markers beyond the beginning of the buffer, so XML declarations, leading comments, and BOMs cannot hide the document. Invalid UTF-8 fails the content check. Existing MIME-specific binary signatures remain in place. These checks inspect the original buffer without rewriting the uploaded bytes; accepted text roundtrip, CSV, actual PNG signature and mismatched PNG content are covered.

### Fixture cleanup

All integration uploads go through a test utility that records paths returned by the actual upload service. Teardown deletes only those exact generated fixture paths, verifies they can no longer be downloaded, then deletes the fixture Auth users. This also cleans files unexpectedly accepted during RED runs. Unrelated objects and older unrelated data are preserved.

### Exact regression evidence

- **23:51:26**, `npm test -- tests/unit/backend-security.test.ts`: **3 failed / 12 passed**. XML-declaration XHTML, HTML behind a comment, and BOM/comments/SVG were incorrectly accepted as text.
- **23:51:29**, `npm run test:integration`: **3 failed / 21 passed**. A durably sent row with `error:null` did not recover its unchanged due date; a stale generation moved an edited date from `2021-01-01` to `2026-10-17`; XHTML was accepted. Fixture removal also executed and verified object deletion in teardown.
- **23:53:14**, same integration command after the isolated reminder fix: **23 passed / 1 failed**, with only the XHTML upload regression still failing. This separated mail recovery GREEN from the upload fix.
- **23:54:29**, complete `npm test`: **76 passed / 4 files**, exit 0. No root worker or domain failure remained.
- **23:54:37**, complete `npm run test:integration`: **24 passed / 1 file**, exit 0, including actual SMTP/Mailpit delivery and scoped storage teardown.
- Scoped backend/auth/API/test ESLint and Prettier checks: exit 0, all matched files use Prettier style.
- The first full typecheck found one root-owned `tests/e2e/release.spec.ts:23` header-union error, and no backend error. Root corrected and committed that file independently as `e052c1a`; root's final `npm run typecheck` exited 0. This task did not edit or commit that file.

Root remains responsible for the final production build and real browser auth/product workflows. No build was run in this fix round.
