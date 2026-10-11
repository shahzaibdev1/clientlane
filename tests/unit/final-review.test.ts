import { expect, test } from 'vitest';
import {
  applyCommand,
  emptyState,
  sampleState,
  memberWorkspace,
  dashboard,
} from '../../src/lib/domain';
import type { Actor, Command, WorkspaceState } from '../../src/lib/domain';
const owner: Actor = { role: 'owner', id: 'owner' };
const now = '2026-10-11T12:00:00.000Z';
const run = (s: WorkspaceState, c: Command, a: Actor = owner) => applyCommand(s, c, a, now);
test('import after deletion never transfers the old member scope to another client', () => {
  const row = {
    clientName: 'A',
    clientEmail: 'a@example.test',
    company: '',
    title: 'Private A',
    description: '',
    dueDate: null,
    revisionAllowance: 2,
  };
  let s = run(emptyState('w'), { type: 'projects.import', rows: [row] });
  const deleted = s.projects[0].id;
  s = run(s, { type: 'project.delete', projectId: deleted, confirm: true });
  s = run(s, {
    type: 'projects.import',
    rows: [{ ...row, clientName: 'B', clientEmail: 'b@example.test', title: 'Private B' }],
  });
  expect(s.projects[0].id).not.toBe(deleted);
  expect(memberWorkspace(s, [deleted]).projects).toEqual([]);
});
test('a scoped member cannot quote; an owner quote remains acceptable by the client', () => {
  let s = sampleState();
  const p = s.projects[0];
  const client: Actor = { role: 'client', projectId: p.id, name: 'Client' };
  s = run(
    s,
    {
      type: 'change.request',
      projectId: p.id,
      id: 'extra',
      title: 'Extra',
      description: 'Extra work',
    },
    client,
  );
  const before = structuredClone(s);
  const quote: Command = {
    type: 'change.quote',
    projectId: p.id,
    changeId: 'extra',
    amountCents: 12000,
    currency: 'USD',
    dueDate: null,
    note: 'Scope',
  };
  expect(() => run(s, quote, { role: 'member', id: 'member', projectIds: [p.id] })).toThrow(
    /owner.*authorized/i,
  );
  expect(s).toEqual(before);
  s = run(s, quote);
  s = run(
    s,
    { type: 'change.respond', projectId: p.id, changeId: 'extra', accepted: true },
    client,
  );
  expect(s.projects[0].changes[0].status).toBe('accepted');
});
test('dashboard review actions exclude archived and completed projects', () => {
  const s = sampleState();
  s.projects[0].archived = true;
  s.projects[1].status = 'completed';
  expect(dashboard(s, '2026-10-11').waiting).toEqual([]);
});
