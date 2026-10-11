# Consolidated final-review repair evidence

11 October 2026. Binding requirements: `docs/superpowers/specs/2026-10-10-clientlane-design.md`, `.superpowers/sdd/clientlane/final-fix-brief.md`, and the verbatim findings in `docs/verification/final-review.md`.

Frozen product review base: `68220085328cc61b3aad41d98cd91d5bb076381f`. Implementation parent: `d2cc006` (the intervening commits contain independent walkthrough/review documentation). Source, migration, and regression commit: `fd1c68595b312ee44180370647c39dec94da3ca0` — `fix: enforce project capability lifecycle and final review contracts`. This evidence report follows in a documentation-only commit.

## Changes and disposition

- **C1:** Imports allocate UUID project identities. Real sample loads also allocate fresh UUIDs on every replacement. A permanent database `project_identities` registry rejects reintroduction of any previously used or historically referenced project ID; a surviving identity cannot change its client. A workspace-state trigger prunes deleted memberships, revokes and prunes obsolete invitations, revokes portal grants, and deletes old file-registry metadata inside the same transaction as the state save. Invitation/file registration locks the workspace and checks that its project still exists, serializing registration with deletion/revocation. Physical unattached bytes retain the previously documented storage lifecycle; invalidated metadata cannot authorize them under another project.
- **I1:** Edit-project forms retain an explicit current-assignment option independently of ancillary team options, disable assignment editing while team data is unavailable, and omit `assigneeId` when absent or unchanged. A revoked/missing current assignee is retained without revalidating an unrelated edit as a new assignment. Deliberate unassignment and valid scoped reassignment still use the existing backend membership validation. Team data clears when starting a new workspace's ancillary load.
- **I2:** `change.quote` enforces owner authority in the shared domain transaction used by the server action. Publish quote is offered only to the owner. Tests reject a scoped member's direct backend quote, verify no save occurred, and preserve owner quoting/client acceptance.
- **I3:** Homepage, header, and shared creation CTAs target `/signup`. Tests assert the rendered Create account button and confirmation-password field, and separately retain sign-in behavior for Log in.
- **I4:** Loading samples replaces clients/projects while preserving the existing settings and complete template list, including custom templates. Confirmation now accurately describes preservation and the loss of access to replaced projects. Both customized-empty and populated/replacement cases are covered against the real backend.
- **I5:** Member revocation locks the workspace and revokes unaccepted invitations matching the membership email or current Auth email atomically with membership revocation. A stale invitation is rejected and file access denied; a fresh owner-issued invitation intentionally restores access.
- **M1:** Ready for review applies the same archived/completed eligibility predicate as dashboard actions. The browser checks archived and completed projects separately.
- **M2:** Handover renders milestone progress without its create/edit/complete/delete controls for owners and members. Normal Overview retains milestone editing. The browser asserts meaningful progress text and zero milestone buttons, then verifies normal editing remains available.
- **M3/M4:** Deferred as authorized: component restructuring and friendly normalization of client-side schema errors. No unrelated functionality, payments, hosted provider setup, external mail, publication, or delegation was added.

## Exact scoped files

Source commit changes only:

```text
src/app/page.tsx
src/components/marketing/chrome.tsx
src/components/workspace/forms.tsx
src/components/workspace/project.tsx
src/components/workspace/workspace.tsx
src/lib/backend/service.ts
src/lib/domain/commands.ts
supabase/migrations/202610110001_capability_lifecycle.sql
tests/e2e/final-review.spec.ts
tests/e2e/marketing.spec.ts
tests/integration/final-review.test.ts
tests/unit/final-review.test.ts
```

The documentation commit changes only this report. Root-owned walkthrough artifacts, plans, and existing review documents were not edited.

## RED evidence

All commands ran in `C:/Users/hp/Documents/gitprojects/clientlane` with PowerShell `login:false` and the existing local Supabase environment. Production browser RED used the original running build on port 3001; source changes did not alter that build until browser RED completed.

```powershell
npm test -- tests/unit/final-review.test.ts
```

Corrected RED output: **2 failed, 1 passed**, exit 1. Import/delete/import returned `import-project-1` again; the member quote function did not throw. The dashboard-selector eligibility assertion already passed and provides a consistency baseline; M1's actual metric regression failed in the browser.

```powershell
npm run test:integration -- tests/integration/final-review.test.ts
```

Corrected RED output: **4 failed**, exit 1. Deleted-project membership retained `['import-project-1']`; acceptance of the pre-revocation invitation resolved instead of rejecting; sample settings became Northline/USD instead of the saved Custom Studio/PKR settings; the member pricing command resolved instead of rejecting.

```powershell
$env:PLAYWRIGHT_SERVER='production'
npx playwright test tests/e2e/final-review.spec.ts tests/e2e/marketing.spec.ts --grep 'team loading|member pricing|ready for review|signup CTAs|public site'
npx playwright test tests/e2e/final-review.spec.ts --grep 'team loading|deliberate|member pricing|handover milestone'
npx playwright test tests/e2e/final-review.spec.ts --grep 'failed team|deliberate'
```

Concrete RED observations after correcting harness selectors: delayed and failed team loads persisted a null assignee instead of the existing member ID; the scoped member had one Publish quote button; Handover had seven milestone mutation buttons instead of zero; an archived pending delivery produced `01` instead of `00`; creation CTAs rendered the sign-in form and the marketing test received `/login?mode=signup` instead of `/signup`.

