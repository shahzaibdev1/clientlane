# Optional client accounts: independent feature and final review

Reviewed 11 October 2026. Source base: `41b133d`; frozen product head: `7ec79da893347234abf04dfc4b3c25457efff36a`. Package: `.superpowers/sdd/client-accounts/task.diff`. Current checkout head at review was `42731d73bc492f0c2cce408aa44cf751ef074297`, which adds only the implementer's source-SHA evidence to the report. This is a complete review of the optional client-account feature delta and its integration, not another empty-tree product audit.

Binding requirements: `docs/superpowers/specs/2026-10-11-client-accounts-design.md` and `docs/superpowers/plans/2026-10-11-client-accounts.md`. Read implementation evidence in `docs/verification/client-accounts-report.md` and the prior product capability review/repair records to distinguish existing behavior from this delta.

**Spec compliance: FAIL pending the two Important repairs below.** Both invitation directions, optional accounts, client-only command/projection reuse, explicit dual-role navigation, private account routes and additive installation are implemented. File retention after account deletion and confidentiality during concurrent account/invitation invalidation do not yet meet the lifecycle boundaries.

**Code quality: NEEDS FIXES.** No Critical finding. Two consolidated Important findings and two Minor findings follow. Passing reported suites do not cover the identified triggers.

## Strengths

- Relationships are separate from team membership and bearer grants. Browser actions derive the Auth user on the server; direct anonymous/authenticated table and RPC access is revoked. Signup entry choices do not create authorization metadata.
- The acceptance transaction locks the workspace before the invitation, checks confirmed recipient email, rejects revoked/declined/expired invitations, and commits a provider-accepted brief's project, client and capability together. Concurrent/repeated acceptance returns the original project. Owner revocation invalidates older pending and accepted invitation replay; a new invitation can deliberately restore access.
- Save and account upload registration recheck current capability under the workspace lock. The client path reuses the domain's explicit command set and public projection; the new SQL guard preserves workspace data, other projects and protected target-project fields. Client upload submission checks capability, uploader, registry metadata and project scope. Client download checks submitted/public references.
- UI integration is focused: a separate account component/service/actions module, existing client project controls and native dialogs, explicit studio/client links, meaningful unavailable/loading states, and private no-store/no-referrer/noindex routes. Existing anonymous portal and provider flows retain their distinct actor paths.
- Reported verification is substantive: two complete production browser workflows with real Auth, uploads/download bytes, mobile/axe checks, and real backend checks for wrong recipients, unconfirmed identities, isolation, decline/expiry/revocation, stale versions, repeated/concurrent acceptance, project deletion/replacement and command transitions. Root additionally reported a fresh full lint/typecheck/build, 108 unit and 40 real integration tests passing during this review.

## Critical

None found in the inspected feature delta.

## Important — repair before approval

### I1. Deleting a client account deletes submitted file metadata from a surviving provider project

- Reference: `supabase/migrations/202610110002_client_accounts.sql:38` adds `file_registry.client_access_id ... ON DELETE CASCADE`; `:7` cascades capability deletion from `auth.users`. Existing `supabase/migrations/202610100001_backend.sql:5` deliberately uses `uploader_id ... ON DELETE SET NULL`. New uploads set the access FK at `src/lib/backend/files.ts:157`; every download requires the registry row at `:165`–`:176`.
- Trigger: a client accepts a project, uploads and submits a file in a request response, and the provider keeps that project and a valid anonymous bearer link. Delete that client's Auth identity (or hard-delete the corresponding capability). The access row cascades away and then deletes the file registry row. The response's file reference remains in the workspace and its bytes remain in storage, but both provider and valid bearer downloads now fail with `File was not found.` The account relationship's deletion has damaged retained project content and the independent bearer workflow.
- Evidence: the complete FK chain and download prerequisite are explicit in the migrations/service. No database mutation was needed to establish the cascade. The current file tests cover revocation, not deletion; Auth deletion appears only in fixture teardown after bytes are removed.
- Fix: retain project file metadata when an Auth identity or capability is removed, normally by making the optional access FK `ON DELETE SET NULL`. Do not grant a replacement account ownership of old unsubmitted uploads. Preserve the current public-reference requirement for client/bearer downloads and uploader/capability checks for new submissions.
- Covering regression: upload one submitted and one unsubmitted file; delete the client Auth user/capability while preserving the provider workspace/project and bearer grant. Assert provider and valid bearer can still download the submitted bytes, bearer cannot download unsubmitted bytes, and a new Auth user with the old email receives no access or upload ownership automatically. A deliberate fresh invitation should restore only the intended project relationship.

### I2. Separate authorization and workspace reads can disclose newer project details after revocation or client-email replacement

