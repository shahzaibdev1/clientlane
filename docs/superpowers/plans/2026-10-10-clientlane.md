# Clientlane Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development task by task; test first, independent review after each task. User authorizes immediate build without further confirmation.

**Goal:** Ship a tested client delivery workspace and portal with public marketing and SEO.
**Architecture:** Typed pure command engine shared by server and demo. Supabase persists workspace snapshots optimistically; server services enforce token and member scope before engine dispatch. UI consumes the same data model.
**Tech Stack:** Next16/React/TypeScript/Supabase/Zod/Nodemailer/Vitest/Playwright/axe.
**Spec:** docs/superpowers/specs/2026-10-10-clientlane-design.md

## Global Constraints

- Next.js + Supabase; app port3001, separate repo from PricePilot, branch build/clientlane.
- No payment processing or public publishing. No claims of unverified superiority/results.
- Strict tenant boundaries, scoped expiring revocable client grants, no service secrets in browser.
- Dates YYYY-MM-DD, money integer cents, explicit validation/state caps, accessible mobile-first UI.
- Spec's full feature list applies; test-first RED/GREEN evidence written to reports.

## Review Focus

1. Stale tabs never overwrite another actor's changes: optimistic DB and demo version tests.
2. Old delivery versions cannot invalidate newer approvals or consume revisions twice: domain tests.
3. Portal responses never include another client/project/internal notes: integration projections tests.
4. Revoked/expired grants and revoked contractors cannot fetch files or mutate: integration tests.
5. Reminder retry never falsely marks failed mail sent; completed requests/archived projects not chased: job tests.

### Task 1: Domain contracts and transitions

Files src/lib/domain/{types,schema,commands,selectors,sample,import}.ts; tests/unit/domain*.test.ts.
Produces WorkspaceState, Project, Command, applyCommand(state,command,actor,now):WorkspaceState; Actor owner|member(projectIds)|client(projectId,name); emptyState, sampleState; dashboard(state,date); portalProject(project): public projection; parseProjectsCsv(text): preview. Workspace state fields settings/clients/projects/templates. Project nested requests/deliveries(each versions)/changes/milestones/events/internalNotes. Concrete exported types are binding for later tasks.

- [x] Write failing tests for all mutations, actor scopes, revisions/version decisions, change quote/date acceptance, reminder eligibility, templates, CSV errors/caps/exports; run RED.
- [x] Implement pure validated engine, selectors, seeds; run unit suite GREEN; typecheck; commit and report.
- [x] Fresh read-only task review; fix important findings before Task2.

### Task 2: Secure persistence, auth, access, files and email

Files src/lib/{actions,access,email,jobs}.ts, src/lib/supabase/{server,browser,admin}.ts; src/proxy.ts; src/app/auth/callback/route.ts; src/app/api/{files,jobs}/route.ts; supabase migrations/config; scripts/setup-local.mjs; tests/integration/backend.test.ts and tests/unit/jobs.test.ts.
Consumes Task1 exports. Produces loadWorkspace():{state,version,role,projectIds}, mutateWorkspace(version,command): ActionResult, loadPortal(token), mutatePortal(token,version,command), createPortalLink(projectId)/revokePortal(projectId), sendPortalInvite(projectId), uploadFile/downloadFile helpers, invitation accept/revoke APIs, job runner. ActionResult success state/version or error; UI must inspect results. Never write credentials to stdout.

- [x] Add failing integration tests and RED for isolation/concurrency/grants/team/storage/jobs/auth routing.
- [x] Implement database migrations/RLS/RPC/server boundaries and authenticated scheduled jobs with real local SMTP; run GREEN; commit/report.
- [x] Fresh read-only task review; fixes.

### Task 3: Complete product UI

Files src/app/{app,demo,portal,login,reset}/**, src/components/{workspace,project,portal,auth,ui}/**, src/app/globals.css and layout.tsx; tests/e2e/product.spec.ts.
Consumes actual Task1/2 interfaces (read them; do not invent). Owner Today/clients/projects/templates/settings; project requests/deliveries/feedback/agreements/notes/team, project and client CRUD/archive, requests due/reminders, file uploads, invitation emails, client portal, handover/export/import, sample loading/demo persistence reset; all actions real. Auth signup/login/recovery/logout. Premium editorial visual design warm canvas/navy/teal, clear hierarchy, friendly readable errors, no horizontal mobile scroll. Demo handles commands locally with stale state protection and clearly labelled email/file simulation.

- [ ] Write browser tests first and run RED against missing UI; implement full behavior; run focused tests GREEN.
- [ ] Fresh task review and fixes; no fake buttons.

### Task 4: Marketing, free utility, SEO and release verification

Files src/app/page.tsx, features/page.tsx, guides/[slug]/page.tsx, tools/revision-tracker/page.tsx, sitemap.ts, robots.ts, opengraph-image.tsx; src/components/marketing/**; tests/e2e/marketing.spec.ts; README.md docs/VALIDATION.md .github/workflows/ci.yml.
Consumes polished app/sample model. Public free revision tracker, original useful guides, truthful feature pages and CTA demo/signup, crawlable correct canonical/meta/schema, app routes excluded/noindex.

- [ ] Write failing browser tests for utility/metadata/routes; implement public pages, test GREEN.
- [ ] Run production build, complete unit/integration/browser suite, axe/mobile/visual checks/audit; resolve defects, record evidence and hosted SMTP/cron/domain/CAPTCHA prerequisites.
- [ ] Whole-branch fresh strongest-model review, fixes/re-review, commit clean, open local app and deliver concise report.
