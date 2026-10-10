import { applyCommand } from './commands';
import { workspaceSchema } from './schema';
import type { Actor, Command, ProjectTemplate, WorkspaceState } from './types';

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'web-design',
    name: 'Website design',
    description: 'A clear path from content to launch.',
    revisionAllowance: 2,
    requests: [
      {
        title: 'Website content',
        instructions: 'Share your approved page copy and key calls to action.',
        requestType: 'text',
        dueOffsetDays: 3,
      },
      {
        title: 'Logo and brand assets',
        instructions: 'Upload your logo and brand guidelines.',
        requestType: 'file',
        dueOffsetDays: 3,
      },
    ],
    milestones: [
      { title: 'Direction approved', dueOffsetDays: 7 },
      { title: 'Website ready to launch', dueOffsetDays: 21 },
    ],
  },
  {
    id: 'branding',
    name: 'Brand identity',
    description: 'Gather context, review concepts, and hand over the final identity.',
    revisionAllowance: 3,
    requests: [
      {
        title: 'Brand brief',
        instructions: 'Who are you trying to reach, and what should your brand feel like?',
        requestType: 'text',
        dueOffsetDays: 2,
      },
    ],
    milestones: [
      { title: 'Concept chosen', dueOffsetDays: 7 },
      { title: 'Brand files delivered', dueOffsetDays: 14 },
    ],
  },
  {
    id: 'retainer',
    name: 'Monthly retainer',
    description: 'Keep regular work and approvals in one place.',
    revisionAllowance: 2,
    requests: [
      {
        title: 'This month’s priorities',
        instructions: 'List your three most useful outcomes for this month.',
        requestType: 'text',
        dueOffsetDays: 1,
      },
    ],
    milestones: [{ title: 'Monthly work reviewed', dueOffsetDays: 28 }],
  },
];
export function emptyState(workspaceId = 'workspace'): WorkspaceState {
  return workspaceSchema.parse({
    workspaceId,
    settings: {
      brandName: 'Your studio',
      brandColor: '#136F63',
      logoUrl: null,
      currency: 'USD',
      weeklyDigest: true,
    },
    clients: [],
    projects: [],
    templates: structuredClone(BUILTIN_TEMPLATES),
  });
}
export function sampleState(workspaceId = 'demo', date = '2026-10-10'): WorkspaceState {
  const now = `${date}T12:00:00.000Z`;
  const owner: Actor = { role: 'owner', id: 'demo-owner' };
  let state = emptyState(workspaceId);
  const run = (command: Command, actor: Actor = owner) => {
    state = applyCommand(state, command, actor, now);
  };
  run({ type: 'settings.update', brandName: 'Northline Studio', brandColor: '#136F63' });
  run({
    type: 'client.create',
    id: 'field',
    name: 'Asha Patel',
    email: 'asha@example.test',
    company: 'Field Coffee',
  });
  run({
    type: 'client.create',
    id: 'arc',
    name: 'Elliot Reed',
    email: 'elliot@example.test',
    company: 'Arc Architecture',
  });
  run({
    type: 'project.create',
    id: 'field-website',
    clientId: 'field',
    title: 'Field Coffee website',
    description: 'A welcoming website for a neighborhood coffee shop.',
    dueDate: '2026-10-24',
    revisionAllowance: 2,
    templateId: 'web-design',
  });
  run({
    type: 'request.create',
    projectId: 'field-website',
    id: 'menu',
    title: 'Final menu and opening hours',
    instructions: 'Share your final menu text and regular opening hours.',
    requestType: 'text',
    dueDate: date,
    reminder: { enabled: true, intervalDays: 3, nextDueDate: date },
  });
  run({
    type: 'delivery.publish',
    projectId: 'field-website',
    deliveryId: 'homepage',
    title: 'Homepage design',
    versionId: 'home-v1',
    note: 'A calm, welcoming direction with room for seasonal specials.',
    files: [{ kind: 'link', name: 'Design preview', url: 'https://example.com/design-preview' }],
  });
  run({
    type: 'note.add',
    projectId: 'field-website',
    id: 'note1',
    body: 'Keep the launch simple; offer seasonal menu updates after handover.',
  });
  run({
    type: 'project.create',
    id: 'arc-brand',
    clientId: 'arc',
    title: 'Arc brand identity',
    description: 'A thoughtful visual identity for a growing architecture practice.',
    dueDate: '2026-10-18',
    revisionAllowance: 3,
    templateId: 'branding',
  });
  run({
    type: 'delivery.publish',
    projectId: 'arc-brand',
    deliveryId: 'identity',
    title: 'Identity direction',
    versionId: 'identity-v1',
    note: 'Three connected shapes inspired by architectural plans.',
    files: [],
  });
  const client: Actor = { role: 'client', projectId: 'arc-brand', name: 'Elliot Reed' };
  run(
    {
      type: 'delivery.decide',
      projectId: 'arc-brand',
      deliveryId: 'identity',
      versionId: 'identity-v1',
      decision: 'needs_changes',
      note: 'Please try a warmer accent color.',
    },
    client,
  );
  run(
    {
      type: 'change.request',
      projectId: 'arc-brand',
      id: 'cards',
      title: 'Business card layout',
      description: 'Could we add a business card layout to the identity?',
    },
    client,
  );
  run({
    type: 'change.quote',
    projectId: 'arc-brand',
    changeId: 'cards',
    amountCents: 15000,
    currency: 'USD',
    dueDate: '2026-10-22',
    note: 'Includes print-ready front and back.',
  });
  return state;
}
