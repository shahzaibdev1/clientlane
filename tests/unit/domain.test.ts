import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyState,
  sampleState,
  portalProject,
  dashboard,
  reminderEligible,
  handoverProject,
  workspaceSchema,
  fileRefSchema,
  commandSchema,
  parseProjectsCsv,
  exportProjectsCsv,
} from '../../src/lib/domain';
import type { Actor, Command, WorkspaceState } from '../../src/lib/domain';

const owner: Actor = { role: 'owner', id: 'owner-1' };
const client: Actor = { role: 'client', projectId: 'p1', name: 'Asha' };
const member: Actor = { role: 'member', id: 'member-1', projectIds: ['p1'] };
const now = '2026-10-10T12:00:00.000Z';
function run(state: WorkspaceState, command: Command | unknown, actor: Actor = owner) {
  return applyCommand(state, command, actor, now);
}
function fixture() {
  let state = emptyState('w1');
  state = run(state, {
    type: 'client.create',
    id: 'c1',
    name: 'Asha',
    email: 'asha@example.test',
    company: 'Field',
  });
  state = run(state, {
    type: 'project.create',
    id: 'p1',
    clientId: 'c1',
    title: 'Website',
    description: 'New site',
    dueDate: '2026-10-20',
    revisionAllowance: 2,
  });
  return state;
}
function withRequest() {
  return run(fixture(), {
    type: 'request.create',
    projectId: 'p1',
    id: 'r1',
    title: 'Send copy',
    instructions: 'Final words',
    requestType: 'text',
    dueDate: '2026-10-09',
    reminder: { enabled: true, intervalDays: 3, nextDueDate: '2026-10-10' },
  });
}
function withDelivery() {
  return run(fixture(), {
    type: 'delivery.publish',
    projectId: 'p1',
    deliveryId: 'd1',
    title: 'Homepage',
    versionId: 'v1',
    note: 'First draft',
    files: [{ kind: 'link', name: 'Preview', url: 'https://example.test/preview' }],
  });
}