Preliminary harness corrections are retained here rather than counted as product regressions: the first deletion fixture omitted the required `confirm:true`; an action ID from the on-disk manifest differed from the active server's request; the initial quote-button name was wrong; team rows included both invitation and membership rows and needed a specific status assertion; a dropped network request exercised Next's action retry behavior rather than a stable failed team result. The corrected failed-team fixture preserves the real Flight response and replaces only the ancillary result with `{ok:false,error:...}`. It tests the real component and persisted backend state. The delayed fixture holds the actual ancillary request, opens and submits the form, then releases it because installed Next 16.4 dispatches actions sequentially; the snapshot opened before team data arrives remains the regression trigger.

## Migration application

`npx supabase migration list --local` showed local migrations 001–003 with blank recorded remote versions. `npx supabase migration up --local` therefore attempted original migration 001 and safely stopped with `relation "workspaces" already exists`, exit 1, before applying changes. The coordinator authorized applying only the new file without modifying historical migration bookkeeping.

```powershell
Get-Content supabase/migrations/202610110001_capability_lifecycle.sql -Raw | docker exec -i supabase_db_clientlane psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction
```

Exit 0: CREATE TABLE, ALTER TABLE, REVOKE/GRANT, INSERT, CREATE FUNCTION/TRIGGER, DO, and NOTIFY completed successfully. No reset, data replacement, environment rewrite, or credential rotation was performed. New-project/invitation/file lifecycle enforcement was then exercised by the real integration tests. A fresh Supabase startup applies the migration directory; `setup-local.mjs` does not hardcode SQL filenames, so no setup-script change was required.

## GREEN evidence

```powershell
npm test -- tests/unit/final-review.test.ts
npm run test:integration -- tests/integration/final-review.test.ts
npm test -- tests/unit/domain.test.ts tests/unit/domain-boundaries.test.ts tests/unit/backend-security.test.ts tests/unit/final-review.test.ts
npm run test:integration -- tests/integration/backend.test.ts tests/integration/final-review.test.ts
```

Outputs, all exit 0: **3 unit tests passed**, **4 new real integration tests passed**, **74 affected unit tests passed in 4 files**, and **28 real integration tests passed in 2 files**. The new backend coverage includes old/new private file authorization, stale invitation rejection, fresh invitation acceptance, rejected manual project-ID reuse, sample-replacement member/portal invalidation, preserved settings/templates, and unchanged state/version after unauthorized pricing.

After the RED browser process completed, the listener was verified as PID 2632 with the Clientlane Next `start-server.js` command line and stopped. No build ran concurrently with browser work.

```powershell
npm run build
npm run start
$env:PLAYWRIGHT_SERVER='production'
npx playwright test tests/e2e/final-review.spec.ts tests/e2e/marketing.spec.ts tests/e2e/workspace-real.spec.ts
npx playwright test tests/e2e/final-review.spec.ts
```

Build exit 0: Next **16.4.0**, successful compilation and TypeScript, all **20 routes** generated. Start reached Ready on port 3001. First scoped browser run: **14 passed, 1 failed** (2.5 minutes); all five existing marketing and three real-workspace tests passed. The lone failure was the new Handover fixture navigating to its second user's login before the previous Sign out redirect finished (`net::ERR_ABORTED`). The fixture now awaits `/login`, following the existing real-workspace test pattern. Final complete new-regression file: **7 passed** (1.1 minutes), exit 0, including owner/member handover and preserved assignment with explicit disabled/current-value assertions. No retries were enabled or failures suppressed. The Playwright launcher emitted its existing NO_COLOR/FORCE_COLOR warning; the production application server emitted no error output during GREEN.

```powershell
npm run typecheck
npx eslint src/app/page.tsx src/components/marketing/chrome.tsx src/components/workspace/forms.tsx src/components/workspace/workspace.tsx src/components/workspace/project.tsx src/lib/backend/service.ts src/lib/domain/commands.ts tests/unit/final-review.test.ts tests/integration/final-review.test.ts tests/e2e/final-review.spec.ts tests/e2e/marketing.spec.ts
npx prettier --check src/app/page.tsx src/components/marketing/chrome.tsx src/components/workspace/forms.tsx src/components/workspace/workspace.tsx src/components/workspace/project.tsx src/lib/backend/service.ts src/lib/domain/commands.ts tests/unit/final-review.test.ts tests/integration/final-review.test.ts tests/e2e/final-review.spec.ts tests/e2e/marketing.spec.ts
git diff --check
```

All exit 0; Prettier reported all matched files use its code style. A preliminary typecheck caught the new unit helper's inferred owner-only argument type; explicitly annotating its actor argument corrected that test-only typing error before the successful build and final typecheck.

## Cleanup and handoff

New backend fixtures track every uploaded path independently of registry deletion; teardown removes bytes and verifies each download fails before deleting fixture Auth users. New browser/backend teardown checks each fixture-owned workspace is gone. A final read-only Auth inventory printed `{"remainingFinalReviewFixtureAccounts":0}` for this wave's `final-` / `final-ui-` prefixes. The identity registry count was also zero after fixture workspace cascades. Existing browser tests performed their established tracked storage/account cleanup. Unrelated data, SMTP inbox history, and environment values were preserved; no secrets were printed.

At browser-verification handoff, the clean production server was running on port 3001 as PID **5360**, exec session **7813**. The coordinator has taken ownership of that server for its final release gate. Port 3012's independent walkthrough server was untouched. Self-review checked all findings against the source, transactional identity/pruning paths, actor enforcement, assignment omission/preservation, real authorization assertions, positive fresh-invitation/quote flows, and test cleanup. Scoped repairs are verified; independent scoped re-review and the coordinator's full release gate remain the final acceptance steps.
