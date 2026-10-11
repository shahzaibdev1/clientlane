import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  applyCommand,
  commandSchema,
  emptyState,
  memberWorkspace,
  portalProject,
  sampleState,
  workspaceSchema,
  type Actor,
  type WorkspaceState,
} from '../domain';
import { encryptToken, hashToken, newToken } from './crypto';
export type WorkspaceView = {
  state: WorkspaceState;
  version: number;
  role: 'owner' | 'member';
  projectIds: string[];
  userId: string;
  userEmail: string;
  workspaces: { id: string; name: string; role: 'owner' | 'member' }[];
};
const mutation = z.strictObject({
  workspaceId: z.uuid().optional(),
  version: z.number().int().nonnegative(),
  command: commandSchema,
});
type Row = { id: string; owner_id: string; state: WorkspaceState; version: number };
export type Grant = {
  id: string;
  workspace_id: string;
  project_id: string;
  email: string;
  token_hash: string;
  token_cipher: string;
  expires_at: string;
  revoked_at: string | null;
};
export function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function dbError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export class Backend {
  constructor(public db: SupabaseClient) {}
  async row(id: string): Promise<Row> {
    const { data, error } = await this.db.from('workspaces').select('*').eq('id', id).single();
    dbError(error);
    check(data, 'Workspace access denied');
    return { ...data, state: workspaceSchema.parse(data.state) };
  }
  async user(id: string) {
    const { data, error } = await this.db.auth.admin.getUserById(id);
    dbError(error);
    check(data.user, 'Sign in to continue.');
    return data.user;
  }
  async actor(user: string, row: Row): Promise<Actor> {
    if (row.owner_id === user) return { role: 'owner', id: user };
    const { data, error } = await this.db
      .from('memberships')
      .select('project_ids')
      .eq('workspace_id', row.id)
      .eq('user_id', user)
      .is('revoked_at', null)
      .maybeSingle();
    dbError(error);
    check(data, 'Workspace access denied');
    return { role: 'member', id: user, projectIds: data.project_ids };
  }
  async owned(user: string, id: string) {
    const row = await this.row(id);
    check(row.owner_id === user, 'Owner access required');
    return row;
  }
  async loadWorkspace(user: string, workspaceId?: string): Promise<WorkspaceView> {
    const identity = await this.user(user);
    const ownedResult = await this.db
      .from('workspaces')
      .select('id')
      .eq('owner_id', user)
      .maybeSingle();
    dbError(ownedResult.error);
    let own = ownedResult.data;
    if (!own) {
      const id = randomUUID();
      const insert = await this.db
        .from('workspaces')
        .insert({ id, owner_id: user, state: emptyState(id) });
      if (insert.error?.code !== '23505') dbError(insert.error);
      const read = await this.db.from('workspaces').select('id').eq('owner_id', user).single();
      dbError(read.error);
      own = read.data;
    }
    check(own, 'Workspace access denied');
    const memberships = await this.db
      .from('memberships')
      .select('workspace_id')
      .eq('user_id', user)
      .is('revoked_at', null);
    dbError(memberships.error);
    const ids = [own.id, ...(memberships.data ?? []).map((m) => m.workspace_id)];
    check(ids.includes(workspaceId ?? own.id), 'Workspace access denied');
    const row = await this.row(workspaceId ?? own.id),
      actor = await this.actor(user, row);
    const choices = await this.db.from('workspaces').select('id,owner_id,state').in('id', ids);
    dbError(choices.error);
    return {
      state: actor.role === 'member' ? memberWorkspace(row.state, actor.projectIds) : row.state,
      version: row.version,
      role: actor.role as 'owner' | 'member',
      projectIds: actor.role === 'member' ? actor.projectIds : row.state.projects.map((p) => p.id),
      userId: user,
      userEmail: identity.email ?? '',
      workspaces: (choices.data ?? []).map((w) => ({
        id: w.id,
        name: w.state.settings.brandName,
        role: w.owner_id === user ? 'owner' : 'member',
      })),
    };
  }
  async validateCommand(
    row: Row,
    command: ReturnType<typeof commandSchema.parse>,
    actor: Actor,
    clientAccessId?: string,
  ) {
    if ('assigneeId' in command && command.assigneeId) {
      const result = await this.db
        .from('memberships')
        .select('project_ids')
        .eq('workspace_id', row.id)
        .eq('user_id', command.assigneeId)
        .is('revoked_at', null)
        .maybeSingle();
      dbError(result.error);
      const projectId =
        'projectId' in command ? command.projectId : 'id' in command ? command.id : '';
      check(
        result.data?.project_ids.includes(projectId),
        'Assignee must be an active member assigned to this project.',
      );
    }
    if ('files' in command)
      for (const file of command.files)
        if (file.kind === 'upload') {
          const result = await this.db
            .from('file_registry')
            .select('*')
            .eq('path', file.path)
            .eq('workspace_id', row.id)
            .eq('project_id', command.projectId)
            .maybeSingle();
          dbError(result.error);
          check(result.data, 'File is not registered for this project.');
          check(
            result.data.name === file.name &&
              result.data.size === file.size &&
              result.data.type === file.type,
            'File metadata does not match uploaded bytes.',
          );
          if (actor.role === 'client')
            check(
              result.data.grant_id !== null ||
                (clientAccessId && result.data.client_access_id === clientAccessId),
              'Client can only submit their uploaded files.',
            );
        }
  }
  async save(
    row: Row,
    version: number,
    state: WorkspaceState,
    user: string | null,
    grant: string | null,
  ) {
    const { data, error } = await this.db.rpc('save_workspace', {
      p_workspace: row.id,
      p_version: version,
      p_state: state,
      p_user: user,
      p_grant: grant,
    });
    dbError(error);
    return Number(data);
  }
  async mutateWorkspace(user: string, input: unknown): Promise<WorkspaceView> {
    const parsed = mutation.parse(input),
      view = await this.loadWorkspace(user, parsed.workspaceId),
      row = await this.row(view.state.workspaceId),
      actor = await this.actor(user, row);
    await this.validateCommand(row, parsed.command, actor);
    const next = applyCommand(row.state, parsed.command, actor, new Date());
    await this.save(row, parsed.version, next, user, null);
    return this.loadWorkspace(user, row.id);
  }
  async loadSample(
    user: string,
    input: { workspaceId?: string; version: number; replace?: boolean },
  ) {
    const view = await this.loadWorkspace(user, input.workspaceId),
      row = await this.owned(user, view.state.workspaceId);
    check(
      (!row.state.projects.length && !row.state.clients.length) || input.replace === true,
      'Confirm replacement before loading sample projects.',
    );
    const sample = sampleState(row.id, new Date().toISOString().slice(0, 10));
    // Replacing sample projects must never reactivate an older project capability.
    sample.projects = sample.projects.map((project) => ({ ...project, id: randomUUID() }));
    sample.settings = row.state.settings;
    sample.templates = row.state.templates;
    await this.save(row, input.version, sample, user, null);
    return this.loadWorkspace(user, row.id);
  }
  async grant(token: string): Promise<{ grant: Grant; row: Row }> {
    check(/^[A-Za-z0-9_-]{43}$/.test(token), 'Portal expired or revoked');
    const { data, error } = await this.db
      .from('portal_grants')
      .select('*')
      .eq('token_hash', hashToken(token))
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    dbError(error);
    check(data, 'Portal expired or revoked');
    const row = await this.row(data.workspace_id),
      project = row.state.projects.find((p) => p.id === data.project_id);
    check(project, 'Portal expired or revoked');
    check(
      row.state.clients.some(
        (c) => c.id === project.clientId && c.email.toLowerCase() === data.email.toLowerCase(),
      ),
      'Portal expired or revoked',
    );
    return { grant: data, row };
  }
  async loadPortal(token: string) {
    const { grant, row } = await this.grant(token),
      project = row.state.projects.find((p) => p.id === grant.project_id)!;
    return {
      project: portalProject(project),
      settings: {
        brandName: row.state.settings.brandName,
        brandColor: row.state.settings.brandColor,
        logoUrl: row.state.settings.logoUrl,
        currency: row.state.settings.currency,
      },
      version: row.version,
      expiresAt: grant.expires_at,
    };
  }
  async mutatePortal(token: string, input: unknown) {
    const parsed = z
      .strictObject({ version: z.number().int().nonnegative(), command: commandSchema })
      .parse(input);
    const { grant, row } = await this.grant(token),
      client = row.state.clients.find(
        (c) =>
          c.email.toLowerCase() === grant.email.toLowerCase() &&
          row.state.projects.some((p) => p.id === grant.project_id && p.clientId === c.id),
      )!;
    const actor: Actor = { role: 'client', projectId: grant.project_id, name: client.name };
    await this.validateCommand(row, parsed.command, actor);
    if ('files' in parsed.command)
      for (const f of parsed.command.files)
        if (f.kind === 'upload') {
          const record = await this.db
            .from('file_registry')
            .select('grant_id')
            .eq('path', f.path)
            .single();
          check(record.data?.grant_id === grant.id, 'File belongs to another portal grant.');
        }
    const next = applyCommand(row.state, parsed.command, actor, new Date());
    await this.save(row, parsed.version, next, null, grant.token_hash);
    return this.loadPortal(token);
  }
  async createPortalLink(user: string, workspaceId: string, projectId: string, expiryDays = 30) {
    const row = await this.owned(user, workspaceId),
      project = row.state.projects.find((p) => p.id === projectId);
    check(project && !project.archived, 'Choose an active project.');
    check(
      Number.isInteger(expiryDays) && expiryDays >= 1 && expiryDays <= 90,
      'Expiry must be between 1 and 90 days.',
    );
    const token = newToken(),
      cipher = encryptToken(token),
      expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString();
    const { data, error } = await this.db.rpc('rotate_portal_grant', {
      p_workspace: workspaceId,
      p_owner: user,
      p_project: projectId,
      p_hash: hashToken(token),
      p_cipher: cipher,
      p_expires: expiresAt,
    });
    dbError(error);
    return {
      id: String(data),
      token,
      url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/${token}`,
      expiresAt,
    };
  }
  async revokePortal(user: string, workspaceId: string, projectId: string) {
    const result = await this.db.rpc('revoke_access', {
      p_workspace: workspaceId,
      p_owner: user,
      p_project: projectId,
      p_member: null,
    });
    dbError(result.error);
  }
  async revokeMember(user: string, workspaceId: string, memberId: string) {
    const result = await this.db.rpc('revoke_access', {
      p_workspace: workspaceId,
      p_owner: user,
      p_project: null,
      p_member: memberId,
    });
    dbError(result.error);
  }
  async listMembers(user: string, workspaceId: string) {
    await this.owned(user, workspaceId);
    const [members, invites, grants] = await Promise.all([
      this.db
        .from('memberships')
        .select('user_id,email,project_ids,revoked_at')
        .eq('workspace_id', workspaceId),
      this.db
        .from('member_invites')
        .select('id,email,project_ids,expires_at,revoked_at,accepted_at')
        .eq('workspace_id', workspaceId),
      this.db
        .from('portal_grants')
        .select('id,project_id,email,expires_at,revoked_at')
        .eq('workspace_id', workspaceId),
    ]);
    for (const r of [members, invites, grants]) dbError(r.error);
    return {
      members: members.data ?? [],
      invitations: invites.data ?? [],
      grants: grants.data ?? [],
    };
  }
}
