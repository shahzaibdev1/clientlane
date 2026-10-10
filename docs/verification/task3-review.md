# Task 3 review

## Spec Compliance

- ❌ Issues found. The requested usable project assignment workflow and accessible mobile navigation have two Important defects: `src/components/workspace/workspace.tsx:330` offers assignments that the backend necessarily rejects during project creation, and `src/components/workspace/workspace.tsx:604` / `src/components/workspace/workspace.css:1374` leave the closed mobile navigation focusable and exposed to assistive technology.
- The remaining requested workflows have corresponding implementation in the scoped diff: authentication/recovery, owner/member workspace selection, client/project management, Today lists with totals and Show more, project requests/milestones/delivery versions/feedback/agreements/private notes/handover, portal grants, team invitations/revocation, templates, CSV preview/import, exports, settings/email activity, and the persistent demo. This is source verification of controls and action wiring, not a claim that every edit/delete/error permutation was executed.
- ⚠️ Cannot verify from this diff: unchanged backend/RPC tenant enforcement, token entropy/expiry/revocation, private storage authorization, domain state caps, backend mail processing, hosted HTTPS authentication, separate-repository/branch/port configuration, or public marketing/claims. These span Task 1/2/4 or excluded root paths; retain their independent reviews and root release gate. The focused checks below validate only their named UI contract risks.
- ⚠️ Production verification is outside this task diff. Root subsequently reported the complete production gate at 21/21 browser scenarios, 103 unit tests, 24 integration tests, plus build/static checks passing. I did not rerun or independently reproduce these suites.

## Strengths

- `src/components/workspace/workspace.tsx:167` uses the current snapshot reference for commands, checks backend result unions, reloads on stale versions, and preserves dialog inputs through recoverable failures. Demo writes use the same domain command engine and compare local-storage generations before mutation.
- `src/components/workspace/forms.tsx:142` focuses recoverable dialog errors; `forms.tsx:147` and `forms.tsx:150` use native modal dialogs and restore trigger focus. File references are parsed after real uploads; `forms.tsx:164` enforces the stated 20MB UI limit.
- `src/components/workspace/project.tsx:815` restricts private Notes to the team view. `project.tsx:1031` and `project.tsx:1065` gate decisions/feedback to the latest delivery version, and the Handover export at `project.tsx:880` includes only latest approved delivery versions and public project fields.
- `src/components/workspace/money.ts:1` parses decimal amounts using integer arithmetic and rejects unsafe values. `tests/unit/product-money.test.ts:6` covers the safe-integer rounding boundary that previously failed.
- `src/components/workspace/workspace.tsx:1700` keeps the initial Today/waiting/upcoming groups bounded at ten while preserving access to all later entries. `tests/e2e/product-workflows.spec.ts:127` tests fifteen imported projects and opens a later action.
- `tests/e2e/workspace-real.spec.ts:60` exercises real signup/persistence, private upload/download, client response/approval, rotation, and revocation. `workspace-real.spec.ts:153` verifies an invited member's project scope and workspace selector; `workspace-real.spec.ts:202` exercises password recovery through local mail.
- `.superpowers/sdd/clientlane/task3-report.md:24` records explicit behavioral RED/GREEN evidence and distinguishes infrastructure/fixture failures. `task3-report.md:42` accurately reports the earlier 11/12 full run plus the focused recovery pass instead of asserting an unobserved 12/12 result.

## Issues

### Critical (Must Fix)

- None found in the reviewed task scope.

### Important (Should Fix)

1. **New-project teammate choices cannot succeed in production.** `src/components/workspace/workspace.tsx:330` includes every active member when `p` is absent. The create form sends that member's ID with a newly generated project ID. The existing backend checks that the member already has that exact project in `project_ids` (`src/lib/backend/service.ts:126`–`139`); an existing member cannot already be scoped to the newly generated ID. Selecting any teammate therefore prevents project creation with “Assignee must be an active member assigned to this project.” The existing-team test only assigns an already-scoped project and misses this path. Restrict new-project creation to unassigned/owner-managed and explain the supported create → invite/scope → assign sequence; keep scoped member choices for existing projects. If assignment during creation is required, it needs an explicit atomic backend scope-and-create contract, not a bypass of the scope check. Add one focused real workflow regression proving the presented new-project choices succeed.