describe('workspace command boundary', () => {
  it('creates a project without mutating the supplied snapshot', () => {
    const before = emptyState('w1');
    const after = run(before, {
      type: 'client.create',
      id: 'c1',
      name: 'Asha',
      email: 'asha@example.test',
      company: '',
    });
    expect(before.clients).toEqual([]);
    expect(after.clients[0].name).toBe('Asha');
    expect(fixture().projects[0]).toMatchObject({
      title: 'Website',
      revisionUsed: 0,
      originalDueDate: '2026-10-20',
      archived: false,
    });
  });
  it('rejects unknown keys rather than carrying private data through projections', () => {
    expect(workspaceSchema.safeParse({ ...fixture(), leakedCredential: 'secret' }).success).toBe(
      false,
    );
    expect(
      commandSchema.safeParse({
        type: 'request.submit',
        projectId: 'p1',
        requestId: 'r1',
        text: 'Hi',
        files: [],
        actorName: 'Forged',
      }).success,
    ).toBe(false);
  });
  it('rejects impossible dates and unsafe money', () => {
    expect(() =>
      run(fixture(), { type: 'project.update', projectId: 'p1', dueDate: '2026-02-30' }),
    ).toThrow();
    expect(() =>
      run(fixture(), {
        type: 'project.create',
        id: 'p2',
        clientId: 'c1',
        title: 'Bad',
        description: '',
        dueDate: null,
        revisionAllowance: -1,
      }),
    ).toThrow();
    const state = run(
      fixture(),
      {
        type: 'change.request',
        projectId: 'p1',
        id: 'ch1',
        title: 'New page',
        description: 'Please add',
      },
      client,
    );
    expect(() =>
      run(state, {
        type: 'change.quote',
        projectId: 'p1',
        changeId: 'ch1',
        amountCents: Number.MAX_SAFE_INTEGER + 1,
        currency: 'USD',
        dueDate: '2026-10-30',
        note: '',
      }),
    ).toThrow();
  });
  it('enforces owner-only workspace changes and assigned member scope', () => {
    expect(() => run(fixture(), { type: 'settings.update', brandName: 'Hacked' }, member)).toThrow(
      /authorized|owner/i,
    );
    expect(() =>
      run(fixture(), { type: 'project.archive', projectId: 'p1', archived: true }, member),
    ).toThrow(/authorized|owner/i);
    expect(() =>
      run(
        withRequest(),
        { type: 'request.reopen', projectId: 'p1', requestId: 'r1' },
        { ...member, projectIds: [] },
      ),
    ).toThrow(/authorized|scope/i);
    expect(
      run(
        fixture(),
        { type: 'note.add', projectId: 'p1', id: 'n1', body: 'Private context' },
        member,
      ).projects[0].internalNotes[0].author,
    ).toBe('member-1');
  });
  it('prevents a client from acting on another project or internal commands', () => {
    expect(() =>
      run(
        withRequest(),
        { type: 'request.submit', projectId: 'p1', requestId: 'r1', text: 'Ready', files: [] },
        { ...client, projectId: 'p2' },
      ),
    ).toThrow(/authorized|scope/i);
    expect(() =>
      run(fixture(), { type: 'note.add', projectId: 'p1', id: 'n1', body: 'Leak' }, client),
    ).toThrow(/authorized/i);
    expect(() =>
      run(fixture(), { type: 'project.update', projectId: 'p1', title: 'Hacked' }, client),
    ).toThrow(/authorized/i);
  });
  it('enforces unique IDs, existing clients and bounded collection sizes', () => {
    expect(() =>
      run(fixture(), {
        type: 'client.create',
        id: 'c1',
        name: 'Duplicate',
        email: 'dup@example.test',
        company: '',
      }),
    ).toThrow();
    expect(() =>
      run(fixture(), {
        type: 'project.create',
        id: 'bad',
        clientId: 'missing',
        title: 'Bad',
        description: '',
        dueDate: null,
        revisionAllowance: 0,
      }),
    ).toThrow();
    const state = emptyState('w1');
    state.clients = Array.from({ length: 200 }, (_, i) => ({
      id: `c${i}`,
      name: `Client ${i}`,
      email: `c${i}@example.test`,
      company: '',
    }));
    expect(() =>
      run(state, {
        type: 'client.create',
        id: 'extra',
        name: 'Extra',
        email: 'extra@example.test',
        company: '',
      }),
    ).toThrow(/limit|200|large/i);
  });
  it('updates and safely deletes client and project records with explicit confirmation', () => {
    let state = run(fixture(), {
      type: 'client.update',
      clientId: 'c1',
      name: 'Asha Studio',
      company: 'Field Studio',
    });
    state = run(state, {
      type: 'project.update',
      projectId: 'p1',
      title: 'Site launch',
      status: 'waiting',
      assigneeId: 'm1',
    });
    expect(state.projects[0]).toMatchObject({
      title: 'Site launch',
      status: 'waiting',
      assigneeId: 'm1',
    });
    expect(() => run(state, { type: 'client.delete', clientId: 'c1', confirm: true })).toThrow(
      /project/i,
    );
    expect(() => run(state, { type: 'project.delete', projectId: 'p1', confirm: false })).toThrow();
    state = run(state, { type: 'project.delete', projectId: 'p1', confirm: true });
    expect(run(state, { type: 'client.delete', clientId: 'c1', confirm: true }).clients).toEqual(
      [],
    );
  });
});

