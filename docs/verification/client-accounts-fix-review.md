# Optional client accounts: scoped round-one fix review

Reviewed 11 October 2026. Repair source base: `42731d73bc492f0c2cce408aa44cf751ef074297`; frozen repair head: `b200a923644152a42094465e70518d664a067c17`; package: `.superpowers/sdd/client-accounts/fix1.diff`. Checkout HEAD during inspection: `1208a8a3c490ed974583adcb93ac8894718877a5`; its difference from the repair head is only the implementation report's source-SHA entry. Product source matches the frozen repair.

This is a covering re-review of I1/I2/M1/M2 in `client-accounts-review.md` and new Critical/Important breakage introduced by the fix diff. Binding requirements are `docs/superpowers/specs/2026-10-11-client-accounts-design.md` and `docs/superpowers/plans/2026-10-11-client-accounts.md`. The implementation report's appended repair section was read. This does not repeat the original feature review or whole-product audit.

**Spec compliance for the reviewed repairs: PASS. Code quality for the reviewed repairs: PASS.** All four prior findings are **ADDRESSED**. No new Critical or Important finding was identified. The coordinator's final production browser and affected integration gates remain separate release requirements.

## Prior finding verdicts

### I1 — ADDRESSED: retain submitted file metadata after account deletion

- `supabase/migrations/202610110003_client_account_review.sql:2`–`:4` replaces the optional access FK with `ON DELETE SET NULL`. The pre-existing uploader FK also uses SET NULL (`supabase/migrations/202610100001_backend.sql:5`). The access/Auth cascade can therefore remove the relationship without deleting retained registry rows; provider workspace deletion still retains its existing cascade semantics.
- Client/bearer downloads still require an actual public project reference (`src/lib/backend/files.ts:174`–`:180`), rather than access to every retained registry row. No email-based upload adoption was added. Account submission still requires both the current access ID and uploader UUID (`src/lib/backend/client-accounts.ts:132`–`:147`); registry metadata/project checks remain in `src/lib/backend/service.ts:147`–`:169`. A replacement Auth UUID cannot match the null IDs on old unattached uploads, even after a deliberate new invitation.
- The real regression at `tests/integration/client-accounts-review.test.ts:84` covers Auth deletion, submitted provider/bearer byte downloads, denied unattached bearer download, null uploader/access IDs, same-email replacement without automatic access, fresh explicit acceptance and denied adoption of the old unattached upload.

### I2 — ADDRESSED: one authorized snapshot for project, recipient and file reads

- `read_client_project` is one SQL statement declared `STABLE` (`supabase/migrations/202610110003_client_account_review.sql:8`–`:18`). Capability, Auth confirmation/current email, workspace project/client identity and client email are checked in the same statement that returns the workspace row and access ID. Its snapshot cannot combine earlier eligibility with a workspace edit committed after invalidation.
- `src/lib/backend/client-accounts.ts:69`–`:82` now consumes that returned row, parses the existing workspace schema and retains the access ID. It does not fetch a later workspace. The browser/action view still receives only `portalProject` and the existing public settings (`:84`–`:90`); the full workspace row remains server-side.
- Recipient preview is likewise one STABLE SQL statement (`supabase/migrations/202610110003_client_account_review.sql:23`–`:44`). It checks confirmed recipient email, lifecycle/expiry, current client relationship or originating brief sender eligibility, and accepted recipient/capability where applicable. It returns only the invitation fields. `src/lib/backend/client-accounts.ts:255`–`:264` uses that result directly, without the old recipient-summary workspace read. The prior identity call is an additional precheck; SQL still independently establishes current eligibility in its own data snapshot.
- `src/lib/backend/files.ts:109`–`:114` obtains the same atomic access row, and `:174`–`:180` checks public file references from that row. The independent registry lookup and later storage download cannot introduce a new project reference into the earlier authorized projection. The existing locked capability rechecks for saves and file registration remain unchanged (`supabase/migrations/202610110002_client_accounts.sql:140`–`:149`, `:165`–`:168`).
- Both new functions explicitly revoke public/anonymous/authenticated execution and grant only service-role execution (`supabase/migrations/202610110003_client_account_review.sql:46`–`:47`). The direct authenticated denial assertion is at `tests/integration/client-accounts.test.ts:459`–`:466`.
- Covering tests preserve an actual Postgres response, commit actual later invalidation/edits, then release the earlier response (`tests/integration/client-accounts-review.test.ts:169`–`:195`). Project revoke/email-change cases start at `:197`; pending/accepted recipient cases at `:231`; actual file-download exclusion of a later reference at `:258`. Earlier authorized data is an allowed result; newly confidential later data is not.

