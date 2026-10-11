import { actorSchema, commandSchema, dateSchema, timestampSchema, workspaceSchema } from './schema';
import type { Actor, Command, FileRef, Project, WorkspaceState } from './types';

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      'validation' | 'authorization' | 'transition' | 'not_found' = 'transition',
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
function check(
  condition: unknown,
  message: string,
  code: DomainError['code'] = 'transition',
): asserts condition {
  if (!condition) throw new DomainError(message, code);
}
function parse<T>(
  schema: {
    safeParse: (value: unknown) => {
      success: boolean;
      data?: T;
      error?: { issues: { message: string }[] };
    };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError(
      result.error?.issues.map((issue) => issue.message).join('; ') || 'Invalid data',
      'validation',
    );
  return result.data as T;
}
function find<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((item) => item.id === id);
  check(item, `${label} was not found`, 'not_found');
  return item;
}
function unique(items: { id: string }[], id: string) {
  check(!items.some((item) => item.id === id), 'That identifier is already used');
}
function updateFields(target: object, command: object, excluded: string[]) {
  for (const [key, value] of Object.entries(command))
    if (!excluded.includes(key)) Object.assign(target, { [key]: value });
}
function author(actor: Actor) {
  return actor.role === 'client' ? actor.name : actor.id;
}
function ownerOnly(actor: Actor) {
  check(actor.role === 'owner', 'Only the owner is authorized for this action', 'authorization');
}
function clientOnly(actor: Actor) {
  check(actor.role === 'client', 'Only the client is authorized for this action', 'authorization');
}
function validateRefs(state: WorkspaceState, project: Project, refs: FileRef[]) {
  for (const file of refs)
    if (file.kind === 'upload')
      check(
        file.path.startsWith(`${state.workspaceId}/${project.id}/`),
        'Private file path must belong to this project',
        'authorization',
      );
}
function nextId(items: { id: string }[], prefix: string): string {
  let n = items.length + 1;
  while (items.some((item) => item.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
export function addDays(date: string, days: number): string {
  dateSchema.parse(date);
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return dateSchema.parse(instant.toISOString().slice(0, 10));
}
function newProject(command: Extract<Command, { type: 'project.create' }>, now: string): Project {
  return {
    id: command.id,
    clientId: command.clientId,
    title: command.title,
    description: command.description,
    dueDate: command.dueDate,
    originalDueDate: command.dueDate,
    revisionAllowance: command.revisionAllowance,
    revisionUsed: 0,
    status: 'active',
    archived: false,
    assigneeId: command.assigneeId ?? null,
    createdAt: now,
    requests: [],
    deliveries: [],
    changes: [],
    milestones: [],
    deadlineProposals: [],
    events: [],
    internalNotes: [],
  };
}
const CLIENT_COMMANDS = new Set<Command['type']>([
  'request.submit',
  'delivery.comment',
  'delivery.decide',
  'change.request',
  'change.respond',
  'deadline.respond',
]);
const OWNER_PROJECT_COMMANDS = new Set<Command['type']>([
  'project.archive',
  'project.delete',
  'request.reminder.advance',
]);

/** Pure transaction. The service must supply actor identity from authenticated access, never client input. */
export function applyCommand(
  input: WorkspaceState,
  rawCommand: Command | unknown,
  rawActor: Actor,
  at: string | Date,
): WorkspaceState {
  const state: WorkspaceState = parse(workspaceSchema, input);
  const command: Command = parse(commandSchema, rawCommand);
  const actor: Actor = parse(actorSchema, rawActor);
  const now: string = parse(timestampSchema, at instanceof Date ? at.toISOString() : at);
  const actorName = author(actor);
  let project: Project | undefined;
  if ('projectId' in command) {
    project = find(state.projects, command.projectId, 'Project');
    if (actor.role === 'client') {
      check(
        actor.projectId === project.id && CLIENT_COMMANDS.has(command.type),
        'Client is not authorized for this project action',
        'authorization',
      );
    }
    if (actor.role === 'member') {
      check(
        actor.projectIds.includes(project.id),
        'Member is not authorized outside assigned project scope',
        'authorization',
      );
      check(
        !OWNER_PROJECT_COMMANDS.has(command.type),
        'Only the owner is authorized for this action',
        'authorization',
      );
    }
    if (CLIENT_COMMANDS.has(command.type) && command.type !== 'delivery.comment') clientOnly(actor);
    check(
      !project.archived || command.type === 'project.archive' || command.type === 'project.delete',
      'Archived projects are read only',
    );
  } else ownerOnly(actor);
  const event = (message: string, visibility: 'public' | 'internal' = 'public') => {
    if (project)
      project.events.push({
        id: nextId(project.events, 'event-'),
        type: command.type,
        message,
        author: actorName,
        at: now,
        visibility,
      });
  };
  switch (command.type) {
    case 'settings.update': {
      updateFields(state.settings, command, ['type']);
      break;
    }
    case 'client.create': {
      unique(state.clients, command.id);
      state.clients.push({
        id: command.id,
        name: command.name,
        email: command.email,
        company: command.company,
      });
      break;
    }
    case 'client.update': {
      const client = find(state.clients, command.clientId, 'Client');
      updateFields(client, command, ['type', 'clientId']);
      break;
    }
    case 'client.delete': {
      check(
        !state.projects.some((p) => p.clientId === command.clientId),
        'Delete the client projects before deleting this client',
      );
      find(state.clients, command.clientId, 'Client');
      state.clients = state.clients.filter((c) => c.id !== command.clientId);
      break;
    }
    case 'project.create': {
      unique(state.projects, command.id);
      find(state.clients, command.clientId, 'Client');
      project = newProject(command, now);
      if (command.templateId) {
        const template = find(state.templates, command.templateId, 'Template');
        project.requests = template.requests.map((r, index) => ({
          id: `request-${index + 1}`,
          title: r.title,
          instructions: r.instructions,
          requestType: r.requestType,
          dueDate: r.dueOffsetDays === null ? null : addDays(now.slice(0, 10), r.dueOffsetDays),
          status: 'pending',
          reminder: null,
          response: null,
          responseHistory: [],
          rejectionReason: null,
        }));
        project.milestones = template.milestones.map((m, index) => ({
          id: `milestone-${index + 1}`,
          title: m.title,
          dueDate: m.dueOffsetDays === null ? null : addDays(now.slice(0, 10), m.dueOffsetDays),
          completed: false,
        }));
      }
      state.projects.push(project);
      event('Project created');
      break;
    }
    case 'project.update': {
      check(project, 'Project was not found');
      if (command.clientId !== undefined)
        check(
          command.clientId === project.clientId,
          'Create a new project to change the client; existing delivery history belongs to the original client',
        );
      if (command.assigneeId !== undefined || command.revisionAllowance !== undefined)
        ownerOnly(actor);
      updateFields(project, command, ['type', 'projectId']);
      event('Project details updated');
      break;
    }
    case 'project.archive': {
      ownerOnly(actor);
      check(project, 'Project was not found');
      if (project.archived === command.archived) break;
      project.archived = command.archived;
      event(command.archived ? 'Project archived' : 'Project restored');
      break;
    }
    case 'project.delete': {
      ownerOnly(actor);
      state.projects = state.projects.filter((p) => p.id !== command.projectId);
      break;
    }
    case 'request.create': {
      check(project, 'Project was not found');
      unique(project.requests, command.id);
      project.requests.push({
        id: command.id,
        title: command.title,
        instructions: command.instructions,
        requestType: command.requestType,
        dueDate: command.dueDate,
        status: 'pending',
        reminder: command.reminder ?? null,
        response: null,
        responseHistory: [],
        rejectionReason: null,
      });
      event(`Requested ${command.title}`);
      break;
    }
    case 'request.update': {
      check(project, 'Project was not found');
      const request = find(project.requests, command.requestId, 'Request');
      check(
        request.status !== 'received' ||
          command.requestType === undefined ||
          command.requestType === request.requestType,
        'Reopen the request before changing its type',
      );
      updateFields(request, command, ['type', 'projectId', 'requestId']);
      event(`Updated ${request.title}`);
      break;
    }
    case 'request.delete': {
      check(project, 'Project was not found');
      find(project.requests, command.requestId, 'Request');
      project.requests = project.requests.filter((r) => r.id !== command.requestId);
      event('Request removed');
      break;
    }
    case 'request.submit': {
      check(project, 'Project was not found');
      const request = find(project.requests, command.requestId, 'Request');
      check(request.status !== 'received', 'This request has already been received');
      check(command.text.trim() || command.files.length, 'Add a response or a file');
      check(
        request.requestType !== 'file' || command.files.length > 0,
        'This request needs a file',
      );
      validateRefs(state, project, command.files);
      const response = {
        text: command.text,
        files: command.files,
        author: actorName,
        submittedAt: now,
      };
      request.response = response;
      request.responseHistory.push(response);
      request.status = 'received';
      request.rejectionReason = null;
      event(`Received ${request.title}`);
      break;
    }
    case 'request.reject': {
      check(project, 'Project was not found');
      const request = find(project.requests, command.requestId, 'Request');
      check(request.status === 'received', 'Only received requests can be rejected');
      request.status = 'rejected';
      request.rejectionReason = command.reason;
      event(`Changes requested for ${request.title}`);
      break;
    }
    case 'request.reopen': {
      check(project, 'Project was not found');
      const request = find(project.requests, command.requestId, 'Request');
      check(request.status !== 'pending', 'This request is already open');
      request.status = 'pending';
      request.response = null;
      request.rejectionReason = null;
      event(`Reopened ${request.title}`);
      break;
    }
    case 'request.reminder.advance': {
      check(project, 'Project was not found');
      const request = find(project.requests, command.requestId, 'Request');
      check(
        request.status !== 'received' && request.reminder?.enabled,
        'This request is not eligible for reminders',
      );
      check(command.nextDueDate > request.reminder.nextDueDate, 'Next reminder must move forward');
      request.reminder.nextDueDate = command.nextDueDate;
      break;
    }
    case 'delivery.publish': {
      check(project, 'Project was not found');
      check(command.note.trim() || command.files.length, 'A delivery needs a note or file');
      validateRefs(state, project, command.files);
      let delivery = project.deliveries.find((d) => d.id === command.deliveryId);
      if (!delivery) {
        delivery = { id: command.deliveryId, title: command.title, versions: [] };
        project.deliveries.push(delivery);
      }
      unique(delivery.versions, command.versionId);
      delivery.title = command.title;
      delivery.versions.push({
        id: command.versionId,
        number: delivery.versions.length + 1,
        note: command.note,
        files: command.files,
        publishedAt: now,
        publishedBy: actorName,
        comments: [],
        decision: null,
      });
      project.status = 'review';
      event(`Published ${delivery.title} version ${delivery.versions.length}`);
      break;
    }
    case 'delivery.comment': {
      check(project, 'Project was not found');
      const version = find(
        find(project.deliveries, command.deliveryId, 'Delivery').versions,
        command.versionId,
        'Version',
      );
      unique(version.comments, command.id);
      version.comments.push({ id: command.id, body: command.body, author: actorName, at: now });
      event('Feedback added to a delivery version');
      break;
    }
    case 'delivery.decide': {
      check(project, 'Project was not found');
      const delivery = find(project.deliveries, command.deliveryId, 'Delivery');
      const version = find(delivery.versions, command.versionId, 'Version');
      check(
        delivery.versions.at(-1)?.id === version.id,
        'Only the latest delivery version can receive a decision',
      );
      if (version.decision) {
        check(version.decision.value === command.decision, 'A final decision cannot be replaced');
        break;
      }
      version.decision = {
        value: command.decision,
        note: command.note,
        author: actorName,
        at: now,
      };
      if (command.decision === 'needs_changes') {
        project.revisionUsed++;
        project.status = 'active';
      }
      event(
        command.decision === 'approved'
          ? `Approved ${delivery.title}`
          : `Changes requested for ${delivery.title}`,
      );
      break;
    }
    case 'change.request': {
      check(project, 'Project was not found');
      unique(project.changes, command.id);
      project.changes.push({
        id: command.id,
        title: command.title,
        description: command.description,
        requestedBy: actorName,
        requestedAt: now,
        status: 'requested',
        quote: null,
        response: null,
      });
      event(`Extra work requested: ${command.title}`);
      break;
    }
    case 'change.quote': {
      ownerOnly(actor);
      check(project, 'Project was not found');
      const change = find(project.changes, command.changeId, 'Change request');
      check(
        change.status === 'requested',
        'A published quote cannot be replaced; create a new change request',
      );
      change.quote = {
        amountCents: command.amountCents,
        currency: command.currency,
        dueDate: command.dueDate,
        note: command.note,
        author: actorName,
        at: now,
      };
      change.status = 'quoted';
      event(`Quote proposed for ${change.title}`);
      break;
    }
    case 'change.respond': {
      check(project, 'Project was not found');
      const change = find(project.changes, command.changeId, 'Change request');
      check(change.status === 'quoted' && change.quote, 'This change has no pending quote');
      change.status = command.accepted ? 'accepted' : 'rejected';
      change.response = { author: actorName, at: now };
      event(`Quote ${command.accepted ? 'accepted' : 'declined'} for ${change.title}`);
      break;
    }
    case 'deadline.propose': {
      check(project, 'Project was not found');
      unique(project.deadlineProposals, command.id);
      check(
        !project.deadlineProposals.some((p) => p.status === 'pending'),
        'Respond to the pending deadline proposal first',
      );
      check(command.dueDate !== project.dueDate, 'Propose a different deadline');
      project.deadlineProposals.push({
        id: command.id,
        dueDate: command.dueDate,
        previousDueDate: project.dueDate,
        reason: command.reason,
        proposedBy: actorName,
        proposedAt: now,
        status: 'pending',
        response: null,
      });
      event('New project deadline proposed');
      break;
    }
    case 'deadline.respond': {
      check(project, 'Project was not found');
      const proposal = find(project.deadlineProposals, command.proposalId, 'Deadline proposal');
      check(
        proposal.status === 'pending',
        'This deadline proposal has already received a response',
      );
      if (command.accepted)
        check(
          proposal.previousDueDate === project.dueDate,
          'This deadline proposal is stale; the deadline has changed',
        );
      proposal.status = command.accepted ? 'accepted' : 'rejected';
      proposal.response = { author: actorName, at: now };
      if (command.accepted) project.dueDate = proposal.dueDate;
      event(command.accepted ? 'New deadline agreed' : 'New deadline declined');
      break;
    }
    case 'milestone.create': {
      check(project, 'Project was not found');
      unique(project.milestones, command.id);
      project.milestones.push({
        id: command.id,
        title: command.title,
        dueDate: command.dueDate,
        completed: false,
      });
      event(`Milestone added: ${command.title}`);
      break;
    }
    case 'milestone.update': {
      check(project, 'Project was not found');
      const milestone = find(project.milestones, command.milestoneId, 'Milestone');
      updateFields(milestone, command, ['type', 'projectId', 'milestoneId']);
      event(`Milestone updated: ${milestone.title}`);
      break;
    }
    case 'milestone.delete': {
      check(project, 'Project was not found');
      find(project.milestones, command.milestoneId, 'Milestone');
      project.milestones = project.milestones.filter((m) => m.id !== command.milestoneId);
      event('Milestone removed');
      break;
    }
    case 'note.add': {
      check(project, 'Project was not found');
      unique(project.internalNotes, command.id);
      project.internalNotes.push({
        id: command.id,
        body: command.body,
        author: actorName,
        at: now,
      });
      event('Internal note added', 'internal');
      break;
    }
    case 'note.delete': {
      check(project, 'Project was not found');
      find(project.internalNotes, command.noteId, 'Note');
      project.internalNotes = project.internalNotes.filter((n) => n.id !== command.noteId);
      event('Internal note removed', 'internal');
      break;
    }
    case 'template.save': {
      const template = {
        id: command.id,
        name: command.name,
        description: command.description,
        revisionAllowance: command.revisionAllowance,
        requests: command.requests,
        milestones: command.milestones,
      };
      const index = state.templates.findIndex((t) => t.id === command.id);
      if (index === -1) state.templates.push(template);
      else state.templates[index] = template;
      break;
    }
    case 'template.delete': {
      find(state.templates, command.templateId, 'Template');
      state.templates = state.templates.filter((t) => t.id !== command.templateId);
      break;
    }
    case 'projects.import': {
      const seen = new Set<string>();
      for (const row of command.rows) {
        const email = row.clientEmail.toLowerCase();
        const key = `${email}\u0000${row.title.toLowerCase()}`;
        check(
          !seen.has(key) &&
            !state.projects.some(
              (p) =>
                p.title.toLowerCase() === row.title.toLowerCase() &&
                state.clients.find((c) => c.id === p.clientId)?.email.toLowerCase() === email,
            ),
          'Duplicate project in import',
        );
        seen.add(key);
        let client = state.clients.find((c) => c.email.toLowerCase() === email);
        if (!client) {
          client = {
            id: nextId(state.clients, 'import-client-'),
            name: row.clientName,
            email: row.clientEmail,
            company: row.company,
          };
          state.clients.push(client);
        }
        check(
          client.name === row.clientName && client.company === row.company,
          'The client email belongs to a different name or company',
        );
        project = newProject(
          {
            type: 'project.create',
            id: crypto.randomUUID(),
            clientId: client.id,
            title: row.title,
            description: row.description,
            dueDate: row.dueDate,
            revisionAllowance: row.revisionAllowance,
          },
          now,
        );
        project.status = row.status ?? 'active';
        project.archived = row.archived ?? false;
        state.projects.push(project);
        event('Project imported');
      }
      break;
    }
  }
  return parse(workspaceSchema, state);
}
