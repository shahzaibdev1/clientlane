# Task 2 independent review

## Spec compliance

**Issues found.** The diff implements the requested Next/Supabase backend, scoped membership and portal APIs, private file proxy, and real SMTP queue. Two Important defects prevent approval: reminder advancement is not recoverable across every post-send crash, and the upload policy accepts HTML disguised as an allowed text upload. References and fixes follow below.

**Cannot verify from this task diff:**

- Production signup/login/recovery UI, callback cookie behavior in the running Next app, password reset flow, and browser integration with these action contracts remain cross-task checks. The task adds callback/proxy/helpers (`src/app/auth/callback/route.ts:11`, `src/proxy.ts:23`, `src/lib/supabase/server.ts:6`), but its integration suite calls backend services directly. Root should complete the planned real browser auth and protected-route checks.
- External provider/redirect/SMTP settings and deployed scheduling are expressly outside the authorized task. The local worker, hosted prerequisite documentation, and final build belong to root/Task 4 (`src/app/api/jobs/route.ts:5`; implementation report's persistence/jobs section).
- Task 2's report expressly records three root-owned worker tests still failing during Task 4's RED phase. Root subsequently reports the four worker tests and full 71-case unit run are GREEN; that later run is outside this diff review and was not repeated. The backend report's historical failures therefore do not add a Task 2 blocker.

## Strengths

- Browser inputs never supply a trusted actor: actions obtain the authenticated user, and portal mutation constructs the client actor from the current grant (`src/lib/backend/actions.ts:25`, `src/lib/backend/service.ts:254`). Strict command parsing and file registry checks reject forged state/file references (`src/lib/backend/service.ts:137`, `src/lib/backend/service.ts:230`).
- Database save locks the workspace before current membership/grant and expected-version checks; revocation and rotation share that lock. Direct anon/authenticated table/RPC privileges are revoked (`supabase/migrations/202610100001_backend.sql:13`, `:18`, `:39`, `:48`; `supabase/migrations/202610100003_rotation.sql:5`). These are substantive enforcement mechanisms, not UI-only restrictions.
- File downloads return attachment bytes through a private proxy, recheck current access, and require public projection membership for portal downloads (`src/lib/backend/files.ts:122`, `:137`, `:145`; `src/app/api/files/route.ts:45`). Upload bodies are bounded even without Content-Length (`src/lib/backend/files.ts:7`).
- Tokens are random 256-bit values, hashed for lookup and authenticated-encrypted for recoverable email links; queue payloads hold identifiers (`src/lib/backend/crypto.ts:17`, `:23`; `src/lib/backend/mail.ts:93`).
- Tests exercise real local Auth, RPC, Storage, and SMTP/Mailpit behavior, including revoked access, concurrent version saves, private downloads, signature mismatch, and delivered token content (`tests/integration/backend.test.ts:69`, `:187`, `:294`, `:579`).

## Issues

### Critical

None identified in the reviewed task diff.

### Important

1. **A crash after recording a successful reminder send permanently stalls that reminder.** `src/lib/backend/mail.ts:331` writes `status: 'sent'` with `error: null`, then calls `advance` separately at `:342`. Repairs at `:284`–`:285` select only sent records with a non-null error. If the process exits between those two durable operations, the reminder retains its old nextDueDate, has no repair marker, and scheduling at `:153` recreates the same already-sent dedupe key. It will never send or advance again. This differs from the documented SMTP-before-recording ambiguity: the send is already durably recorded, so advancement can and should be recoverable without another email. Persist a schedule-pending marker atomically with sent status and clear it only after advancement, or make the sent transition and conditional schedule advancement one database transaction. Include the request schedule/generation in the payload so a repair cannot advance a newly edited schedule. Add a focused test with a sent row, unchanged nextDueDate, and no manually injected error; the current repair test (`tests/integration/backend.test.ts:637`) injects an error and therefore misses this crash window.

2. **The text upload checks allow executable HTML documents.** `src/lib/backend/files.ts:52` rejects HTML/SVG/script markers only at the beginning after whitespace, and the extension denylist at `:88` omits `.xhtml`. For example, `page.xhtml`, declared `text/plain`, containing `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></html>` passes both checks; an HTML comment before `<html>` also bypasses the content check. `fileRefSchema` allows text/plain and the unchanged filename validator does not reject `.xhtml`. The proxy's attachment/plain-text headers reduce execution in the download response, but do not meet the explicit “never HTML/SVG/executable” upload requirement; a saved XHTML file can be opened as an active browser document. Validate supported filename extensions against the allowed MIME type, reject XHTML and other active document extensions, and make the HTML/XML rejection handle declarations/comments rather than relying solely on the first marker. Add focused cases for XHTML with an XML declaration and HTML with a leading comment.

### Minor

1. **Integration fixtures leave private storage objects behind.** `tests/integration/backend.test.ts:34` deletes Auth accounts; workspace cascades delete file registry metadata (`supabase/migrations/202610100001_backend.sql:5`) but do not delete objects uploaded to Storage at `tests/integration/backend.test.ts:188`. Repeated runs accumulate unreferenced bytes. Track fixture paths and remove those objects in teardown before deleting accounts; preserve unrelated data.

## Assessment

**Task quality: Needs fixes.** Tenant/grant enforcement and real integration coverage are strong, but the recoverability and upload-policy defects affect explicit task requirements. Fix both Important issues and add narrowly targeted regression coverage before advancing this gate.

## Review evidence and scope

- Read the supplied brief, report, full diff in sequential chunks, product design, Task 2 plan section, task reviewer template, and requesting-code-review guidance. No git operations, existing tests, builds, database operations, or external emails were run. Only this requested review artifact was written.
- Named focused cross-task risk: shared domain projection/authorization/eligibility could weaken backend scope checks. Inspected `src/lib/domain/selectors.ts` (portal/member projections and reminder/digest eligibility), the authorization preamble and relevant project/reminder cases in `src/lib/domain/commands.ts`, and file schema definitions in `src/lib/domain/schema.ts`. This confirmed narrow client commands, assigned-project member restrictions, received/archive/completed suppression, and that the upload example in Important issue 2 passes the shared schema.
- Named focused cross-task risk: callback `next` could allow an external redirect. Inspected `src/lib/auth/redirect.ts:1`; its origin/path restrictions and encoded-control/backslash checks support the callback's internal redirect contract. Actual browser cookie exchange remains a cross-task verification item above.
- Line references were mapped from the supplied diff; changed source files were not separately reread. No subagents were dispatched.
- Declined to judge: public UI/SEO/noindex, browser accessibility, and final worker integration are assigned to later tasks. No payments or external deployment appeared in the reviewed diff.