describe('input requests and reminders', () => {
  it('records client identity from the authorized actor and stops chasing a received response', () => {
    const before = withRequest();
    expect(
      reminderEligible(before.projects[0], before.projects[0].requests[0], '2026-10-10', true),
    ).toBe(true);
    const state = run(
      before,
      { type: 'request.submit', projectId: 'p1', requestId: 'r1', text: 'Final copy', files: [] },
      client,
    );
    expect(state.projects[0].requests[0]).toMatchObject({
      status: 'received',
      response: { text: 'Final copy', author: 'Asha', submittedAt: now },
    });
    expect(
      reminderEligible(state.projects[0], state.projects[0].requests[0], '2026-10-10', true),
    ).toBe(false);
    expect(() =>
      run(
        state,
        { type: 'request.submit', projectId: 'p1', requestId: 'r1', text: 'Again', files: [] },
        client,
      ),
    ).toThrow();
  });
  it('supports rejection with a reason, reopened requests and paused schedules', () => {
    let state = run(
      withRequest(),
      { type: 'request.submit', projectId: 'p1', requestId: 'r1', text: 'Draft', files: [] },
      client,
    );
    state = run(state, {
      type: 'request.reject',
      projectId: 'p1',
      requestId: 'r1',
      reason: 'Please send final text',
    });
    expect(state.projects[0].requests[0]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Please send final text',
    });
    state = run(state, { type: 'request.reopen', projectId: 'p1', requestId: 'r1' });
    expect(state.projects[0].requests[0].status).toBe('pending');
    state = run(state, {
      type: 'request.update',
      projectId: 'p1',
      requestId: 'r1',
      reminder: { enabled: false, intervalDays: 7, nextDueDate: '2026-10-10' },
    });
    expect(
      reminderEligible(state.projects[0], state.projects[0].requests[0], '2026-10-10', true),
    ).toBe(false);
  });
  it('requires meaningful text or a validated file matching the request type', () => {
    expect(() =>
      run(
        withRequest(),
        { type: 'request.submit', projectId: 'p1', requestId: 'r1', text: '  ', files: [] },
        client,
      ),
    ).toThrow();
    const state = run(fixture(), {
      type: 'request.create',
      projectId: 'p1',
      id: 'r2',
      title: 'Logo',
      instructions: '',
      requestType: 'file',
      dueDate: null,
    });
    expect(() =>
      run(
        state,
        {
          type: 'request.submit',
          projectId: 'p1',
          requestId: 'r2',
          text: 'I will send it',
          files: [],
        },
        client,
      ),
    ).toThrow(/file/i);
    expect(
      run(
        state,
        {
          type: 'request.submit',
          projectId: 'p1',
          requestId: 'r2',
          text: '',
          files: [
            {
              kind: 'upload',
              path: 'w1/p1/logo.png',
              name: 'logo.png',
              size: 200,
              type: 'image/png',
            },
          ],
        },
        client,
      ).projects[0].requests[0].response?.files,
    ).toHaveLength(1);
  });
  it('pauses reminders for archived projects, future schedules and inactive grants', () => {
    let state = withRequest();
    const request = state.projects[0].requests[0];
    expect(reminderEligible(state.projects[0], request, '2026-10-09', true)).toBe(false);
    expect(reminderEligible(state.projects[0], request, '2026-10-10', false)).toBe(false);
    state = run(state, { type: 'project.archive', projectId: 'p1', archived: true });
    expect(reminderEligible(state.projects[0], request, '2026-10-10', true)).toBe(false);
    expect(() =>
      run(
        state,
        { type: 'request.submit', projectId: 'p1', requestId: 'r1', text: 'Late', files: [] },
        client,
      ),
    ).toThrow(/archive/i);
    expect(
      run(state, { type: 'project.archive', projectId: 'p1', archived: false }).projects[0]
        .archived,
    ).toBe(false);
  });
  it('deletes owner requests and suppresses invalid transitions', () => {
    expect(() =>
      run(withRequest(), {
        type: 'request.reject',
        projectId: 'p1',
        requestId: 'r1',
        reason: 'Bad',
      }),
    ).toThrow();
    expect(
      run(withRequest(), { type: 'request.delete', projectId: 'p1', requestId: 'r1' }).projects[0]
        .requests,
    ).toEqual([]);
  });
});

