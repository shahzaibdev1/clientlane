# Optional client accounts and two-way invitations

Implemented locally on 11 October 2026 against the approved client-account design. Source base for independent review: `41b133d`; root separately committed the approved plan/spec as `d5a7c83`. No hosted publishing, payments, external mail, database reset, environment rewrite or credential rotation occurred.

## Behavior and boundaries

- `/client` lists only accepted relationships across studios with provider name, project status/date and next-action count. Pending briefs grant no access. Client signup/login entry selects a safe return destination, never an authorization role in identity metadata. Existing default signup still opens `/app`; one identity can switch explicitly between studio and client views.
- Owners invite the existing project's current client email. Preview/copy needs no SMTP; sending is an explicit separate action using the existing durable mail queue. Invitations expire after seven days and require the confirmed invited email to accept. Recipient previews are authenticated and check email before returning the title/brief. Recipients can decline; senders can revoke pending invitations.
- Clients can invite an existing provider with a validated name/title/brief/target date. The provider accepts into their own studio even if they also belong to another studio. The project/client creation, originating-client capability, and acceptance record are committed together. Concurrent/repeated acceptance returns the original project without duplication. Creating a provider's empty owner workspace, if absent, uses the existing backend before the acceptance transaction; no brief project/client/capability is created outside that transaction.
- Authenticated clients reuse `portalProject`, `ProjectBoard`, domain client commands, native form dialogs, private `Files`, and `Mail`. Request text/uploads, version feedback, approval/revision decisions, extra-work requests, quote/deadline responses and handover/export retain the existing behavior. Projection excludes client/assignee IDs, internal notes/events and studio/team controls. Account uploads are bound to current capability and uploader; unsubmitted objects are excluded from client downloads until referenced in the shared projection.
- `client_project_access` is separate from memberships and bearer grants. Account revocation locks the workspace and revokes all older account invitations for that project, including accepted originating briefs, so replay cannot undo the owner's decision. A fresh owner invitation may deliberately restore access. Bearer revocation leaves account access intact, and account revocation leaves bearer links intact. Project deletion/sample replacement and client-email changes revoke relationships instead of transferring them. Existing permanent project identities prevent reuse. Confirmed Auth email must still match the accepted email at every access check.
- All new account/invitation routes use dynamic SSR, private no-store headers, noindex metadata and no-referrer behavior. Server actions derive the user from verified SSR Auth; the browser never receives service credentials, stored token hashes or ciphertext. Direct authenticated table/RPC access is revoked. Save/registration/accept/revoke paths recheck capability under the workspace lock; lock order is workspace before invitation. Domain permissions and version checks remain authoritative.

## Precise interfaces

`src/lib/backend/client-accounts.ts` exports:

```ts
type ClientBrief = {
  providerEmail: string;
  clientName: string;
  title: string;
  description: string;
  dueDate: string | null;
};
type AcceptedInvitation = {
  workspaceId: string;
  projectId: string;
  direction: 'client' | 'provider';
};
type ClientProjectSummary = {
  workspaceId: string;
  projectId: string;
  studio: string;
  title: string;
  dueDate: string | null;
  archived: boolean;
  status: string;
  nextActions: number;
};
type ClientProjectView = {
  project: PortalProject;
  settings: Pick<Settings, 'brandName' | 'brandColor' | 'logoUrl' | 'currency'>;
  version: number;
};
type AccountInvitation = {
  id: string;
  direction: 'client' | 'provider';
  email: string;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  dueDate: string | null;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'declined' | 'expired';
};
```

`briefSchema` validates calendar dates and bounded nonempty text and normalizes provider email. `ClientAccounts(backend)` provides `listProjects(user)`, `loadProject(user,workspaceId,projectId)`, `mutateProject(user,workspaceId,projectId,{version,command})`, `inviteClient(user,workspaceId,projectId)`, `inviteProvider(user,brief)`, `preview(user,token)`, `accept(user,token)`, `decline(user,token)`, `listInvites(user,workspaceId?,projectId?)`, `revokeInvite(user,id)` and `revokeAccess(user,workspaceId,projectId)`. Both create-invite methods return `{id,token,url,expiresAt}`; accept returns `AcceptedInvitation`. Backend-only helpers derive identity/current access and shape invitation summaries; raw records are not action returns.

