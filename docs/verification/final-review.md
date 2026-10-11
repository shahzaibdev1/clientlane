# Clientlane whole-product review

Reviewed 11 October 2026. Base: `4b825dc642cb6eb9a060e54bf8d69288fbee4904` (empty tree). Head: `68220085328cc61b3aad41d98cd91d5bb076381f`. Package: `.superpowers/sdd/clientlane/final.diff`.

## Strengths

- The typed command engine is shared by the real workspace and demo, validates complete resulting aggregates, preserves delivery versions and decisions, and rejects stale or unauthorized mutations. Portal projection excludes internal notes and internal events.
- Server actions derive actors from authenticated users or current hashed grants. The database save locks the workspace and rechecks access and expected version; direct anonymous/authenticated table and RPC access is revoked. File downloads pass through a current-access proxy with attachment and no-store headers.
- Real Auth/Postgres/Storage/SMTP integration and production browser evidence cover representative complete workflows. Previous reminder recovery, active-document upload, mobile navigation, and native credential-query findings have concrete fixes and regression assertions.
- Integer-cent money, date-only deadlines, CSV all-or-nothing preview, explicit deletion, immutable approvals, truthful email status, and clearly identified local demo behavior are substantive product strengths. Public content avoids invented prices, customer claims, or payment integrations.

## Issues

### Critical — must fix

**C1. Reused imported project IDs transfer old collaborator access to a different client's project.**

- References: `src/lib/domain/commands.ts:588` allocates `nextId(state.projects, 'import-project-')`; deletion at `commands.ts:247` removes the project from that set. `supabase/migrations/202610100001_backend.sql:42` invalidates missing-project portal grants but does not prune membership or pending-invitation project scopes. `src/lib/domain/selectors.ts:154` projects members' data by those IDs; `src/lib/backend/files.ts:106` authorizes member files against the same project scope.
- Trigger: import Client A's project, grant a collaborator its generated `import-project-1` scope, delete that project, then import Client B's project. With an empty project list the new import receives `import-project-1` again. The old collaborator can read and mutate Client B's new project without a new grant. A pending invitation to the deleted ID can also become valid again. Retained file registry entries use the same identity and compound the aliasing problem.
- Evidence: an isolated, in-memory run of the actual domain modules produced `deletedProjectId: "import-project-1"`, `reimportedProjectId: "import-project-1"`, and `oldMembershipSees: ["Client B private project"]`. The SQL/source access path confirms no scope cleanup intervenes. No database data was changed for this check.
- Fix: make new project identity non-reusable across deletion and replacement, including imports. Atomically invalidate/prune deleted-project memberships and invitations, and ensure retained file metadata cannot be authorized as files of a replacement project. Do not fix this by merely hiding an item in the UI.
- Covering regression: real backend import → member grant and pending invite → delete → unrelated-client import. Assert the old member cannot load/mutate the new project or fetch its files, the old invitation cannot acquire its scope, and retained old file paths do not alias new-project authorization. Preserve normal new invitations and imports.

### Important — should fix before approval

**I1. Saving an edit while team data is unavailable silently clears the existing assignee.**

- References: `src/components/workspace/workspace.tsx:80`, `:137`, `:336`, `:388`; `src/components/workspace/forms.tsx:76`, `:87`.
- Trigger: open an already assigned project's Edit project dialog before the ancillary team request completes, or after it fails, then change only the title and save. The options contain only the owner/unassigned value while the default is the existing member ID. The browser falls back to the available empty option, and submit always writes `assigneeId: null`. The modal snapshots its fields when opened, so later team arrival does not repair the option list.
- Evidence: a focused React-rendered select in Chromium, using the same unmatched default and empty owner option, submitted `""`. Source inspection ties that value directly to the unconditional assignment update.
- Fix: preserve the stored assignment independently of asynchronously loaded options. Disable/defer assignment editing until authoritative team data is available, or retain the current assignment and omit `assigneeId` unless the user explicitly changes it. Handle missing/revoked current assignees without silent reassignment.
- Covering regression: delay and fail the team request with an assigned project; save an unrelated field and verify persisted assignee remains unchanged. Also verify deliberate unassignment and valid scoped reassignment.

**I2. Scoped collaborators can publish prices despite the binding owner-only quote requirement.**

