# Clientlane validation

Optional client accounts and both invitation directions were added locally on 11 October 2026. See [the implementation report](verification/client-accounts-report.md) for exact RED/GREEN evidence, authorization interfaces, screenshots and the final preview privacy correction. Its current evidence is 108 unit tests, 40 real integration tests and three focused production browser flows; the coordinator's postreview full browser gate remains pending at this implementation handoff. The historical release evidence below describes the preceding product build.

Local product verified on 11 October 2026. Whole-product review findings were repaired; the independent scoped reviewer reported no new blocker before an account usage limit interrupted its formal report. See docs/verification/final-fix-review.md for the precise review boundary.

## Results

| Check                           | Observed result                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Unit tests                      | 106 passed across eight files                                                               |
| Real Supabase integration       | 28 passed against Auth, Postgres, private Storage and SMTP/Mailpit                          |
| Production Chromium             | 30 passed in 2.9 minutes against the updated production build                               |
| Formatting, lint and TypeScript | Passed                                                                                      |
| Production build                | Next.js 16.4 build passed, including all public, private, authentication and API routes     |
| Dependency audit                | Zero reported vulnerabilities for the installed lockfile                                    |
| Public browser assets           | 27 assets checked; no configured raw server credential strings found                        |
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

Local notification worker successfully checked the actual authenticated queue and is running every 60 seconds in session 84348. The final product browser run created fresh workspace screenshots. These services are local processes; hosted scheduling remains a launch prerequisite.