`client-account-actions.ts` exports async `loadClientDashboard`, `loadClientProject`, `mutateClientProject`, `inviteClientAccount`, `inviteProviderAccount`, `previewAccountInvite`, `acceptAccountInvite`, `declineAccountInvite`, `revokeAccountInvite`, `revokeClientAccount`, `listProjectAccountInvites` and `sendAccountInvite`. Every action returns the existing `Result<T>` union and obtains user identity server-side. `sendAccountInvite(id)` returns the existing mail status shape after queue execution.

`Files` adds the explicit actor option `clientAccount?: boolean`; upload also receives `workspaceId` and project ID. The route/form context use `clientAccount=true`, and file links preserve it. `Backend.validateCommand` adds an optional server-only capability ID for registered account uploads. Existing team/bearer validation stays in place. `Mail.sendAccountInvite(user,id)` checks sender and current pending eligibility and reuses `queue/run/status`; `Queue.workspace_id` may be null only for a brief without a studio, and its content branch executes before workspace loading. Existing reminder/digest/member jobs still require a workspace.

Focused UI exports are `ClientDashboard`, `AccountInvite`, `ProjectAccountControls`, `AccountHeader` and `ClientUnavailable`. The existing `Portal` accepts optional `{workspaceId,projectId}` account context with a `ClientProjectView` while retaining bearer-token usage. Workspace integration adds only the owner account pane and a client-view link; demo behavior is unchanged.

## RED evidence

All commands ran in `C:/Users/hp/Documents/gitprojects/clientlane`, PowerShell `login:false`, using the preserved local environment.

```powershell
npm run test:integration -- tests/integration/client-accounts.test.ts
```

Corrected initial RED: **6 failed**, exit 1, each asserting that the new `ClientAccounts` service did not exist. The test bodies specified real authorization/lifecycle/flow behavior before implementing the service. The preliminary harness had an illegal await in a default parameter; it was corrected before counting RED. The first implementation run passed four and exposed two incorrect fixture command names (`note.create` / `request.respond` instead of existing `note.add` / `request.submit`); these were harness corrections, not product defects.

```powershell
npm run test:integration -- tests/integration/client-accounts.test.ts -t 'invitation mail'
npm run test:integration -- tests/integration/client-accounts.test.ts -t 'client feedback'
npm test -- tests/unit/client-accounts.test.ts
```

Additional RED: missing `Mail.sendAccountInvite` (**1 failed**); a real `needs_changes` client decision failed with **Client scope denied** because the new SQL whitelist omitted the existing domain's legitimate project-status transition (**1 failed**); safe auth return rejected `/client` (**1 failed, 1 passed**). The brief-schema assertion already passed and is recorded as coverage rather than independent RED evidence. The status whitelist was corrected without loosening domain command authority.

Final self-review RED: `npm run test:integration -- tests/integration/client-accounts.test.ts -t 'recipient previews'` produced **1 failed, 11 skipped**, exit 1. After account revocation and a provider description edit, recipient `preview()` resolved with the new confidential description instead of rejecting. Preview now rejects revoked/declined/expired invitations before shaping current project details. The mobile expired-invitation assertion expects the unavailable screen. This covering privacy regression is part of the final 40-test integration run below.

```powershell
$env:PLAYWRIGHT_SERVER='production'
npx playwright test tests/e2e/client-accounts.spec.ts
npx playwright test tests/e2e/client-accounts.spec.ts --grep 'provider invites'
```

Original-build browser RED: client sign-in returned `/app` rather than `/client`. After loading the unchanged `.env.local` into the test process (the first provider fixture lacked JOBS_SECRET), the provider flow failed waiting for the absent **Invite client account** control. No new build ran concurrently with those browser tests.

## Additive migration

```powershell
Get-Content supabase/migrations/202610110002_client_accounts.sql -Raw |
  docker exec -i supabase_db_clientlane psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction
```

Exit 0: only the new migration's tables, indexes, column/nullability changes, capability/accept/save/revoke/registration functions and triggers, privileges and PostgREST notification were applied. Existing manual migration bookkeeping was not changed. The subsequent `needs_changes` RED correction replaced only the new `save_client_project` function with the corrected definition extracted from that same migration, again with ON_ERROR_STOP and a single transaction; the committed migration contains the final definition for fresh installations. Historical SQL, existing data and environment files were untouched.

## GREEN evidence

```powershell
npm run verify
npm run test:integration
$env:PLAYWRIGHT_SERVER='production'
npx playwright test tests/e2e/client-accounts.spec.ts
```

