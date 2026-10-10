import { dateSchema, projectSchema } from './schema';
import type {
  Currency,
  DashboardItem,
  PortalProject,
  Project,
  Request,
  WorkspaceState,
} from './types';

export function portalProject(input: Project): PortalProject {
  const project = projectSchema.parse(input);
  return structuredClone({
    id: project.id,
    title: project.title,
    description: project.description,
    dueDate: project.dueDate,
    originalDueDate: project.originalDueDate,
    status: project.status,
    archived: project.archived,
    revisionAllowance: project.revisionAllowance,
    revisionUsed: project.revisionUsed,
    requests: project.requests,
    deliveries: project.deliveries,
    changes: project.changes,
    milestones: project.milestones,
    deadlineProposals: project.deadlineProposals,
    events: project.events.filter((e) => e.visibility === 'public'),
  });
}
export function revisionSummary(project: Pick<Project, 'revisionAllowance' | 'revisionUsed'>) {
  return {
    included: project.revisionAllowance,
    used: project.revisionUsed,
    remaining: Math.max(0, project.revisionAllowance - project.revisionUsed),
    extra: Math.max(0, project.revisionUsed - project.revisionAllowance),
  };
}
export function delayDays(project: Project, date: string) {
  dateSchema.parse(date);
  const due = project.requests
    .filter((r) => r.status !== 'received' && r.dueDate && r.dueDate < date)
    .map((r) => r.dueDate!)
    .sort()[0];
  return due
    ? Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000)
    : 0;
}
export function reminderEligible(
  project: Project,
  request: Request,
  date: string,
  activeGrant = true,
): boolean {
  dateSchema.parse(date);
  return (
    activeGrant &&
    !project.archived &&
    project.status !== 'completed' &&
    request.status !== 'received' &&
    !!request.reminder?.enabled &&
    request.reminder.nextDueDate <= date
  );
}
export function dashboard(
  state: WorkspaceState,
  date: string,
  query = '',
): { today: DashboardItem[]; waiting: DashboardItem[]; upcoming: DashboardItem[] } {
  dateSchema.parse(date);
  const result: ReturnType<typeof dashboard> = { today: [], waiting: [], upcoming: [] };
  for (const project of state.projects) {
    if (project.archived || project.status === 'completed') continue;
    const clientName = state.clients.find((c) => c.id === project.clientId)?.name ?? '';
    if (
      query &&
      !`${project.title} ${clientName} ${project.description}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      continue;
    const base = {
      projectId: project.id,
      projectTitle: project.title,
      clientName,
      delayDays: delayDays(project, date),
    };
    const add = (
      action: string,
      dueDate: string | null,
      kind: DashboardItem['kind'],
      itemId: string,
      waiting = false,
    ) => {
      const item: DashboardItem = { ...base, action, dueDate, kind, itemId };
      if (waiting) result.waiting.push(item);
      if (dueDate && dueDate <= date) result.today.push(item);
      else if (dueDate) result.upcoming.push(item);
    };
    for (const r of project.requests)
      if (r.status !== 'received') add(`Follow up on ${r.title}`, r.dueDate, 'request', r.id, true);
    for (const d of project.deliveries) {
      const latest = d.versions.at(-1);
      if (!latest?.decision)
        add(`Await review of ${d.title}`, project.dueDate, 'delivery', d.id, true);
      else if (latest.decision.value === 'needs_changes')
        add(`Revise ${d.title}`, date, 'delivery', d.id);
    }
    for (const m of project.milestones)
      if (!m.completed) add(`Complete ${m.title}`, m.dueDate, 'milestone', m.id);
    for (const c of project.changes)
      if (c.status === 'requested') add(`Quote ${c.title}`, date, 'agreement', c.id);
      else if (c.status === 'quoted')
        add(`Await agreement on ${c.title}`, c.quote?.dueDate ?? null, 'agreement', c.id, true);
    if (project.dueDate) add(`Check ${project.title}`, project.dueDate, 'project', project.id);
  }
  const sort = (a: DashboardItem, b: DashboardItem) =>
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    a.projectTitle.localeCompare(b.projectTitle);
  result.today.sort(sort);
  result.waiting.sort(sort);
  result.upcoming.sort(sort);
  return result;
}
export function handoverProject(project: Project) {
  const publicProject = portalProject(project);
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    dueDate: project.dueDate,
    milestones: publicProject.milestones,
    changes: publicProject.changes,
    deadlineProposals: publicProject.deadlineProposals,
    deliveries: publicProject.deliveries.flatMap((d) => {
      const version = d.versions.at(-1);
      return version?.decision?.value === 'approved' ? [{ id: d.id, title: d.title, version }] : [];
    }),
  };
}
export function formatMoney(cents: number, currency: Currency, locale = 'en-US') {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new Error('Money must be a safe nonnegative integer number of cents');
  const amount = BigInt(cents);
  const fraction = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(amount % 100n);
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .formatToParts(amount / 100n)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}
export function memberWorkspace(state: WorkspaceState, projectIds: string[]): WorkspaceState {
  const projects = state.projects.filter((p) => projectIds.includes(p.id));
  return structuredClone({
    workspaceId: state.workspaceId,
    settings: state.settings,
    projects,
    clients: state.clients.filter((c) => projects.some((p) => p.clientId === c.id)),
    templates: [],
  });
}
export function weeklyDigest(state: WorkspaceState, date: string, activeProjectIds: string[]) {
  dateSchema.parse(date);
  if (!state.settings.weeklyDigest) return [];
  return state.clients.flatMap((client) => {
    const projects = state.projects.filter(
      (p) =>
        p.clientId === client.id &&
        activeProjectIds.includes(p.id) &&
        !p.archived &&
        p.status !== 'completed',
    );
    const work = projects.flatMap((p) => {
      const requests = p.requests
        .filter((r) => r.status !== 'received')
        .map((r) => ({ title: r.title, dueDate: r.dueDate }));
      const deliveries = p.deliveries
        .filter((d) => !d.versions.at(-1)?.decision)
        .map((d) => ({ title: d.title }));
      return requests.length || deliveries.length
        ? [{ projectId: p.id, title: p.title, requests, deliveries }]
        : [];
    });
    return work.length
      ? [{ clientId: client.id, email: client.email, name: client.name, projects: work }]
      : [];
  });
}
