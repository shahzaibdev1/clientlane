# Clientlane validation

Optional client accounts and both invitation directions were added locally on 11 October 2026. See [the implementation report](verification/client-accounts-report.md) for exact RED/GREEN evidence, authorization interfaces, screenshots and the round-one retention/privacy/signup repairs. Repair evidence is 108 unit tests, 47 real integration tests, a fresh production build and two focused signup browser regressions, following the initial three account browser flows; the coordinator's postreview full browser gate remains pending at this repair handoff. The historical release evidence below describes the preceding product build.

Local product, including optional client accounts and two-way invitations, verified on 11 October 2026. The new feature received a complete independent review and approved scoped repair review. The earlier whole-product repair review report was interrupted by an account usage limit; its historical boundary is retained in docs/verification/final-fix-review.md.

## Results

| Check                           | Observed result                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Unit tests                      | 108 passed across nine files                                                                |
| Real Supabase integration       | 47 passed against Auth, Postgres, private Storage and SMTP/Mailpit                          |
| Production Chromium             | 35 passed in 4.3 minutes against the updated production build                               |
| Formatting, lint and TypeScript | Passed                                                                                      |
| Production build                | Next.js 16.4 build passed, including all public, private, authentication and API routes     |
| Dependency audit                | Zero reported vulnerabilities for the installed lockfile                                    |
| Public browser assets           | 26 assets checked; no configured raw server credential strings found                        |
| Visual inspection               | Production marketing, dashboard, login and actual client portal inspected on desktop/mobile |

## Coverage

| Area                | Verification                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts            | Real signup, persisted session, sign-out, recovery email, callback, password reset and subsequent sign-in; safe return destinations; HTTPS cookie configuration; native login POST fallback |
| Client/project work | Validated commands, clients/projects, milestones, archive/restore, templates, CSV preview/import, exports, settings and high-volume overview access                                         |
| Delivery/agreements | Immutable versions, version-specific feedback, latest approval, revision counting, exact-cents quotes, accepted deadlines and approved handover                                             |
| Private access      | Separate owners, assigned collaborators, public projection, token expiry/rotation/revocation, actual private upload/download bytes, forbidden files and revoked access                      |
| Email               | Real invitations, reminder/digest eligibility, leases/retries/deduplication, durable recovery after SMTP acceptance, explicit failures and authenticated jobs                               |
| Demo                | Strict persistent state, reset, stale-tab protection, preserved drafts and corrupt-storage recovery; clearly labelled simulated email/attachments                                           |
| Accessibility       | Axe, 375px overflow checks, labelled native dialogs, error focus, Escape/focus restoration and mobile navigation keyboard regression                                                        |
| Public discovery    | Marketing/guides/free revision utility, copy/download content, metadata/canonicals/OpenGraph/schema, sitemap and private noindex/cache/referrer headers                                     |

Tests verify meaningful transitions and representative complete workflows, not every possible input or browser permutation. Independent task reviews found reminder recovery, disguised active documents, invalid creation assignments and mobile keyboard navigation; explicit regressions passed and scoped re-reviews approved the fixes. The additional native-authentication regression prevents credential queries before JavaScript handles submission. Evidence and review records are retained in `docs/verification`.

## Operation and limits

Local services use a separate Supabase project and captured email inbox. Browser/storage fixtures use isolated test accounts and exact cleanup paths. Actual portal screenshots use a temporary account/grant cleaned after capture. The previous PricePilot project is preserved. Docker interruption recovery retained existing data and environment credentials.

The local application and independent captioned walkthrough are available on ports 3001 and 3012. Hosted launch requires Supabase, HTTPS authentication, email and durable scheduler configuration described in the README. Hosted confirmation/delivery, a remote HTTPS deployment and GitHub CI execution are not claimed as verified.

No payments or public publishing were performed. Chromium is the automated browser target. Portal links grant bearer access rather than verified recipient identity. File validation is not a malware scan. SMTP acceptance can be ambiguous, so delivery is at least once. Removing a pending attachment removes the form reference rather than immediately deleting its storage object. Large workspace/project components remain a maintenance improvement; uncommon malformed input can produce detailed validation messages.

Development had framework hot-reload and cancelled-navigation logging, recorded separately from product failures. The latest complete production browser run was clean. The earlier inspected production server error log was empty. An initial test-launcher terminal-color warning was removed from the final run's environment.

Final regressions cover deleted-project identity/capability cleanup, obsolete teammate invitations, owner-only quotes, assignment preservation during unavailable team loads, real signup CTAs, settings/template preservation and read-only handover. The standalone real-application walkthrough passed playback, six chapter seeks, 375px overflow checks and focused server-range tests.

Local notification worker successfully checked the actual authenticated queue and is running every 60 seconds in session 72322. The final product browser run created fresh workspace screenshots. These services are local processes; hosted scheduling remains a launch prerequisite.

## Optional client accounts release

Both invitation directions, confirmed-recipient acceptance, dual-role navigation and multi-provider client dashboard are verified. Tests cover account upload/download, feedback/revisions/approval/agreements, separate bearer/account revocation, deleted/replaced project identities, old-email replacement isolation, retained submitted files after Auth deletion, atomic authorized read snapshots, stale sender mail cancellation and signup invitation return paths. All47 real integration tests passed in120.32seconds after the complete35-case production browser run. Fullformat/lint/typecheck and108unit tests passed against final repair source. New service-only RPCs deny authenticated direct execution. Local migrations002 and003 were applied additively without reset or credential changes; hosted installations require these migrations too.

Independent feature review and scoped approved repair are retained in client-accounts-review.md and client-accounts-fix-review.md; exact implementation RED/GREEN is in client-accounts-report.md. Real desktop/mobile screenshots were inspected; new client browser checkpoints have zero tested axe violations and no overflow. Guide explains accounts while its video remains the valid anonymous-link workflow. Hosted confirmation email, remote HTTPS and external deliverability remain unverified launch configuration.