### M1 — ADDRESSED: queued brief sender eligibility

- `src/lib/backend/mail.ts:216`–`:225` checks the originating Auth user for provider-directed briefs after the existing pending/lifecycle lookup. Missing, unconfirmed or email-changed senders yield no content. Existing queue handling cancels such jobs (`:379`–`:388`) and keeps the normal valid send path.
- `tests/integration/client-accounts-review.test.ts:285` covers valid local SMTP delivery and cancellation after both sender email and confirmation changes. The fixture correction for confirmation state is explicitly disclosed in the implementation report; it is not counted as product RED evidence.

### M2 — ADDRESSED: signup entry preserves invitation return destination

- `src/components/workspace/auth.tsx:33`–`:41` validates the destination through `safeNext`, recognizes invitation paths in both route families and preserves the encoded invitation destination for both entry choices. Generic entry retains its prior `/app` or `/client` default. Neutral invitation wording is at `:69`–`:88`.
- `src/app/signup/page.tsx:11`–`:15` accepts only `studio` or `client` as wording choices. The signup request contains email, password and callback destination, with no role/entry authorization metadata (`src/components/workspace/auth.tsx:120`–`:128`). Both confirmed-session navigation and callback retain `safeNext(next)`.
- `tests/e2e/client-accounts.spec.ts:71`–`:144` creates actual accounts in both invitation directions and checks the selected wording, request callback/next, returned invitation/accept control and absent role/entry metadata. Local auto-confirmation does not establish hosted confirmation-email delivery.

## New breakage and quality assessment

No new Critical or Important breakage found in the repair source, surrounding access/file/write integration or affected regression code. The additive migration preserves the original lifecycle/write functions and narrows read eligibility without adding browser credentials or authorization based on signup wording. README and validation changes identify both required migrations and distinguish repair evidence from the pending final gate.

The new SQL checks and the service consumers implement the consistency requirement coherently: an in-flight read may finish with the earlier authorized snapshot, while subsequent reads must satisfy current eligibility. The migration's service-only permissions are necessary because the project RPC returns a full server-side workspace row; inspected account action results continue to apply the existing public projection.

## Evidence and limits

- Independently inspected the frozen diff, current source, prior findings, approved spec/plan, repair report, relevant old acceptance/pruning/save/upload guards, file metadata/projection/download path and new regression assertions. `git diff --check 42731d7 b200a92` exited 0. Source equivalence to the frozen repair was checked with `git diff --name-only b200a92 HEAD`.
- The implementation report records 7 focused real regressions, 47 affected integration tests, 108 unit tests, scoped lint/typecheck/build and two production signup browser regressions passing, with disclosed real RED evidence. Those are reported implementer results, not independently rerun tests by this reviewer. The coordinator is running the final exclusive full production browser gate and owns subsequent affected integration verification.
- No broad test, browser, build, server operation, DB mutation, external mail, source/index/HEAD change, subagent dispatch or worktree creation was performed. Only this report was written. A coordinator browser capture modified a tracked screenshot during inspection; it was left untouched and does not change the frozen source comparison.
- Unchanged/out-of-scope observations remain nonblocking here: hosted Auth email delivery, deployed HTTPS/cookies/domain configuration, external SMTP deliverability, other browser engines, storage purge timing, at-least-once SMTP semantics, deployment/payments/marketplace and the historical whole-product audit. This re-review does not certify those areas or repeat their earlier dispositions.

**Assessment: approve the bounded I1/I2/M1/M2 repairs. No further source repair is requested by this scoped review. Complete the coordinator's final verification and handoff before claiming the overall feature/release complete.**
