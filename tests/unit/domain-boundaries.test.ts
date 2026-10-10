import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyState,
  workspaceSchema,
  parseProjectsCsv,
  exportProjectsCsv,
  portalProject,
  handoverProject,
  revisionSummary,
  formatMoney,
  memberWorkspace,
  weeklyDigest,
  exportWorkspaceJson,
} from '../../src/lib/domain';
import type { Actor, Command, WorkspaceState } from '../../src/lib/domain';
const owner: Actor = { role: 'owner', id: 'owner' };
const client: Actor = { role: 'client', projectId: 'p1', name: 'Client' };
const now = '2026-10-10T12:00:00.000Z';
const run = (state: WorkspaceState, cmd: Command | unknown, actor = owner as Actor) =>
  applyCommand(state, cmd, actor, now);
function setup() {
  let state = run(emptyState('w1'), {
    type: 'client.create',
    id: 'c1',
    name: 'Client',
    email: 'client@example.test',
    company: 'Studio',
  });
  state = run(state, {
    type: 'client.create',
    id: 'c2',
    name: 'Other',
    email: 'other@example.test',
    company: 'Other Studio',
  });
  for (const id of ['p1', 'p2'])
    state = run(state, {
      type: 'project.create',
      id,
      clientId: id === 'p1' ? 'c1' : 'c2',
      title: id,
      description: '',
      revisionAllowance: 2,
      dueDate: '2026-10-20',
    });
  return run(state, {
    type: 'request.create',
    projectId: 'p1',
    id: 'r1',
    title: 'Copy',
    instructions: '',
    requestType: 'text',
    dueDate: '2026-10-10',
    reminder: { enabled: true, intervalDays: 7, nextDueDate: '2026-10-10' },
  });
}
describe('bounded aggregates and stored state integrity', () => {
  it('rejects reassigning existing client history to a different client', () => {
    expect(() => run(setup(), { type: 'project.update', projectId: 'p1', clientId: 'c2' })).toThrow(
      /client/i,
    );
  });
  it('rejects decisions on old versions even when they repeat an earlier decision', () => {
    let state = run(setup(), {
      type: 'delivery.publish',
      projectId: 'p1',
      deliveryId: 'd1',
      versionId: 'v1',
      title: 'Draft',
      note: 'v1',
      files: [],
    });
    state = run(
      state,
      {
        type: 'delivery.decide',
        projectId: 'p1',
        deliveryId: 'd1',
        versionId: 'v1',
        decision: 'needs_changes',
        note: '',
      },
      client,
    );
    state = run(state, {
      type: 'delivery.publish',
      projectId: 'p1',
      deliveryId: 'd1',
      versionId: 'v2',
      title: 'Draft',
      note: 'v2',
      files: [],
    });
    expect(() =>
      run(
        state,
        {
          type: 'delivery.decide',
          projectId: 'p1',
          deliveryId: 'd1',
          versionId: 'v1',
          decision: 'needs_changes',
          note: '',
        },
        client,
      ),
    ).toThrow(/latest/i);
  });
  it('rejects received responses that contain no meaningful submission', () => {
    const state = setup();
    const r = state.projects[0].requests[0];
    r.status = 'received';
    r.response = { text: '  ', files: [], author: 'Client', submittedAt: now };
    expect(workspaceSchema.safeParse(state).success).toBe(false);
  });
  it('rejects finalized deadline agreements missing the client response', () => {
    const state = run(setup(), {
      type: 'deadline.propose',
      projectId: 'p1',
      id: 'dp1',
      dueDate: '2026-10-25',
      reason: 'Missing copy',
    });
    state.projects[0].deadlineProposals[0].status = 'accepted';
    expect(workspaceSchema.safeParse(state).success).toBe(false);
  });
  it('rejects unknown nested fields at the portal projection boundary', () => {
    const state = setup();
    Object.assign(state.projects[0].requests[0], { internalCredential: 'secret' });
    expect(() => portalProject(state.projects[0])).toThrow();
  });
  it('allows a client to decline a stale deadline proposal so another can be proposed', () => {
    let state = run(setup(), {
      type: 'deadline.propose',
      projectId: 'p1',
      id: 'dp1',
      dueDate: '2026-10-25',
      reason: 'Delay',
    });
    state = run(state, { type: 'project.update', projectId: 'p1', dueDate: '2026-10-23' });
    state = run(
      state,
      { type: 'deadline.respond', projectId: 'p1', proposalId: 'dp1', accepted: false },
      client,
    );
    state = run(state, {
      type: 'deadline.propose',
      projectId: 'p1',
      id: 'dp2',
      dueDate: '2026-10-27',
      reason: 'Agreed new scope',
    });
    expect(state.projects[0].deadlineProposals.map((p) => p.status)).toEqual([
      'rejected',
      'pending',
    ]);
    expect(state.projects[0].dueDate).toBe('2026-10-23');
  });
  it.each(['requests', 'deliveries', 'events'] as const)(
    'rejects %s overflow without dropping retained records',
    (collection) => {
      const state = setup();
      const p = state.projects[0];
      if (collection === 'requests')
        p.requests = Array.from({ length: 200 }, (_, i) => ({ ...p.requests[0], id: `r${i}` }));
      if (collection === 'deliveries')
        p.deliveries = Array.from({ length: 100 }, (_, i) => ({
          id: `d${i}`,
          title: 'Draft',
          versions: [
            {
              id: 'v1',
              number: 1,
              note: 'Draft',
              files: [],
              publishedAt: now,
              publishedBy: 'owner',
              comments: [],
              decision: null,
            },
          ],
        }));
      if (collection === 'events')
        p.events = Array.from({ length: 500 }, (_, i) => ({
          id: `e${i}`,
          type: 'test',
          message: 'Recorded',
          author: 'owner',
          at: now,
          visibility: 'public',
        }));
      const command: Command =
        collection === 'deliveries'
          ? {
              type: 'delivery.publish',
              projectId: 'p1',
              deliveryId: 'extra',
              title: 'Draft',
              versionId: 'v1',
              note: 'draft',
              files: [],
            }
          : {
              type: 'request.create',
              projectId: 'p1',
              id: 'extra',
              title: 'More copy',
              instructions: '',
              requestType: 'text',
              dueDate: null,
            };
      expect(() => run(state, command)).toThrow();
      expect(p[collection]).toHaveLength(
        collection === 'requests' ? 200 : collection === 'deliveries' ? 100 : 500,
      );
    },
  );
  it('rejects version and comment overflow', () => {
    const state = run(setup(), {
      type: 'delivery.publish',
      projectId: 'p1',
      deliveryId: 'd1',
      versionId: 'v1',
      title: 'Draft',
      note: 'Draft',
      files: [],
    });
    const d = state.projects[0].deliveries[0];
    d.versions = Array.from({ length: 50 }, (_, i) => ({
      ...d.versions[0],
      id: `v${i}`,
      number: i + 1,
    }));
    expect(() =>
      run(state, {
        type: 'delivery.publish',
        projectId: 'p1',
        deliveryId: 'd1',
        versionId: 'extra',
        title: 'Draft',
        note: 'Draft',
        files: [],
      }),
    ).toThrow();
    const comments = run(setup(), {
      type: 'delivery.publish',
      projectId: 'p1',
      deliveryId: 'd1',
      versionId: 'v1',
      title: 'Draft',
      note: 'Draft',
      files: [],
    });
    comments.projects[0].deliveries[0].versions[0].comments = Array.from(
      { length: 200 },
      (_, i) => ({ id: `c${i}`, body: 'Feedback', author: 'Client', at: now }),
    );
    expect(() =>
      run(
        comments,
        {
          type: 'delivery.comment',
          projectId: 'p1',
          deliveryId: 'd1',
          versionId: 'v1',
          id: 'extra',
          body: 'More',
        },
        client,
      ),
    ).toThrow();
  });
  it('rejects project overflow and payloads over the total state byte limit', () => {
    const state = setup();
    state.projects = Array.from({ length: 500 }, (_, i) => ({ ...state.projects[1], id: `p${i}` }));
    expect(() =>
      run(state, {
        type: 'project.create',
        id: 'extra',
        clientId: 'c1',
        title: 'Extra',
        description: '',
        revisionAllowance: 0,
        dueDate: null,
      }),
    ).toThrow();
    const huge = setup();
    huge.projects = Array.from({ length: 500 }, (_, i) => ({
      ...huge.projects[1],
      id: `p${i}`,
      description: '文'.repeat(10000),
    }));
    expect(workspaceSchema.safeParse(huge).success).toBe(false);
  });
});
describe('remaining transitions and derived outputs', () => {
  it('advances enabled pending reminders without accepting backward dates or client claims', () => {
    let state = run(setup(), {
      type: 'request.reminder.advance',
      projectId: 'p1',
      requestId: 'r1',
      nextDueDate: '2026-10-17',
    });
    expect(state.projects[0].requests[0].reminder?.nextDueDate).toBe('2026-10-17');
    expect(() =>
      run(state, {
        type: 'request.reminder.advance',
        projectId: 'p1',
        requestId: 'r1',
        nextDueDate: '2026-10-16',
      }),
    ).toThrow();
    expect(() =>
      run(
        state,
        {
          type: 'request.reminder.advance',
          projectId: 'p1',
          requestId: 'r1',
          nextDueDate: '2026-10-24',
        },
        client,
      ),
    ).toThrow(/authorized/i);
    state = run(
      state,
      { type: 'request.submit', projectId: 'p1', requestId: 'r1', text: 'Copy', files: [] },
      client,
    );
    expect(() =>
      run(state, {
        type: 'request.reminder.advance',
        projectId: 'p1',
        requestId: 'r1',
        nextDueDate: '2026-10-24',
      }),
    ).toThrow();
  });
  it('allows client quote and deadline rejection without changing the original deadline', () => {
    let state = run(
      setup(),
      {
        type: 'change.request',
        projectId: 'p1',
        id: 'ch1',
        title: 'Add page',
        description: 'One new page',
      },
      client,
    );
    state = run(state, {
      type: 'change.quote',
      projectId: 'p1',
      changeId: 'ch1',
      amountCents: 0,
      currency: 'EUR',
      dueDate: null,
      note: 'Courtesy',
    });
    state = run(
      state,
      { type: 'change.respond', projectId: 'p1', changeId: 'ch1', accepted: false },
      client,
    );
    state = run(state, {
      type: 'deadline.propose',
      projectId: 'p1',
      id: 'dp1',
      dueDate: '2026-10-25',
      reason: 'Copy delayed',
    });
    state = run(
      state,
      { type: 'deadline.respond', projectId: 'p1', proposalId: 'dp1', accepted: false },
      client,
    );
    expect(state.projects[0]).toMatchObject({
      dueDate: '2026-10-20',
      changes: [{ status: 'rejected' }],
      deadlineProposals: [{ status: 'rejected' }],
    });
  });
  it('permits deleting private notes without exposing their events in the portal', () => {
    let state = run(setup(), { type: 'note.add', projectId: 'p1', id: 'n1', body: 'Confidential' });
    state = run(state, { type: 'note.delete', projectId: 'p1', noteId: 'n1' });
    expect(state.projects[0].internalNotes).toEqual([]);
    expect(portalProject(state.projects[0]).events.some((e) => e.type.startsWith('note.'))).toBe(
      false,
    );
  });
  it('returns only scoped projects and their clients to contractors', () => {
    const result = memberWorkspace(setup(), ['p1']);
    expect(result.projects.map((p) => p.id)).toEqual(['p1']);
    expect(result.clients.map((c) => c.id)).toEqual(['c1']);
    expect(result.templates).toEqual([]);
  });
  it('shows zero remaining and explicit extras when allowance is exhausted', () => {
    expect(revisionSummary({ revisionAllowance: 2, revisionUsed: 3 })).toEqual({
      included: 2,
      used: 3,
      remaining: 0,
      extra: 1,
    });
    expect(revisionSummary({ revisionAllowance: 2, revisionUsed: 1 })).toEqual({
      included: 2,
      used: 1,
      remaining: 1,
      extra: 0,
    });
  });
  it('formats cents as currency without accepting a fractional or unsafe amount', () => {
    expect(formatMoney(25000, 'USD')).toBe('$250.00');
    expect(formatMoney(0, 'EUR')).toBe('€0.00');
    expect(() => formatMoney(1.5, 'USD')).toThrow();
  });
  it('preserves the final cent at the largest safe integer amount', () => {
    expect(formatMoney(9007199254740991, 'USD')).toBe('$90,071,992,547,409.91');
  });
  it('groups open work into one weekly digest per client and omits inactive grants', () => {
    let state = setup();
    state = run(state, {
      type: 'project.create',
      id: 'p3',
      clientId: 'c1',
      title: 'Second site',
      description: '',
      revisionAllowance: 2,
      dueDate: null,
    });
    state = run(state, {
      type: 'request.create',
      projectId: 'p3',
      id: 'r3',
      title: 'Assets',
      instructions: '',
      requestType: 'file',
      dueDate: null,
    });
    const digests = weeklyDigest(state, '2026-10-10', ['p1', 'p3']);
    expect(digests).toHaveLength(1);
    expect(digests[0].projects.map((p) => p.projectId)).toEqual(['p1', 'p3']);
    expect(weeklyDigest(state, '2026-10-10', ['p3'])[0].projects.map((p) => p.projectId)).toEqual([
      'p3',
    ]);
    state = run(state, { type: 'project.archive', projectId: 'p3', archived: true });
    expect(weeklyDigest(state, '2026-10-10', ['p3'])).toEqual([]);
  });
  it('lets the owner pause weekly digests in workspace settings', () => {
    const state = run(setup(), { type: 'settings.update', weeklyDigest: false });
    expect(weeklyDigest(state, '2026-10-10', ['p1'])).toEqual([]);
  });
  it('exports validated full account data while handover remains a readonly projection', () => {
    const state = run(setup(), { type: 'note.add', projectId: 'p1', id: 'n1', body: 'Private' });
    expect(JSON.parse(exportWorkspaceJson(state)).projects[0].internalNotes[0].body).toBe(
      'Private',
    );
    expect(JSON.stringify(handoverProject(state.projects[0]))).not.toContain('Private');
  });
});
describe('CSV import integrity', () => {
  it('preserves status and archived flags when previewing an exported archive', () => {
    let state = run(setup(), { type: 'project.archive', projectId: 'p1', archived: true });
    state = run(state, { type: 'project.update', projectId: 'p2', status: 'completed' });
    const preview = parseProjectsCsv(exportProjectsCsv(state));
    const restored = run(emptyState('restore'), { type: 'projects.import', rows: preview.rows });
    expect(restored.projects[0].archived).toBe(true);
    expect(restored.projects[1].status).toBe('completed');
  });
  it('rejects contradictory identities for the same client email in one preview', () => {
    const preview = parseProjectsCsv(
      'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\nSite,Asha,asha@example.test,Field,,,2\nIdentity,Mallory,asha@example.test,Other,,,2',
    );
    expect(preview.rows).toEqual([]);
    expect(preview.errors.length).toBeGreaterThan(0);
  });
  it('refuses duplicate existing projects without partially adding another row', () => {
    const state = setup();
    const rows = parseProjectsCsv(
      'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\nNew,Client,client@example.test,Studio,,,2\np1,Client,client@example.test,Studio,,,2',
    ).rows;
    expect(() => run(state, { type: 'projects.import', rows })).toThrow(/duplicate/i);
    expect(state.projects.map((p) => p.title)).toEqual(['p1', 'p2']);
  });
  it('rejects excess CSV rows rather than silently discarding them', () => {
    const text =
      'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\n' +
      Array.from(
        { length: 501 },
        (_, i) => `Project ${i},Client,client@example.test,Studio,,,2`,
      ).join('\n');
    expect(parseProjectsCsv(text).errors[0].message).toContain('500');
  });
});
