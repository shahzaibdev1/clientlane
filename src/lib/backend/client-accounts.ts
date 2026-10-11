import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { applyCommand, commandSchema, dateSchema, portalProject, workspaceSchema } from '../domain';
import { encryptToken, hashToken, newToken } from './crypto';
import { Backend, check, dbError } from './service';
export const briefSchema = z.strictObject({
  providerEmail: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  clientName: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  dueDate: dateSchema.nullable(),
});
export type ClientBrief = z.input<typeof briefSchema>;
export type AcceptedInvitation = {
  workspaceId: string;
  projectId: string;
  direction: 'client' | 'provider';
};
export type ClientProjectView = Awaited<ReturnType<ClientAccounts['loadProject']>>;
export type ClientProjectSummary = {
  workspaceId: string;
  projectId: string;
  studio: string;
  title: string;
  dueDate: string | null;
  archived: boolean;
  status: string;
  nextActions: number;
};
export type AccountInvitation = {
  id: string;
  direction: 'client' | 'provider';
  email: string;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  dueDate: string | null;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'declined' | 'expired';
};
type InviteRow = {
  id: string;
  direction: 'client' | 'provider';
  sender_id: string;
  email: string;
  workspace_id: string | null;
  project_id: string | null;
  client_id: string | null;
  client_email: string;
  brief: ClientBrief | null;
  expires_at: string;
  revoked_at: string | null;
  declined_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};