- References: `src/lib/domain/commands.ts:425`; `src/components/workspace/project.tsx:675`; binding spec `docs/superpowers/specs/2026-10-10-clientlane-design.md:16` (delivery/extra-work paragraph).
- Trigger: a collaborator assigned to a project opens a client's requested extra work and publishes a quote. The UI permits every non-client and the command engine has no owner guard in `change.quote`. The client can then accept that price as an agreement.
- The Task 1 report documents "quote team", but the design says "owner quote". The coordinating executor explicitly confirmed during this review that there was no user authorization expanding collaborator price-setting authority and ruled for owner-only quotes.
- Fix: enforce owner authority in the domain/server command path and show Publish quote only to the owner. Hiding the button alone is insufficient.
- Covering regression: a correctly scoped member's direct quote command must fail without state changes; owner quote and client acceptance must still succeed. Verify collaborator UI does not offer the pricing action.

**I3. Public signup calls to action open the sign-in form.**

- References: `src/app/page.tsx:46`; `src/components/marketing/chrome.tsx:21`, `:58`; `src/app/login/page.tsx:15`; `tests/e2e/marketing.spec.ts:15`.
- Trigger: a new visitor selects Start your workspace from the homepage, shared header, or shared CTA. These links target `/login?mode=signup`, while LoginPage always renders `mode="login"` and ignores the query. The visitor receives a sign-in form rather than account creation.
- Evidence: focused read-only navigation against the running production build returned heading `Welcome back.`, submit label `Sign in`, and zero confirm-password inputs. The existing marketing test asserts only the incorrect URL and therefore blesses the integration mismatch.
- Fix: link the creation CTAs to the existing `/signup` route, preserving return destinations where relevant.
- Covering regression: click the public CTA and assert the actual Create account form, including confirmation password. Keep the separate Log in link targeting sign-in.

**I4. Loading samples deletes settings and custom templates beyond the described confirmation.**

- References: `src/components/workspace/workspace.tsx:1096`; `src/lib/backend/service.ts:191`, `:204`; `src/lib/domain/sample.ts:89`.
- Trigger: a studio with custom templates and branding loads sample projects. The dialog warns only that clients and projects will be replaced, but `loadSample` replaces the entire aggregate with `sampleState`, including settings and templates. In a workspace containing only customized settings/templates, the UI says merely "Add sample clients, requests, and deliveries" and the service's replacement check also ignores that data.
- Impact: reusable custom work and configuration are lost without a confirmation describing that loss.
- Fix: preserve settings/custom templates when loading sample clients/projects, or explicitly present this as a full workspace reset and require confirmation whenever any retained user data would be replaced. Coordinate with C1 so replacement cannot carry old access capabilities onto new records.
- Covering regression: customized settings and at least one custom template with no clients/projects; then sample load. Assert preservation or the intended explicit full-reset confirmation. Include a populated workspace case.

**I5. Revoked teammates can restore access using an older unused invitation.**

- References: `supabase/migrations/202610100001_backend.sql:53`; `supabase/migrations/202610100002_invitations.sql:12`; `src/components/workspace/workspace.tsx:1543`.
- Trigger: an active teammate has another unaccepted invitation, for example for an updated project scope. The owner selects Revoke teammate, which promises their workspace/files access will stop. Revocation updates only the membership. Accepting the earlier invitation still succeeds and the membership upsert explicitly resets `revoked_at=null`.
- Impact: an access-removal action can be undone by the removed teammate without a new owner decision. The UI's separate invitation revocation action does not make this consequence clear or enforce the promised teammate revocation.
- Fix: revoke outstanding invitations for the removed member's identity atomically with membership revocation, or use a revocation generation that rejects invitations issued before that revocation. A newly issued invitation after revocation may intentionally restore access.
- Covering regression: invite/accept → issue another pending invitation → revoke teammate → reject acceptance of the old pending invitation and deny file access. Verify a fresh owner-issued invitation can still be accepted.

### Minor — nonblocking improvements

**M1. Ready for review includes archived/completed projects.** `src/components/workspace/workspace.tsx:992` counts pending decisions from every project, whereas active counts and dashboard actions exclude archived/completed projects. Archiving an unapproved delivery can leave a review count with no corresponding active action. Apply the same project eligibility predicate before counting. A small selector regression is sufficient if this metric is extracted.

**M2. The handover view reuses editable milestone controls.** `src/components/workspace/project.tsx:925` inserts the same `milestones` subtree used for editing; its controls at `:312` and `:333` remain available to owners/members on an unarchived project's Handover tab. The design calls for a read-only handover. Client handover is already read-only, so this is a limited internal-view mismatch. Render milestone progress without mutation controls in Handover and keep editing in the normal project sections.

