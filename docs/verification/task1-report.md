# Task 1 — domain contracts and transitions

Implemented `src/lib/domain/{types,schema,commands,selectors,sample,import,index}.ts` and two domain unit files. The domain has no database, browser, mail, or storage side effects. No files outside the domain, domain tests, and this report were changed by this task.

## Binding interfaces

Import public contracts from `@/lib/domain` (individual modules also work):

```ts
applyCommand(state: WorkspaceState, command: Command | unknown, actor: Actor,
             now: string | Date): WorkspaceState
emptyState(workspaceId = 'workspace'): WorkspaceState
sampleState(workspaceId = 'demo', date = '2026-10-10'): WorkspaceState
portalProject(project: Project): PortalProject
dashboard(state: WorkspaceState, date: string, query = ''):
  { today: DashboardItem[]; waiting: DashboardItem[]; upcoming: DashboardItem[] }
parseProjectsCsv(text: string):
  { rows: ImportProjectRow[]; errors: { row: number; message: string }[] }
exportProjectsCsv(state: WorkspaceState): string
exportWorkspaceJson(state: WorkspaceState): string
handoverProject(project: Project): approved latest deliveries/milestones/agreements
memberWorkspace(state: WorkspaceState, projectIds: string[]): WorkspaceState
weeklyDigest(state: WorkspaceState, date: string, activeProjectIds: string[]):
  { clientId, email, name, projects: { projectId, title, requests, deliveries }[] }[]
reminderEligible(project: Project, request: Request, date: string,
                 activeGrant = true): boolean
delayDays(project: Project, date: string): number
revisionSummary({ revisionAllowance, revisionUsed }):
  { included, used, remaining, extra }
formatMoney(cents: number, currency: Currency, locale = 'en-US'): string
addDays(date: string, days: number): string
```

`DomainError` includes `code: validation | authorization | transition | not_found`. `applyCommand` parses the supplied snapshot, command, actor, timestamp, and resulting snapshot; Zod clones protect the input from both successful and failed transactions. Runtime-invalid commands may be passed as `unknown` and receive a domain validation error. `workspaceSchema`, `projectSchema`, `commandSchema`, `actorSchema`, `fileRefSchema`, `dateSchema`, related nested schemas, `LIMITS`, and `UPLOAD_TYPES` are exported.

`Actor` is precisely:

```ts
{ role: 'owner'; id: string }
| { role: 'member'; id: string; projectIds: string[] }
| { role: 'client'; projectId: string; name: string }
```

The **server must construct actors from authenticated membership or portal grants**. An actor is never accepted as a client-provided command field. Member `projectIds` are authoritative scope supplied by the service. Portal grant expiry/revocation is a service responsibility.

`WorkspaceState` is `{ workspaceId, settings, clients, projects, templates }`. Settings contain `brandName`, `brandColor` (six-digit hex), `logoUrl` (HTTPS or null), `currency` (`USD|EUR|GBP|PKR|CAD|AUD`), and `weeklyDigest` (boolean, true in new workspaces). Clients contain `id,name,email,company`. Projects contain `id,clientId,title,description,dueDate,originalDueDate,status,archived,assigneeId,revisionAllowance,revisionUsed,createdAt,requests,deliveries,changes,milestones,deadlineProposals,events,internalNotes`.

Project `status` is `active|waiting|review|completed`; archival is a separate boolean. Due dates are valid UTC calendar dates `YYYY-MM-DD` or null. Original due dates are retained. Reassigning `clientId` after creation is rejected because retained deliveries belong to the original client. Assignment and revision-allowance changes require owner role.

Requests include `requestType: text|file`, `status: pending|received|rejected`, nullable reminder/response/rejectionReason, and retained `responseHistory`. Reminder shape is `{ enabled, intervalDays, nextDueDate }`. A response includes `text,files,author,submittedAt`. Publishing creates immutable version payloads; versions include `id,number,note,files,publishedAt,publishedBy,comments,decision`. Comments and decisions derive author/time from trusted actor/time. Decision shape is `{ value: approved|needs_changes, note, author, at } | null`.

File references are:

```ts
{ kind: 'upload'; path: string; name: string; size: number; type: allowed MIME }
| { kind: 'link'; url: HTTPS URL; name: string }
```

Private paths must start with `${workspaceId}/${projectId}/`. Traversal, empty segments, unsafe characters, executable filenames/MIME types, HTML/SVG, nonpositive or >20MB sizes, and credential-bearing/insecure external links are rejected. Actual stored bytes/content signatures, file ownership/registered-reference checks, and authenticated download routes remain Task 2 responsibilities; metadata validation cannot prove file contents.

## Commands and scope

`commandSchema` is the binding discriminated union, including required and optional fields. Commands are strict and reject unknown keys.

| Workflow             | Command types                                                                            | Scope                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Brand/settings       | `settings.update`                                                                        | owner                                                                               |
| Clients              | `client.create`, `client.update`, `client.delete(confirm:true)`                          | owner                                                                               |
| Projects             | `project.create`, `project.update`, `project.archive`, `project.delete(confirm:true)`    | create/archive/delete owner; normal updates scoped team; assignment/allowance owner |
| Requests             | `request.create`, `request.update`, `request.delete`, `request.reject`, `request.reopen` | owner/scoped member                                                                 |
| Submission           | `request.submit`                                                                         | client for one granted project                                                      |
| Reminder advancement | `request.reminder.advance`                                                               | owner/service actor after successful mail only                                      |
| Delivery             | `delivery.publish`, `delivery.comment`, `delivery.decide`                                | publish team; comments team/client; decisions client                                |
| Extra work           | `change.request`, `change.quote`, `change.respond`                                       | request/respond client; quote team                                                  |
| Deadline agreement   | `deadline.propose`, `deadline.respond`                                                   | propose team; respond client                                                        |
| Milestones           | `milestone.create`, `milestone.update`, `milestone.delete`                               | team                                                                                |
| Internal notes       | `note.add`, `note.delete`                                                                | team; internal events never projected                                               |
| Templates            | `template.save`, `template.delete`                                                       | owner                                                                               |
| CSV import           | `projects.import`                                                                        | owner                                                                               |