Verified outputs: full **lint/typecheck**, **108 unit tests in 9 files**, successful **Next16.4 production build**, and **3 new production Chromium tests** (39.3 seconds), all exit 0. The final preview privacy correction then passed fresh **40 real integration tests in 3 files**, scoped lint/format and typecheck. The earlier full build and three browser tests preceded that final correction; the coordinator owns the rebuild/full production browser gate for the frozen source. The production browser flow includes provider invite/confirmed client acceptance, real client upload/download bytes, approval, handover, account revoke with independent live bearer link; client brief/provider acceptance into an owner studio and both views/dual-role navigation; mobile client signup, empty/error/wrong-email/expired screens, private route headers/meta, accessible native dialog and focus restoration. Axe found zero WCAG A/AA violations at the tested checkpoints; mobile document width did not exceed viewport width. The backend additionally covers multi-provider isolation, unconfirmed email, rejected studio mutations, internal-data projection, file ownership/unsubmitted-file exclusion, decline/revoke/expiry, email-change nontransfer, deleted/sample-replaced identities, simultaneous acceptance, acceptance-versus-revocation race, stale-version rollback, revoked-save recheck, direct authenticated table/RPC denial, revoked/declined/expired preview privacy, feedback/revisions and exact quote/deadline transitions. Local SMTP records a real sent job; queued expired/revoked/declined briefs become cancelled.

An earlier broad integration attempt ran overlapping fixture processes: **33 passed, 2 existing mail scheduling tests failed** because another fixture deleted a workspace between the global schedule listing and row read. Investigation established test isolation as the cause. `vitest.integration.config.ts` now serializes files with `fileParallelism:false`, and browser and real integration runs were then separated; the final complete integration command passed all 40. No production scheduling workaround was introduced.

The first new browser GREEN attempt had **2 passed, 1 failed**: a title-only heading assertion collided with the accepted-project card and sent-invitation heading during navigation. The fixture now waits for the destination URL and asserts the project h1; final full new browser file passed all three without retries. A lint pass initially caught a missing `cause` on the focused UI error wrapper; it was corrected before the final verify/build. Existing launcher NO_COLOR/FORCE_COLOR warning appeared; it is a terminal warning, and no product server errors were observed.

Scoped Prettier check and `git diff --check` passed. `node scripts/test-product-tour-server.mjs` passed HTML/WebM MIME/ranges/path/method checks. A read-only Chromium check of the updated guide on port3012 found the new account explanation and exact **375px document/375px viewport** width. The existing video remains the valid anonymous-link workflow; its recording was not altered or described as account footage. README and guide explain both account flows, confirmed acceptance and independent access revocation honestly.

## Screenshots and handoff

Inspected actual production captures:

- `client-account-dashboard-mobile.png`: accepted project and next actions.
- `client-account-project-mobile.png`: client-only approved handover; fresh capture focuses Handover rather than the previous axe skip-link focus artifact.
- `client-account-brief-desktop.png`: preview/copy/send and pending brief.
- `client-account-brief-mobile.png`: readable native brief form.
- `client-account-guide-mobile.png`: updated local walkthrough explanation.

All account/invite IDs shown in screenshots belonged to temporary fixtures and were deleted afterward. Test teardown tracks uploaded storage paths and queue IDs, removes bytes/fixture queue records, then deletes exact Auth users and verifies workspace cascades. Final read-only Auth query for the `account-` fixture prefix returned **0**. No unrelated users, guide server or retained data were changed.

Original production PID20528 was command-verified before stopping. The latest production build is running on port3001 as **PID27088**, exec session **48241**; it precedes the final preview privacy correction and needs the coordinator's rebuild before the frozen-source full browser gate. Port3012's guide server **PID22728** was preserved. The root coordinator owns the final independent review, postreview full production browser gate and eventual recurring worker restart. The local worker remained stopped to isolate mail fixtures.

Implementation and scoped documentation are ready for review; this is not a claim of hosted Auth/HTTPS/SMTP deliverability, external publishing or a completed independent review.

Source/evidence commit: **`7ec79da893347234abf04dfc4b3c25457efff36a`** (`feat: add optional client accounts and two-way invitations`), 35 explicitly staged scoped files. The checkout was clean after committing. Root plan/spec files were already committed by the coordinator and were not restaged. This follow-up documentation entry records the source SHA; any independent-review repairs will receive separate covering evidence.