export class ClientAccounts {
  constructor(public backend: Backend) {}
  async identity(user: string) {
    const identity = await this.backend.user(user);
    check(identity.email_confirmed_at && identity.email, 'A confirmed email is required.');
    return identity;
  }
  async access(user: string, workspaceId: string, projectId: string) {
    const result = await this.backend.db.rpc('read_client_project', {
      p_user: user,
      p_workspace: z.uuid().parse(workspaceId),
      p_project: z.string().min(1).max(120).parse(projectId),
    });
    dbError(result.error);
    check(result.data, 'Client project access denied.');
    const row: Awaited<ReturnType<Backend['row']>> = {
      ...result.data.row,
      state: workspaceSchema.parse(result.data.row.state),
    };
    const project = row.state.projects.find((p) => p.id === projectId);
    check(project, 'Client project access denied.');
    return { row, project, accessId: String(result.data.accessId) };
  }
  async loadProject(user: string, workspaceId: string, projectId: string) {
    const { row, project } = await this.access(user, workspaceId, projectId);
    const { brandName, brandColor, logoUrl, currency } = row.state.settings;
    return {
      project: portalProject(project),
      settings: { brandName, brandColor, logoUrl, currency },
      version: row.version,
    };
  }
  async listProjects(user: string): Promise<ClientProjectSummary[]> {
    await this.identity(user);
    const r = await this.backend.db
      .from('client_project_access')
      .select('workspace_id,project_id')
      .eq('user_id', user)
      .is('revoked_at', null);
    dbError(r.error);
    const projects: ClientProjectSummary[] = [];
    for (const a of r.data ?? []) {
      try {
        const v = await this.loadProject(user, a.workspace_id, a.project_id),
          p = v.project;
        projects.push({
          workspaceId: a.workspace_id,
          projectId: p.id,
          studio: v.settings.brandName,
          title: p.title,
          dueDate: p.dueDate,
          archived: p.archived,
          status: p.status,
          nextActions:
            p.archived || p.status === 'completed'
              ? 0
              : p.requests.filter((r) => r.status !== 'received').length +
                p.deliveries.filter((d) => !d.versions.at(-1)?.decision).length +
                p.changes.filter((c) => c.status === 'quoted').length +
                p.deadlineProposals.filter((d) => d.status === 'pending').length,
        });
      } catch (error) {
        if (!(error instanceof Error) || !/access denied/.test(error.message)) throw error;
      }
    }
    return projects;
  }
  async mutateProject(user: string, workspaceId: string, projectId: string, input: unknown) {
    const parsed = z
      .strictObject({ version: z.number().int().nonnegative(), command: commandSchema })
      .parse(input);
    const { row, project, accessId } = await this.access(user, workspaceId, projectId);
    const client = row.state.clients.find((c) => c.id === project.clientId)!;
    const actor = { role: 'client' as const, projectId, name: client.name };
    await this.backend.validateCommand(row, parsed.command, actor, accessId);
    if ('files' in parsed.command)
      for (const file of parsed.command.files)
        if (file.kind === 'upload') {
          const r = await this.backend.db
            .from('file_registry')
            .select('client_access_id,uploader_id')
            .eq('path', file.path)
            .single();
          dbError(r.error);
          check(
            r.data?.client_access_id === accessId && r.data.uploader_id === user,
            'File belongs to another client account.',
          );
        }
    const next = applyCommand(row.state, parsed.command, actor, new Date());
    const r = await this.backend.db.rpc('save_client_project', {
      p_user: user,
      p_workspace: workspaceId,
      p_project: projectId,
      p_version: parsed.version,
      p_state: next,
    });
    dbError(r.error);
    return this.loadProject(user, workspaceId, projectId);
  }
  async createInvite(input: Record<string, unknown>) {
    const token = newToken(),
      expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const r = await this.backend.db
      .from('client_account_invites')
      .insert({
        ...input,
        token_hash: hashToken(token),
        token_cipher: encryptToken(token),
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    dbError(r.error);
    return {
      id: String(r.data!.id),
      token,
      url: `${process.env.NEXT_PUBLIC_APP_URL}/client/invite/${token}`,
      expiresAt,
    };
  }
  async inviteClient(user: string, workspaceId: string, projectId: string) {
    const row = await this.backend.owned(user, workspaceId),
      project = row.state.projects.find((p) => p.id === projectId);
    check(project && !project.archived, 'Choose an active project.');
    const client = row.state.clients.find((c) => c.id === project.clientId)!;
    return this.createInvite({
      direction: 'client',
      sender_id: user,
      workspace_id: workspaceId,
      project_id: projectId,
      client_id: client.id,
      client_email: client.email.toLowerCase(),
      email: client.email.toLowerCase(),
    });
  }
  async inviteProvider(user: string, input: ClientBrief) {
    const identity = await this.identity(user),
      brief = briefSchema.parse(input);
    check(
      brief.providerEmail !== identity.email!.toLowerCase(),
      'Invite your provider’s email, rather than your own.',
    );
    return this.createInvite({
      direction: 'provider',
      sender_id: user,
      email: brief.providerEmail,
      client_email: identity.email!.toLowerCase(),
      brief,
    });
  }
  async inviteRow(token: string) {
    check(/^[A-Za-z0-9_-]{43}$/.test(token), 'Invitation expired or revoked.');
    const r = await this.backend.db
      .from('client_account_invites')
      .select('*')
      .eq('token_hash', hashToken(token))
      .maybeSingle();
    dbError(r.error);
    check(r.data, 'Invitation expired or revoked.');
    return r.data as InviteRow;
  }
  async summary(i: InviteRow): Promise<AccountInvitation> {
    let title = i.brief?.title ?? 'Client project',
      description = i.brief?.description ?? '',
      dueDate = i.brief?.dueDate ?? null;
    if (i.direction === 'client' && i.workspace_id) {
      const row = await this.backend.row(i.workspace_id),
        p = row.state.projects.find((p) => p.id === i.project_id);
      title = p?.title ?? 'Unavailable project';
      description = p?.description ?? '';
      dueDate = p?.dueDate ?? null;
    }
    return {
      id: i.id,
      direction: i.direction,
      email: i.email,
      workspaceId: i.workspace_id,
      projectId: i.project_id,
      title,
      description,
      dueDate,
      expiresAt: i.expires_at,
      status: i.revoked_at
        ? 'revoked'
        : i.declined_at
          ? 'declined'
          : i.accepted_at
            ? 'accepted'
            : Date.parse(i.expires_at) <= Date.now()
              ? 'expired'
              : 'pending',
    };
  }
  async preview(user: string, token: string): Promise<AccountInvitation> {
    await this.identity(user);
    check(/^[A-Za-z0-9_-]{43}$/.test(token), 'Invitation expired or revoked.');
    const result = await this.backend.db.rpc('read_client_account_invite', {
      p_user: user,
      p_hash: hashToken(token),
    });
    dbError(result.error);
    check(result.data, 'Invitation expired, declined or revoked.');
    return result.data as AccountInvitation;
  }
  async listInvites(user: string, workspaceId?: string, projectId?: string) {
    if (workspaceId) await this.backend.owned(user, workspaceId);
    let query = this.backend.db.from('client_account_invites').select('*');
    if (workspaceId) query = query.eq('workspace_id', workspaceId).eq('project_id', projectId!);
    else query = query.eq('sender_id', user);
    const r = await query.order('created_at', { ascending: false }).limit(100);
    dbError(r.error);
    return Promise.all((r.data ?? []).map((i) => this.summary(i as InviteRow)));
  }
  async accept(user: string, token: string): Promise<AcceptedInvitation> {
    const identity = await this.identity(user),
      i = await this.inviteRow(token);
    check(
      identity.email!.toLowerCase() === i.email.toLowerCase(),
      'Sign in with the invited email.',
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      let args = {};
      if (i.direction === 'provider' && !i.accepted_at) {
        const v = await this.backend.loadWorkspace(user),
          row = await this.backend.owned(user, v.state.workspaceId),
          brief = briefSchema.parse(i.brief);
        const clientId = randomUUID(),
          projectId = randomUUID(),
          actor = { role: 'owner' as const, id: user };
        let state = applyCommand(
          row.state,
          {
            type: 'client.create',
            id: clientId,
            name: brief.clientName,
            email: i.client_email,
            company: '',
          },
          actor,
          new Date(),
        );
        state = applyCommand(
          state,
          {
            type: 'project.create',
            id: projectId,
            clientId,
            title: brief.title,
            description: brief.description,
            dueDate: brief.dueDate,
            revisionAllowance: 2,
          },
          actor,
          new Date(),
        );
        args = {
          p_workspace: row.id,
          p_version: row.version,
          p_state: state,
          p_project: projectId,
          p_client: clientId,
        };
      }
      const r = await this.backend.db.rpc('accept_client_account_invite', {
        p_user: user,
        p_hash: hashToken(token),
        ...args,
      });
      if (r.error && /changed.*reload/i.test(r.error.message) && attempt < 2) continue;
      dbError(r.error);
      return r.data as AcceptedInvitation;
    }
    throw new Error('Workspace changed. Reload and try again.');
  }
  async decline(user: string, token: string) {
    await this.preview(user, token);
    const i = await this.inviteRow(token);
    const r = await this.backend.db
      .from('client_account_invites')
      .update({ declined_at: new Date().toISOString() })
      .eq('id', i.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .is('declined_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id');
    dbError(r.error);
    check(r.data?.length, 'Invitation expired, declined or revoked.');
  }
  async revokeInvite(user: string, id: string) {
    const r = await this.backend.db
      .from('client_account_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', z.uuid().parse(id))
      .eq('sender_id', user)
      .is('accepted_at', null)
      .select('id');
    dbError(r.error);
    check(r.data?.length, 'Pending invitation access denied.');
  }
  async revokeAccess(user: string, workspaceId: string, projectId: string) {
    const r = await this.backend.db.rpc('revoke_client_project', {
      p_owner: user,
      p_workspace: workspaceId,
      p_project: projectId,
    });
    dbError(r.error);
  }
}