No version edit/delete commands exist. Only the latest version can receive a decision. A repeated identical decision is a no-op, with no extra event/revision; a conflicting final decision is rejected. Every `needs_changes` decision counts once, with the aggregate count checked against version history on parsing. A published quote cannot be rewritten; acceptance/rejection requires a pending quote. Quote acceptance does not silently alter project deadlines. A pending deadline proposal records its previous deadline; stale acceptance is rejected, while decline is allowed so a new proposal can proceed. Archived projects are read only except owner restoration/deletion.

## Projection/import guarantees

- `portalProject` validates the project and explicitly selects public root fields, excludes client/assignee IDs and private notes, filters internal events, and copies nested data. Handover includes only an approved **latest** version; an older approval cannot appear while a newer draft exists.
- `memberWorkspace` selects assigned projects and their necessary clients, excludes templates, and returns a copy. Services still must scope every mutation/read against current membership.
- Reminders stop for received requests, archived/completed projects, disabled schedules, future dates, and inactive grants. Weekly digests group eligible work into one record per client and respect active project grants.
- Builtin website, branding, and retainer templates exist in a new workspace. Template project creation expands relative dates from the supplied UTC transaction day.
- CSV supports quoted commas/newlines/doubled quotes, UTF-8 BOM, required headers, optional company/status/archived, real dates and integer allowances, duplicate detection and conflicting identities. Any preview error empties all preview rows. Command import validates again and is atomic, retaining archive/status from exports.
- CSV exports retain archived rows and neutralize spreadsheet formula prefixes. Full JSON export validates all account data; handover excludes internal data.
- Caps reject, rather than truncate: 200 clients, 500 projects, 200 requests/project, 100 deliveries/project, 50 versions/delivery, 200 comments/version, 500 events/project, 10MB UTF-8 serialized state; additional change/milestone/note/template/history limits are explicit.
- Money remains integer cents; formatting uses BigInt integer/fraction parts so the final cent remains exact even at `Number.MAX_SAFE_INTEGER`.

## Exact test-first evidence

Read `test-driven-development/SKILL.md` and `writing-good-tests.md` before authoring tests. Tests use real command engines and hand-derived fixtures/expected values, with no mocks.

1. **22:51:13**, `npm test -- tests/unit/domain.test.ts`: initial collection failure because no domain module existed. This is recorded as setup failure, not behavioral RED.
2. **22:51:44**, same command against temporary exported contract scaffolding: **31 tests failed**. Examples: missing mutation returned no clients; invalid dates/commands did not throw; strict validation accepted unknown data; reminder selector returned false; CSV parser returned no data. Scaffolding was replaced with the implementation.
3. **22:57:44**, same command: **31 tests passed**.
4. First typecheck found two sample actor default-inference errors and one deliberately invalid `confirm:false` test typed as a valid command. Added explicit `Actor` annotations and made the negative-test runner accept `unknown`; did not weaken runtime validation.
5. **23:00:10**, `npm test`: **4 failed / 48 passed, 52 total**. Failing cases: empty received submission accepted by persisted state schema; accepted deadline missing response; CSV archive/status flags discarded; contradictory names/companies for one client email accepted. Added missing validation/import behavior.
6. **23:01:01**, `npm test`: **52 passed**.
7. **23:02:17**, `npm test -- tests/unit/domain-boundaries.test.ts`: **2 failed / 21 passed**. Missing portal nested-field validation and stale-proposal decline rejected. Added strict project validation at the projection boundary and allowed stale rejection without allowing stale acceptance.
8. **23:02:41**, `npm test`: **54 passed**.
9. Refactored field assignment and filename checks after GREEN to satisfy lint, then formatted domain/test files.
10. **23:03:45**, focused boundary tests: **1 failed / 23 passed**. Exact money regression expected `$90,071,992,547,409.91`, observed `$90,071,992,547,409.90`. Replaced float division with BigInt formatting.
11. **23:04:30**, complete `npm test`: **55 passed / 2 files**, no failures. `npm run typecheck`: exit 0. `npx eslint src/lib/domain tests/unit/domain.test.ts tests/unit/domain-boundaries.test.ts`: exit 0. Additional boundary assertions also cover existing role rules, caps, reminder advancement, rejected agreements, note deletion, scoped member projection, digest grouping, account export, and CSV atomicity.
12. **23:06:52**, focused boundary tests: **1 failed / 24 passed**, unknown `settings.update.weeklyDigest` field. Added owner-configurable digest setting and selector suppression.
13. **23:08:16**, final complete `npm test`: **56 passed / 2 files**, exit 0, zero failures. Final `npm run typecheck`: exit 0. Final domain/test ESLint command: exit 0. Final domain/test `prettier --check`: all matched files use Prettier style, exit 0. No domain production code changed after these final checks.

This task does not claim database isolation, transport delivery, uploaded byte validation, browser accessibility, or production build verification. Those require Tasks 2–4. Root agent coordinates independent review before Task 2.