**M3. Large components remain a maintenance liability.** `src/components/workspace/workspace.tsx:65` owns demo storage, mutations, navigation, all workspace pages, team/email actions, and forms in 1,876 lines; `src/components/workspace/project.tsx:81` owns six project sections in 1,102 lines. This is the previously deferred maintenance finding, independently retained as nonblocking. Extract coherent screens and persistence/action hooks after correctness fixes; avoid coupling this refactor to the security repairs.

**M4. Client-side schema failures can expose raw validation details.** `src/components/workspace/workspace.tsx:253`, `:406` and `src/components/workspace/project.tsx:85` parse with Zod before the action wrapper; `src/components/workspace/forms.tsx:202` displays `Error.message` directly. Overlong or otherwise malformed fields can show JSON-like issue details instead of useful field guidance. This corroborates the documented deferred concern. Normalize Zod issues at the form boundary and retain entered data. The server action wrapper already uses a friendly message.

## Evidence and scope

- Read the reviewer template, binding design/plan, decisions, validation, task reports and prior review/fix evidence. Reviewed the functional source in passes covering domain transitions/schema/import/export, database/RPC permissions, grants/membership, private files, email scheduling/recovery, auth/routes, workspace/project/portal forms, marketing/utility/SEO, local setup, worker, and CI. Checked test inventory and relevant assertions against the claimed contracts.
- The coordinator reports 103 unit, 24 real integration, and 23 production Chromium tests passing, plus formatting/lint/type/build success, zero audit findings, and 27 public browser assets without configured raw credential strings. These results were accepted as reported evidence and not rerun. They do not cover the concrete edge cases above.
- Performed only focused new-doubt checks: isolated React/select behavior, read-only production signup-target navigation, and in-memory execution of the actual import/delete/member projection functions. No browser or database fixture mutation, broad test rerun, source/index/HEAD/branch modification, server restart, or subagent dispatch occurred. The requested review artifact is the only file this reviewer wrote.
- HEAD was checked at start and near completion and remained `68220085328cc61b3aad41d98cd91d5bb076381f`. Near completion the checkout contained root-owned untracked walkthrough plan/recording/serving/test scripts; these are outside the frozen product package and were neither changed nor reviewed here.
- Prior development HMR/cancelled-navigation logging is retained in the evidence ledger. The coordinator's later clean production verification supersedes it as a release-runtime observation; it is not independently an outstanding product defect. Prior weak milestone assertion, upload fixture cleanup, and native form-query concerns have concrete corrections in the inspected source/tests.

## Declined to judge

- Actual hosted signup confirmation, HTTPS deployment, remote SMTP deliverability, DNS/domain configuration, backups/monitoring, CAPTCHA/rate-limit provider setup, and hosted scheduler operation: explicitly outside the authorized local build; README lists these launch dependencies and validation does not claim they were run.
- A continuously running local notification worker at handoff: code and reported worker checks were reviewed, but root explicitly schedules stable startup after this gate; no recurring worker was running at review dispatch.
- Non-Chromium browser behavior: the recorded automated target is Chromium; no evidence establishes Safari/Firefox behavior.
- Malware scanning and verified client identity/digital-signature guarantees: not provided by the defined opaque-file/bearer-link design and explicitly disclaimed in the product documentation. This does not excuse authorization or accepted-file-policy defects; those boundaries were reviewed.
- Exactly-once SMTP delivery after ambiguous transport acceptance: impossible to conclude from a local queue and explicitly documented as at-least-once. The durable post-recording reminder advancement path was reviewed separately and has its repair marker.
- Immediate physical deletion of unattached upload bytes: no deletion endpoint or immediate-purge promise exists, and the limitation is disclosed. This does not set aside C1's retained-path authorization risk.
- Payment processing, public deployment, legal/brand clearance, measured business results, and search ranking: excluded or unclaimed requirements; public content makes no unsupported assertions in these areas.
- Standalone walkthrough/video artifacts created concurrently by root: separate artifact task, outside this frozen product diff.

## Recommendations and assessment

Fix C1 and I1–I5 in one bounded correctness/security wave, with the covering regressions above. Keep ownership enforcement on the server/domain, capability lifecycle changes transactional, and assignment changes explicit. Preserve the recorded Minor findings for executor disposition rather than silently dropping them. Rerun affected checks and the release gate after the fixes, and obtain a scoped re-review of that resulting diff.

**Ready to merge / hand off as complete: No — fixes required.** The product covers the requested workflow with meaningful verification, but deleted-ID reuse crosses client permission boundaries, teammate revocation has a stale-invitation bypass, and several UI/backend contracts remain incorrect. Passing reported suites does not compensate for these newly identified triggers.
