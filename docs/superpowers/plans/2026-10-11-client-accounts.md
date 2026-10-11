# Client accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Optional authenticated client dashboard and invitations in both directions.
**Architecture:** Project capabilities separate from team memberships and bearer links. Authenticated client views reuse public projection and client command policy; transactional RPCs enforce recipient acceptance and lifecycle.
**Tech Stack:** Existing Next16.4, Supabase Auth/Postgres/Storage, TypeScript, Vitest/Playwright.
**Spec:** docs/superpowers/specs/2026-10-11-client-accounts-design.md

## Global constraints

Preserve anonymous links/provider workflows. No marketplace/payments/external email/deployment. Additive migrations; no database resets or secret rotation. Read installed Next documentation before edits.

## Review focus

Wrong recipient and unconfirmed identities; pending/revoked/expired invitations; concurrent/repeated acceptance; deleted/replaced project identities and retained files; dual-role identity without privilege escalation. Each needs real backend regression.

### Task 1: Complete capability backend and usable account/invitation UI

Files create src/lib/backend/client-accounts.ts, client-account-actions.ts; additive supabase/migrations SQL; focused src/components/client-account components; src/app/client routes. Narrow edits existing workspace/project/portal/auth/proxy/files/mail only where required. Tests tests/integration/client-accounts.test.ts, tests/e2e/client-accounts.spec.ts and relevant unit files.
Interfaces consume Backend, domain client projection/commands, Files/Mail, requireUser; produce authenticated project listing/mutation/files and expiring provider-to-client/client-to-provider invitation preview/send/accept/decline/revoke methods. Author defines precise exported types in report; UI consumes these directly.

- [x] Write/run failing permission, capability lifecycle and both invitation flow tests before implementation.
- [x] Implement additive transactional backend; apply only new migration to existing local DB without historical migration reset.
- [x] Implement client dashboard, authenticated project view, invite/brief flows, role navigation and signup entry. Preserve anonymous/project provider controls.
- [x] Run meaningful unit/real integration/production browser tests, mobile/axe checks; inspect real screenshots and self-review.
- [x] Commit scoped changes and evidence report; fresh independent review then covering fixes/re-review.

### Task 2: Release verification and explanation

- [x] Run appropriate full release gate after reviewed fixes; update validation/setup documentation and walkthrough explanation for two-way accounts.
- [x] Preserve decisions/reviews; restart stable local app/worker, verify guide and health, commit clean and deliver concise result.

The user explicitly said do it now after agreeing this scope; no additional design approval pause.