describe('delivery versions and agreements', () => {
  it('counts each requested revision once and preserves version snapshots', () => {
    const original = withDelivery();
    let state = run(
      original,
      {
        type: 'delivery.decide',
        projectId: 'p1',
        deliveryId: 'd1',
        versionId: 'v1',
        decision: 'needs_changes',
        note: 'Larger heading',
      },
      client,
    );
    expect(state.projects[0].revisionUsed).toBe(1);
    expect(state.projects[0].deliveries[0].versions[0].decision).toMatchObject({
      value: 'needs_changes',
      author: 'Asha',
      at: now,
    });
    const repeat = run(
      state,
      {
        type: 'delivery.decide',
        projectId: 'p1',
        deliveryId: 'd1',
        versionId: 'v1',
        decision: 'needs_changes',
        note: 'Larger heading',
      },
      client,
    );
    expect(repeat.projects[0].revisionUsed).toBe(1);
    expect(repeat.projects[0].events).toHaveLength(state.projects[0].events.length);
    state = run(state, {
      type: 'delivery.publish',
      projectId: 'p1',
      deliveryId: 'd1',
      title: 'Homepage',
      versionId: 'v2',
      note: 'Revised',
      files: [],
    });
    expect(state.projects[0].deliveries[0].versions[0].note).toBe('First draft');
    expect(original.projects[0].deliveries[0].versions[0].decision).toBeNull();
    expect(() =>
      run(
        state,
        {
          type: 'delivery.decide',
          projectId: 'p1',
          deliveryId: 'd1',
          versionId: 'v1',
          decision: 'approved',
          note: '',
        },
        client,
      ),
    ).toThrow(/latest|version/i);
    state = run(
      state,
      {
        type: 'delivery.decide',
        projectId: 'p1',
        deliveryId: 'd1',
        versionId: 'v2',
        decision: 'approved',
        note: '',
      },
      client,
    );
    expect(handoverProject(state.projects[0]).deliveries[0].version.id).toBe('v2');
  });
  it('does not allow replacing a final decision or selecting an old approved handover', () => {
    let state = run(
      withDelivery(),
      {
        type: 'delivery.decide',
        projectId: 'p1',
        deliveryId: 'd1',
        versionId: 'v1',
        decision: 'approved',
        note: '',
      },
      client,
    );
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
    ).toThrow(/decision/i);
    state = run(state, {
      type: 'delivery.publish',
      projectId: 'p1',
      deliveryId: 'd1',
      title: 'Homepage',
      versionId: 'v2',
      note: 'Optional alternate',
      files: [],
    });
    expect(handoverProject(state.projects[0]).deliveries).toEqual([]);
  });
  it('keeps version feedback separate and forbids forged authors', () => {
    const state = run(
      withDelivery(),
      {
        type: 'delivery.comment',
        projectId: 'p1',
        deliveryId: 'd1',
        versionId: 'v1',
        id: 'comment1',
        body: 'Looks good',
      },
      client,
    );
    expect(state.projects[0].deliveries[0].versions[0].comments[0]).toMatchObject({
      body: 'Looks good',
      author: 'Asha',
      at: now,
    });
    expect(() =>
      run(
        state,
        {
          type: 'delivery.comment',
          projectId: 'p1',
          deliveryId: 'd1',
          versionId: 'v1',
          id: 'comment1',
          body: 'Again',
        },
        client,
      ),
    ).toThrow();
  });
  it('handles client extra scope requests, owner quotes and explicit client agreement', () => {
    let state = run(
      fixture(),
      {
        type: 'change.request',
        projectId: 'p1',
        id: 'ch1',
        title: 'Pricing page',
        description: 'Add a page',
      },
      client,
    );
    expect(() =>
      run(
        state,
        { type: 'change.respond', projectId: 'p1', changeId: 'ch1', accepted: true },
        client,
      ),
    ).toThrow();
    state = run(state, {
      type: 'change.quote',
      projectId: 'p1',
      changeId: 'ch1',
      amountCents: 25000,
      currency: 'USD',
      dueDate: '2026-10-25',
      note: 'One page',
    });
    expect(() =>
      run(
        state,
        { type: 'change.respond', projectId: 'p1', changeId: 'ch1', accepted: true },
        owner,
      ),
    ).toThrow(/authorized/i);
    state = run(
      state,
      { type: 'change.respond', projectId: 'p1', changeId: 'ch1', accepted: true },
      client,
    );
    expect(state.projects[0].changes[0]).toMatchObject({
      status: 'accepted',
      response: { author: 'Asha', at: now },
      quote: { amountCents: 25000 },
    });
    expect(state.projects[0].dueDate).toBe('2026-10-20');
    expect(() =>
      run(state, {
        type: 'change.quote',
        projectId: 'p1',
        changeId: 'ch1',
        amountCents: 50000,
        currency: 'USD',
        dueDate: '2026-10-27',
        note: '',
      }),
    ).toThrow();
  });
  it('tracks delayed input and only changes a deadline after client acceptance', () => {
    let state = run(withRequest(), {
      type: 'deadline.propose',
      projectId: 'p1',
      id: 'dp1',
      dueDate: '2026-10-25',
      reason: 'Waiting for copy',
    });
    expect(state.projects[0].dueDate).toBe('2026-10-20');
    expect(dashboard(state, '2026-10-10').waiting[0].delayDays).toBe(1);
    state = run(
      state,
      { type: 'deadline.respond', projectId: 'p1', proposalId: 'dp1', accepted: true },
      client,
    );
    expect(state.projects[0]).toMatchObject({
      dueDate: '2026-10-25',
      originalDueDate: '2026-10-20',
    });
    expect(state.projects[0].deadlineProposals[0]).toMatchObject({
      status: 'accepted',
      previousDueDate: '2026-10-20',
      response: { author: 'Asha' },
    });
    expect(() =>
      run(
        state,
        { type: 'deadline.respond', projectId: 'p1', proposalId: 'dp1', accepted: false },
        client,
      ),
    ).toThrow();
  });
  it('rejects stale pending deadline agreements after an owner deadline edit', () => {
    let state = run(fixture(), {
      type: 'deadline.propose',
      projectId: 'p1',
      id: 'dp1',
      dueDate: '2026-10-25',
      reason: 'More time',
    });
    state = run(state, { type: 'project.update', projectId: 'p1', dueDate: '2026-10-23' });
    expect(() =>
      run(
        state,
        { type: 'deadline.respond', projectId: 'p1', proposalId: 'dp1', accepted: true },
        client,
      ),
    ).toThrow(/stale|deadline/i);
  });
});