- Reference: `src/lib/backend/client-accounts.ts:68`–`:79` calls `valid_client_access`, accepts its result, then independently loads the workspace and checks only that the project exists. Recipient preview separately reads/checks its invitation at `:252`–`:263`, then `summary()` reads the current workspace at `:224`–`:229`. `src/lib/backend/files.ts:108` and `:174` use the same account access result for public-file authorization.
- Trigger for an accepted account: its access RPC succeeds; before `backend.row()` returns, the owner changes the client email, atomically pruning that account's access, and writes new confidential project details. The subsequent workspace read contains those newer details, but `access()` does not recheck the account/client/email relationship against that state and returns them to the former client. Explicit revoke followed by a project edit has the same pattern. A pending or accepted recipient preview can similarly read the invitation before invalidation, pass the stale flags, and shape new details from the later workspace read. Files reuse that split read and can authorize newly shared references from a later row.
- Evidence: a focused in-memory execution of the actual `ClientAccounts.loadProject` method simulated a successful older capability RPC followed by a newer workspace row. It returned `Confidential detail written after account pruning` even though that row's client email was `replacement@example.test` rather than the previous `asha@example.test`. This check loaded/transpiled the actual modules in memory, wrote no files and touched no Auth/Postgres/Storage data. Static tracing establishes the equivalent invitation-summary interleaving. The existing revoked-preview regression revokes before calling preview, so it does not test this overlap.
- Fix: bind authorization and returned workspace/invitation data to one consistent database snapshot, preferably a service-only read RPC that checks current identity/capability or recipient eligibility and returns the authorized state/projection together. If using a final eligibility recheck, do it after shaping the already-read data and prove that data written after invalidation cannot be returned. Apply the guarantee to recipient preview and account file authorization as well as project loading; retaining the already-correct transactional save checks is necessary.
- Covering regression: deterministically pause an account load/preview between its first eligibility read and workspace read; revoke or change the client email and update the description while paused. Resuming must reject or return only the earlier authorized snapshot, never the new description. Include a newer public file reference and account file download, plus ordinary account/recipient reads and independent bearer behavior.

## Minor — preserve for disposition

### M1. A queued provider brief can still send after its originating identity becomes ineligible

- Reference: `src/lib/backend/mail.ts:203`–`:226` checks only invitation status/expiry for account jobs. For `direction='provider'`, it never checks the sender's current confirmed Auth email against `client_email`. Acceptance expressly rejects that stale identity in `supabase/migrations/202610110002_client_accounts.sql:119`–`:120`.
- Trigger: create and queue a client-to-provider brief, then change the originating client's Auth email or make it unconfirmed before the worker runs. No workspace pruning trigger applies to this pending brief because `workspace_id` is null. `content()` still returns mail containing the brief title and invitation link, although acceptance will fail with `Originating client email is no longer confirmed`.
- Impact: the provider receives an invitation presented as actionable that the backend already knows cannot be accepted. This is limited workflow inconsistency, not an access grant or a demonstrated project-data leak.
- Fix/regression: recheck the originating client's current confirmed email when deciding pending brief mail eligibility and cancel stale jobs. Add a real queued-brief sender-email/confirmation-change regression alongside existing expired/revoked/declined cancellation cases. Preserve normal valid brief sends.

### M2. Signup entry choices discard an existing invitation return path

- Reference: `src/components/workspace/auth.tsx:79`–`:83` hardcodes the two entry links to `/signup?next=/app` and `/signup?next=/client`; the otherwise-correct signup callback preserves `safeNext(next)` at `:108`.
- Trigger: open a provider/client invitation while signed out, follow Create an account, then select the appropriate “I'm a freelancer or agency” or “I'm a client” entry choice. That selection replaces `/client/invite/<token>` with the generic view destination. Signup/confirmation now opens the generic workspace/dashboard, and the invitation must be reopened separately to complete acceptance. The provider invitation path also initially uses client-entry wording because its route begins with `/client`.
- Fix/regression: preserve a validated invitation `next` when switching signup entry wording, keeping the generic `/app` or `/client` destination only when there is no invitation destination. Assert both signup choices retain the actual invitation through signup callback/confirmation without changing authorization metadata.

## Review scope and evidence

- Read the complete spec/plan/report, all new backend/account/UI/SQL code, changed auth/proxy/files/mail/workspace/portal integration, applicable domain projection/commands, previous identity/pruning SQL, and the feature's real unit/integration/browser assertions. Checked the surrounding file registry retention and accepted-brief owner-workspace logic rather than treating the new modules in isolation.
- Accepted implementer and root test/build outputs as reported evidence. Did not rerun broad suites or run database/browser fixtures; root held browser verification until this review and owns the final postrepair gate. Neither server nor worker was started, stopped or changed by this reviewer.
- The only written artifact is this report. No source/index/HEAD/branch/environment changes, database writes, external email, deployment, subagent dispatch or new working tree occurred. The focused successful account-read check executed actual code with synthetic state in memory. A separate attempted synthetic mail check produced no captured output and is not cited as verification; M1 follows directly from the inspected content/acceptance code paths.
- Existing whole-product review findings and their dispositions remain in prior reports. The old large-component maintenance and form-validation wording concerns were not promoted into new feature blockers; this delta follows the approved focused-module approach.

## Declined to judge

- Hosted signup-confirmation delivery, deployed HTTPS/cookie/domain configuration and external SMTP deliverability: outside the authorized local feature work and not established by local SMTP fixtures.
- Deployment, marketplace/discovery, payments, billing limits and public launch readiness: explicitly outside this feature's approved scope.
- Continuous local worker operation at handoff: root owns startup after review/verification; this review inspected queue integration without altering worker state.
- Safari/Firefox behavior: only Chromium verification is reported, so cross-browser readiness is unestablished.
- Immediate physical purge of unattached storage bytes: no immediate-purge promise or deletion endpoint exists. This does not excuse I1's destruction of retained metadata or I2's authorization race.
- Exactly-once delivery across ambiguous SMTP outcomes: the existing queue is documented as at-least-once; this feature does not redefine it.
- Independent completion of the old empty-tree product audit or its interrupted final repair review: outside this frozen feature-delta review; their records are retained, not superseded.

## Assessment

**Ready to approve/hand off as complete: No — repair I1 and I2, record M1/M2 disposition, and obtain a covering re-review.** The core feature is coherent and extensively tested, but deleting an account must not remove retained shared files, and private reads must not combine an obsolete authorization result with newly confidential data. Run the affected real regressions and the coordinator's final production browser gate after the bounded fixes.