2. **The closed mobile sidebar remains in keyboard and screen-reader navigation.** `src/components/workspace/workspace.css:1374` hides the sidebar only with `transform: translateX(-100%)`, while `src/components/workspace/workspace.tsx:604` keeps ordinary focusable links, selectors, and buttons mounted without `inert` or equivalent visibility control. At mobile widths, Tab can enter invisible navigation before reaching the visible workspace, and assistive technology still encounters the supposedly closed menu. The open/close controls at `workspace.tsx:620`, `workspace.tsx:708`, and `workspace.tsx:717` also do not manage drawer focus. Make the sidebar inert/hidden when closed on mobile while retaining normal desktop navigation; move focus into the opened drawer and restore it to Open navigation on close. Add a focused mobile keyboard regression for the closed Tab order and close-focus restoration; axe and dialog Escape tests alone do not establish this behavior.

### Minor (Nice to Have)

1. **Milestone-completion assertion can pass when the command fails.** `tests/e2e/product-workflows.spec.ts:44` searches `/Complete/` after clicking the pre-existing Complete button. If the milestone stays Upcoming and its Complete button remains visible, the assertion still passes. Assert the completed status and the replacement Mark incomplete control, ideally after a reload, so the test verifies the requested transition rather than an existing label.

2. **New component size couples unrelated workflows.** `src/components/workspace/workspace.tsx:65` begins a component spanning owner pages, demo persistence, action/error orchestration, team/mail loading, sharing, and extensive form construction in a new 1,850-line file. `src/components/workspace/project.tsx:81` similarly owns all six project sections in a new 1,102-line file. The code is navigable and this is not independently a release blocker, but subsequent changes will touch a large shared state surface. Extract screen components and demo persistence/action orchestration behind explicit props/hooks when the current correctness fixes are complete; preserve the existing command engine and role boundary.

3. **Reported development output was not pristine.** `.superpowers/sdd/clientlane/task3-report.md:56` records a Turbopack panic and later aborted/ECONNRESET requests with uncaughtException logging. The report is transparent and root's later production pass addresses the release-test gap, so this is not evidence of a production behavior failure. Retain the distinction between framework navigation cancellation and application errors in release evidence; confirm root's production server output is clean, rather than relying only on pass counts.

## Focused checks and review boundaries

- Scope: BASE `43c2beb`, HEAD `d42c4a6`, packaged diff `.superpowers/sdd/clientlane/task3.diff`. Reviewed the task brief before the implementer report, then the diff in bounded sequential segments. Public marketing and incidental root commits were excluded by the package.
- One output segment truncated inside the team-invitation form. Read only that missing form hunk from the diff package to complete the judgment; no changed source file was separately read.
- Named risk: **CSV preview might import valid rows despite errors.** Checked unchanged `src/lib/domain/import.ts:63` through its return at `import.ts:164`. `parseProjectsCsv` returns an empty `rows` array when any row fails, so the UI's nonempty-preview import guard does preserve all-or-nothing validation.
- Named risk: **Handover might accidentally include internal project data.** Checked unchanged `src/lib/domain/selectors.ts:11` and `selectors.ts:125`. The UI's explicit export field selection agrees with the existing public/handover selectors; internal notes, private events, client/assignee IDs, and input requests are absent. Delivery comments are part of the established public delivery projection.
- Named risk: **New-project assignment choices might violate the backend contract.** Checked unchanged `src/lib/backend/service.ts:126`–`139`; this confirmed Important finding 1. No authorization rule should be weakened to resolve a UI option mismatch.
- Named risk: **Unauthenticated invitation visits might lose their return destination.** Checked unchanged authentication protection in `src/proxy.ts:26`–`33` and `src/lib/supabase/server.ts:39`. The proxy preserves the internal invitation pathname in `next`, so the new invitation page's `requireUser` check does not by itself lose that destination.
- No tests, build, database mutation, server startup, git command, branch/index mutation, or subagent dispatch occurred during this review. Only this explicitly requested report artifact was written.

## Assessment

**Spec verdict:** Issues found; two Important fixes required.

**Task quality:** Needs fixes.

**Reasoning:** The implementation covers the product's broad workflows and uses the existing security/domain contracts, with meaningful local integration and browser evidence. The impossible creation assignment options and inaccessible closed mobile navigation are concrete behavior defects that should be repaired before approval; the remaining items are nonblocking test/structure/evidence improvements.