describe('safe projections, templates and import', () => {
  it('projects public data explicitly, excludes private notes and copies nested arrays', () => {
    const state = run(withRequest(), {
      type: 'note.add',
      projectId: 'p1',
      id: 'n1',
      body: 'Secret pricing strategy',
    });
    const projected = portalProject(state.projects[0]);
    expect(JSON.stringify(projected)).not.toContain('Secret pricing strategy');
    expect(projected).not.toHaveProperty('internalNotes');
    expect(projected).not.toHaveProperty('assigneeId');
    projected.requests[0].title = 'Changed projection';
    expect(state.projects[0].requests[0].title).toBe('Send copy');
    expect(dashboard(state, '2026-10-10').today[0]).toMatchObject({
      projectId: 'p1',
      action: 'Follow up on Send copy',
    });
  });
  it('preserves custom template request and milestone definitions on project creation', () => {
    let state = run(fixture(), {
      type: 'template.save',
      id: 't1',
      name: 'Custom',
      description: 'Launch',
      revisionAllowance: 3,
      requests: [
        { title: 'Copy', instructions: 'Final copy', requestType: 'text', dueOffsetDays: 2 },
      ],
      milestones: [{ title: 'Launch', dueOffsetDays: 10 }],
    });
    state = run(state, {
      type: 'project.create',
      id: 'p2',
      clientId: 'c1',
      title: 'Launch',
      description: '',
      dueDate: null,
      revisionAllowance: 3,
      templateId: 't1',
    });
    expect(state.projects[1].requests[0]).toMatchObject({ title: 'Copy', dueDate: '2026-10-12' });
    expect(state.projects[1].milestones[0]).toMatchObject({
      title: 'Launch',
      dueDate: '2026-10-20',
      completed: false,
    });
    state = run(state, {
      type: 'milestone.update',
      projectId: 'p2',
      milestoneId: state.projects[1].milestones[0].id,
      completed: true,
    });
    expect(handoverProject(state.projects[1]).milestones[0].completed).toBe(true);
    expect(
      run(state, { type: 'template.delete', templateId: 't1' }).templates.some(
        (t) => t.id === 't1',
      ),
    ).toBe(false);
  });
  it('supports milestone CRUD and owner settings with safe brand URLs', () => {
    let state = run(fixture(), {
      type: 'milestone.create',
      projectId: 'p1',
      id: 'm1',
      title: 'Launch',
      dueDate: '2026-10-20',
    });
    state = run(state, { type: 'milestone.delete', projectId: 'p1', milestoneId: 'm1' });
    expect(state.projects[0].milestones).toEqual([]);
    state = run(state, {
      type: 'settings.update',
      brandName: 'Field Studio',
      brandColor: '#145A55',
      currency: 'PKR',
      logoUrl: 'https://example.test/logo.png',
    });
    expect(state.settings).toMatchObject({ brandName: 'Field Studio', currency: 'PKR' });
    expect(() => run(state, { type: 'settings.update', logoUrl: 'javascript:alert(1)' })).toThrow();
  });
  it('validates CSV preview before importing quoted multiline project names', () => {
    const preview = parseProjectsCsv(
      'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\r\n"Landing, launch",Asha,asha@example.test,Field,"Two\nlines",2026-10-20,2',
    );
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({
      title: 'Landing, launch',
      description: 'Two\nlines',
      revisionAllowance: 2,
    });
    const state = run(emptyState('w1'), { type: 'projects.import', rows: preview.rows });
    expect(state.projects[0].title).toBe('Landing, launch');
    expect(state.clients).toHaveLength(1);
    const invalid = parseProjectsCsv(
      'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\nBad,Asha,not-email,,,2026-02-30,-1',
    );
    expect(invalid.rows).toEqual([]);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
  it('reports malformed CSV, unknown headers, duplicate records and empty input', () => {
    expect(
      parseProjectsCsv(
        'title,clientName,clientEmail,description,dueDate,revisionAllowance\n"unclosed',
      ).errors.length,
    ).toBeGreaterThan(0);
    expect(parseProjectsCsv('title,password\nProject,secret').errors.length).toBeGreaterThan(0);
    expect(parseProjectsCsv('').errors.length).toBeGreaterThan(0);
    expect(
      parseProjectsCsv(
        'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\nSite,Asha,asha@example.test,,,2026-10-20,2\nSite,Asha,asha@example.test,,,2026-10-20,2',
      ).errors.length,
    ).toBeGreaterThan(0);
  });
  it('exports retained archived projects and neutralizes spreadsheet formula injection', () => {
    let state = run(fixture(), {
      type: 'project.update',
      projectId: 'p1',
      title: '=HYPERLINK("https://evil.test")',
    });
    state = run(state, { type: 'project.archive', projectId: 'p1', archived: true });
    const csv = exportProjectsCsv(state);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('true');
    expect(csv).not.toContain('internalNotes');
  });
  it('provides a valid separated rich sample workspace with useful next actions', () => {
    const state = sampleState('demo');
    expect(workspaceSchema.safeParse(state).success).toBe(true);
    expect(state.workspaceId).toBe('demo');
    expect(state.projects.length).toBeGreaterThan(1);
    expect(state.templates.length).toBeGreaterThanOrEqual(3);
    expect(dashboard(state, '2026-10-10').today.length).toBeGreaterThan(0);
  });
});

describe('private references and aggregate validation', () => {
  it.each(['text/html', 'image/svg+xml', 'application/x-msdownload', 'text/javascript'])(
    'rejects executable type %s',
    (type) => {
      expect(
        fileRefSchema.safeParse({ kind: 'upload', path: 'w1/p1/a', name: 'a', size: 10, type })
          .success,
      ).toBe(false);
    },
  );
  it('rejects oversized, traversal, cross-project and insecure external file references', () => {
    expect(
      fileRefSchema.safeParse({
        kind: 'upload',
        path: 'w1/p1/../a.png',
        name: 'a.png',
        size: 10,
        type: 'image/png',
      }).success,
    ).toBe(false);
    expect(
      fileRefSchema.safeParse({
        kind: 'upload',
        path: 'w1/p1/a.png',
        name: 'a.png',
        size: 20 * 1024 * 1024 + 1,
        type: 'image/png',
      }).success,
    ).toBe(false);
    expect(
      fileRefSchema.safeParse({ kind: 'link', name: 'Bad', url: 'http://example.test' }).success,
    ).toBe(false);
    expect(() =>
      run(
        withRequest(),
        {
          type: 'request.submit',
          projectId: 'p1',
          requestId: 'r1',
          text: '',
          files: [
            { kind: 'upload', path: 'w2/p1/a.png', name: 'a.png', size: 10, type: 'image/png' },
          ],
        },
        client,
      ),
    ).toThrow(/path|project/i);
  });
  it('rejects aggregate revision mismatches, missing relations and unknown nested fields', () => {
    const state = fixture();
    state.projects[0].revisionUsed = 10;
    expect(workspaceSchema.safeParse(state).success).toBe(false);
    const missing = fixture();
    missing.projects[0].clientId = 'missing';
    expect(workspaceSchema.safeParse(missing).success).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...fixture(),
        settings: { ...fixture().settings, smtpPassword: 'secret' },
      }).success,
    ).toBe(false);
  });
});
