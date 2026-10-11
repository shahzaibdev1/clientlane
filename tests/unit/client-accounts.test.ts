import { expect, test } from 'vitest';
import { safeNext } from '../../src/lib/auth/redirect';
import { briefSchema } from '../../src/lib/backend/client-accounts';
test('client project and invitation return paths survive auth while external and lookalike destinations are rejected', () => {
  expect(safeNext('/client')).toBe('/client');
  expect(safeNext('/client/invite/abc')).toBe('/client/invite/abc');
  expect(safeNext('/client/project/studio/project')).toBe('/client/project/studio/project');
  for (const path of [
    '/clientevil',
    '//evil.test/client',
    '/client\\evil',
    'https://evil.test/client',
    '/client%0a',
  ])
    expect(safeNext(path)).toBe('/app');
});
test('project briefs normalize provider email and reject missing text and invalid calendar dates', () => {
  const input = {
    providerEmail: 'Owner@Example.test',
    clientName: ' Client ',
    title: ' Brief ',
    description: ' Real scope ',
    dueDate: '2026-12-01',
  };
  expect(briefSchema.parse(input)).toEqual({
    providerEmail: 'owner@example.test',
    clientName: 'Client',
    title: 'Brief',
    description: 'Real scope',
    dueDate: '2026-12-01',
  });
  for (const patch of [
    { description: ' ' },
    { clientName: '' },
    { providerEmail: 'not-an-email' },
    { dueDate: '2026-02-30' },
    { title: 'a'.repeat(201) },
  ])
    expect(briefSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
