import { afterAll, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { Backend } from '../../src/lib/backend/service';
import { Files } from '../../src/lib/backend/files';
import { Mail } from '../../src/lib/backend/mail';
import type { Command } from '../../src/lib/domain';
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const backend = new Backend(db),
  files = new Files(backend),
  users: string[] = [],
  paths: string[] = [],
  queueIds: string[] = [];
async function accounts() {
  const module = await import('../../src/lib/backend/client-accounts').catch(() => null);
  expect(module?.ClientAccounts, 'ClientAccounts capability service must exist').toBeTypeOf(
    'function',
  );
  return new module!.ClientAccounts(backend);
}
async function user(confirmed = true) {
  const email = `account-${randomUUID()}@example.test`;
  const result = await db.auth.admin.createUser({
    email,
    password: 'Accounts-password-741!',
    email_confirm: confirmed,
  });
  if (result.error) throw result.error;
  users.push(result.data.user.id);
  return { id: result.data.user.id, email };
}
async function mutate(id: string, command: Command) {
  const v = await backend.loadWorkspace(id);
  return backend.mutateWorkspace(id, { version: v.version, command });
}
async function fixture(existingClient?: Awaited<ReturnType<typeof user>>) {
  const client = existingClient ?? (await user());
  const owner = await user();
  const v = await mutate(owner.id, {
    type: 'projects.import',
    rows: [
      {
        clientName: 'Account Client',
        clientEmail: client.email,
        company: '',
        title: 'Account Project',
        description: 'Shared brief',
        dueDate: null,
        revisionAllowance: 2,
      },
    ],
  });
  return { owner, client, workspaceId: v.state.workspaceId, projectId: v.state.projects[0].id };
}
afterAll(async () => {
  if (queueIds.length) {
    const removed = await db.from('mail_queue').delete().in('id', queueIds);
    if (removed.error) throw removed.error;
  }
  if (paths.length) {
    const removed = await db.storage.from('clientlane-private').remove(paths);
    if (removed.error) throw removed.error;
    for (const path of paths)
      expect((await db.storage.from('clientlane-private').download(path)).error).not.toBeNull();
  }
  for (const id of users) {
    const deleted = await db.auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
    expect((await db.from('workspaces').select('id').eq('owner_id', id)).data).toEqual([]);
  }
});
test('provider invite grants no pending access, requires confirmed exact recipient, isolates client projection and commands', async () => {
  const a = await accounts(),
    f = await fixture(),
    wrong = await user();
  const invite = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  expect(await a.listProjects(f.client.id)).toEqual([]);
  await expect(a.loadProject(f.client.id, f.workspaceId, f.projectId)).rejects.toThrow(/access/i);
  await expect(a.accept(wrong.id, invite.token)).rejects.toThrow(/email|recipient/i);
  await mutate(f.owner.id, {
    type: 'note.add',
    projectId: f.projectId,
    id: 'private',
    body: 'Private studio secret',
  });
  await a.accept(f.client.id, invite.token);
  const view = await a.loadProject(f.client.id, f.workspaceId, f.projectId);
  expect(JSON.stringify(view)).not.toContain('Private studio secret');
  expect(view.project).not.toHaveProperty('internalNotes');
  await expect(backend.loadWorkspace(f.client.id, f.workspaceId)).rejects.toThrow(/access/i);
  await expect(
    a.mutateProject(f.client.id, f.workspaceId, f.projectId, {
      version: view.version,
      command: { type: 'project.update', projectId: f.projectId, title: 'Stolen' },
    }),
  ).rejects.toThrow(/authorized|client/i);
  const unconfirmed = await user(false),
    g = await fixture(unconfirmed);
  const pending = await a.inviteClient(g.owner.id, g.workspaceId, g.projectId);
  await expect(a.accept(unconfirmed.id, pending.token)).rejects.toThrow(/confirmed/i);
});
test('multiple providers and dual-role account retain independent workspace and project scope', async () => {
  const a = await accounts(),
    client = await user(),
    f = await fixture(client),
    g = await fixture(client);
  for (const item of [f, g])
    await a.accept(
      client.id,
      (await a.inviteClient(item.owner.id, item.workspaceId, item.projectId)).token,
    );
  expect((await a.listProjects(client.id)).map((p) => p.workspaceId).sort()).toEqual(
    [f.workspaceId, g.workspaceId].sort(),
  );
  const own = await backend.loadWorkspace(client.id);
  expect(own.role).toBe('owner');
  expect(own.state.projects).toEqual([]);
  await expect(a.loadProject(f.owner.id, g.workspaceId, g.projectId)).rejects.toThrow(/access/i);
});
test('revoke invalidates stale invite and account files while bearer link remains independent; fresh invite restores deliberately', async () => {
  const a = await accounts(),
    f = await fixture();
  const invite = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.accept(f.client.id, invite.token);
  const stale = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  const portal = await backend.createPortalLink(f.owner.id, f.workspaceId, f.projectId);
  await a.revokeAccess(f.owner.id, f.workspaceId, f.projectId);
  await expect(a.accept(f.client.id, stale.token)).rejects.toThrow(/revoked/i);
  await expect(a.loadProject(f.client.id, f.workspaceId, f.projectId)).rejects.toThrow(/access/i);
  expect((await backend.loadPortal(portal.token)).project.id).toBe(f.projectId);
  const fresh = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.accept(f.client.id, fresh.token);
  await backend.revokePortal(f.owner.id, f.workspaceId, f.projectId);
  expect((await a.loadProject(f.client.id, f.workspaceId, f.projectId)).project.id).toBe(
    f.projectId,
  );
});
test('client brief accepts atomically and concurrently once, rejects wrong recipients and stale versions', async () => {
  const a = await accounts(),
    client = await user(),
    provider = await user(),
    wrong = await user();
  const invite = await a.inviteProvider(client.id, {
    providerEmail: provider.email,
    clientName: 'Client Initiator',
    title: 'Client originated project',
    description: 'Real project brief',
    dueDate: '2026-12-01',
  });
  expect(await a.listProjects(client.id)).toEqual([]);
  await expect(a.accept(wrong.id, invite.token)).rejects.toThrow(/email|recipient/i);
  const [first, second] = await Promise.all([
    a.accept(provider.id, invite.token),
    a.accept(provider.id, invite.token),
  ]);
  expect(second).toEqual(first);
  const w = await backend.loadWorkspace(provider.id);
  expect(w.state.projects.map((p) => p.title)).toEqual(['Client originated project']);
  expect(w.state.clients.map((c) => c.email)).toEqual([client.email]);
  expect((await a.listProjects(client.id)).map((p) => p.projectId)).toEqual([first.projectId]);
  await a.revokeAccess(provider.id, first.workspaceId, first.projectId);
  await expect(a.accept(provider.id, invite.token)).rejects.toThrow(/revoked/i);
});
test('declined, revoked, expired and deleted-project invitations never restore a capability', async () => {
  const a = await accounts(),
    f = await fixture();
  const declined = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.decline(f.client.id, declined.token);
  await expect(a.accept(f.client.id, declined.token)).rejects.toThrow(/declined|revoked/i);
  const expired = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await db
    .from('client_account_invites')
    .update({ expires_at: new Date(0).toISOString() })
    .eq('id', expired.id);
  await expect(a.accept(f.client.id, expired.token)).rejects.toThrow(/expired/i);
  const deleted = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.accept(f.client.id, deleted.token);
  await mutate(f.owner.id, { type: 'project.delete', projectId: f.projectId, confirm: true });
  expect(await a.listProjects(f.client.id)).toEqual([]);
  await expect(a.accept(f.client.id, deleted.token)).rejects.toThrow(/revoked|exists/i);
  const brief = await a.inviteProvider(f.client.id, {
    providerEmail: f.owner.email,
    clientName: 'Client',
    title: 'Brief',
    description: 'Description',
    dueDate: null,
  });
  await a.revokeInvite(f.client.id, brief.id);
  await expect(a.accept(f.owner.id, brief.token)).rejects.toThrow(/revoked/i);
});
test('account file uploads use client-only attachment projection and current scope, ownership and revocation checks', async () => {
  const a = await accounts(),
    f = await fixture(),
    other = await user();
  await a.accept(f.client.id, (await a.inviteClient(f.owner.id, f.workspaceId, f.projectId)).token);
  await mutate(f.owner.id, {
    type: 'request.create',
    projectId: f.projectId,
    id: 'source',
    title: 'Source',
    instructions: '',
    requestType: 'file',
    dueDate: null,
    reminder: null,
  });
  const actor = { userId: f.client.id, workspaceId: f.workspaceId, clientAccount: true };
  const file = await files.upload(
    actor,
    f.projectId,
    new File(['client bytes'], 'source.txt', { type: 'text/plain' }),
  );
  paths.push(file.path);
  await expect(files.download(actor, file.path)).rejects.toThrow(/public|shared/i);
  const v = await a.loadProject(f.client.id, f.workspaceId, f.projectId);
  await a.mutateProject(f.client.id, f.workspaceId, f.projectId, {
    version: v.version,
    command: {
      type: 'request.submit',
      projectId: f.projectId,
      requestId: 'source',
      text: '',
      files: [file],
    },
  });
  expect(await (await files.download(actor, file.path)).text()).toBe('client bytes');
  await expect(
    files.download({ userId: other.id, clientAccount: true }, file.path),
  ).rejects.toThrow(/access/i);
  await a.revokeAccess(f.owner.id, f.workspaceId, f.projectId);
  await expect(files.download(actor, file.path)).rejects.toThrow(/access/i);
  await expect(
    a.mutateProject(f.client.id, f.workspaceId, f.projectId, {
      version: v.version,
      command: {
        type: 'request.submit',
        projectId: f.projectId,
        requestId: 'source',
        text: '',
        files: [file],
      },
    }),
  ).rejects.toThrow(/access/i);
});
test('account invitation mail reuses the queue, has recipient-specific links and cancels revoked briefs', async () => {
  const a = await accounts(),
    f = await fixture(),
    mail = new Mail(backend);
  const invite = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  const queued = await mail.sendAccountInvite(f.owner.id, invite.id);
  queueIds.push(queued.id);
  const job = (await db.from('mail_queue').select('*').eq('id', queued.id).single()).data;
  const content = await mail.content(job);
  expect(content?.to).toBe(f.client.email);
  expect(content?.text).toContain(invite.url);
  await expect(mail.sendAccountInvite(f.client.id, invite.id)).rejects.toThrow(/access/i);
  const brief = await a.inviteProvider(f.client.id, {
    providerEmail: f.owner.email,
    clientName: 'Initiator',
    title: 'Mail brief',
    description: 'Safe brief',
    dueDate: null,
  });
  const b = await mail.sendAccountInvite(f.client.id, brief.id);
  queueIds.push(b.id);
  const briefJob = (await db.from('mail_queue').select('*').eq('id', b.id).single()).data;
  expect((await mail.content(briefJob))?.to).toBe(f.owner.email);
  await a.revokeInvite(f.client.id, brief.id);
  expect(await mail.content(briefJob)).toBeNull();
  await db.from('mail_queue').delete().in('id', [queued.id, b.id]);
});
test('local SMTP accepts account invitations and queued expired, revoked and declined invitations cancel before sending', async () => {
  expect(['127.0.0.1', 'localhost']).toContain(process.env.SMTP_HOST);
  const a = await accounts(),
    f = await fixture(),
    mail = new Mail(backend);
  const live = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  const sent = await mail.sendAccountInvite(f.owner.id, live.id);
  queueIds.push(sent.id);
  const cancelled: string[] = [];
  for (const state of ['expired', 'revoked', 'declined']) {
    const i = await a.inviteProvider(f.client.id, {
      providerEmail: f.owner.email,
      clientName: 'Client',
      title: state,
      description: 'Local mail fixture',
      dueDate: null,
    });
    const job = await mail.sendAccountInvite(f.client.id, i.id);
    queueIds.push(job.id);
    cancelled.push(job.id);
    if (state === 'expired')
      await db
        .from('client_account_invites')
        .update({ expires_at: new Date(0).toISOString() })
        .eq('id', i.id);
    if (state === 'revoked') await a.revokeInvite(f.client.id, i.id);
    if (state === 'declined') await a.decline(f.owner.id, i.token);
  }
  await mail.run();
  expect((await mail.status(sent.id)).status).toBe('sent');
  for (const id of cancelled) expect((await mail.status(id)).status).toBe('cancelled');
});
test('account client feedback, revision decisions, extra-work and deadline agreements persist through shared command policy', async () => {
  const a = await accounts(),
    f = await fixture();
  await a.accept(f.client.id, (await a.inviteClient(f.owner.id, f.workspaceId, f.projectId)).token);
  await mutate(f.owner.id, {
    type: 'delivery.publish',
    projectId: f.projectId,
    deliveryId: 'work',
    versionId: 'v1',
    title: 'Work',
    note: 'Review',
    files: [],
  });
  let v = await a.loadProject(f.client.id, f.workspaceId, f.projectId);
  const clientCommand = async (command: Command) => {
    v = await a.mutateProject(f.client.id, f.workspaceId, f.projectId, {
      version: v.version,
      command,
    });
  };
  await clientCommand({
    type: 'delivery.comment',
    projectId: f.projectId,
    deliveryId: 'work',
    versionId: 'v1',
    id: 'feedback',
    body: 'Please adjust spacing',
  });
  await clientCommand({
    type: 'delivery.decide',
    projectId: f.projectId,
    deliveryId: 'work',
    versionId: 'v1',
    decision: 'needs_changes',
    note: 'Adjust spacing',
  });
  expect(v.project.revisionUsed).toBe(1);
  await clientCommand({
    type: 'change.request',
    projectId: f.projectId,
    id: 'extra',
    title: 'Extra asset',
    description: 'Add a banner',
  });
  await mutate(f.owner.id, {
    type: 'change.quote',
    projectId: f.projectId,
    changeId: 'extra',
    amountCents: 12500,
    currency: 'USD',
    dueDate: null,
    note: 'Banner quote',
  });
  v = await a.loadProject(f.client.id, f.workspaceId, f.projectId);
  await clientCommand({
    type: 'change.respond',
    projectId: f.projectId,
    changeId: 'extra',
    accepted: true,
  });
  await mutate(f.owner.id, {
    type: 'deadline.propose',
    projectId: f.projectId,
    id: 'deadline',
    dueDate: '2026-12-15',
    reason: 'Extra scope',
  });
  v = await a.loadProject(f.client.id, f.workspaceId, f.projectId);
  await clientCommand({
    type: 'deadline.respond',
    projectId: f.projectId,
    proposalId: 'deadline',
    accepted: true,
  });
  expect(v.project.dueDate).toBe('2026-12-15');
  expect(v.project.changes[0].status).toBe('accepted');
  expect(v.project.deliveries[0].versions[0].comments[0].body).toBe('Please adjust spacing');
});
test('database commit rechecks revoked capability and invitation version, client email edits revoke rather than transfer access', async () => {
  const a = await accounts(),
    f = await fixture();
  const invite = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.accept(f.client.id, invite.token);
  const old = await backend.row(f.workspaceId);
  await a.revokeAccess(f.owner.id, f.workspaceId, f.projectId);
  const save = await db.rpc('save_client_project', {
    p_user: f.client.id,
    p_workspace: f.workspaceId,
    p_project: f.projectId,
    p_version: old.version,
    p_state: old.state,
  });
  expect(save.error?.message).toMatch(/access/i);
  const fresh = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.accept(f.client.id, fresh.token);
  const replacement = await user();
  await mutate(f.owner.id, {
    type: 'client.update',
    clientId: old.state.projects[0].clientId,
    email: replacement.email,
  });
  expect(await a.listProjects(f.client.id)).toEqual([]);
  expect(await a.listProjects(replacement.id)).toEqual([]);
  await expect(a.accept(f.client.id, fresh.token)).rejects.toThrow(/revoked/i);
  await a.accept(
    replacement.id,
    (await a.inviteClient(f.owner.id, f.workspaceId, f.projectId)).token,
  );
  expect(await a.listProjects(replacement.id)).toHaveLength(1);
  const brief = await a.inviteProvider(f.client.id, {
    providerEmail: f.owner.email,
    clientName: 'Client',
    title: 'Stale brief',
    description: 'Brief',
    dueDate: null,
  });
  const current = await backend.row(f.workspaceId);
  const stale = await db.rpc('accept_client_account_invite', {
    p_user: f.owner.id,
    p_hash: (await import('../../src/lib/backend/crypto')).hashToken(brief.token),
    p_workspace: f.workspaceId,
    p_version: current.version - 1,
    p_state: current.state,
    p_project: 'new-project',
    p_client: 'new-client',
  });
  expect(stale.error?.message).toMatch(/changed.*reload/i);
  expect(
    (await db.from('client_account_invites').select('accepted_at').eq('id', brief.id).single()).data
      ?.accepted_at,
  ).toBeNull();
  expect(await backend.row(f.workspaceId)).toEqual(current);
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const signedIn = await anon.auth.signInWithPassword({
    email: f.client.email,
    password: 'Accounts-password-741!',
  });
  expect(signedIn.error).toBeNull();
  expect((await anon.from('client_project_access').select('*')).error).not.toBeNull();
  expect(
    (
      await anon.rpc('valid_client_access', {
        p_user: replacement.id,
        p_workspace: f.workspaceId,
        p_project: f.projectId,
      })
    ).error,
  ).not.toBeNull();
  for (const rpc of ['read_client_project', 'read_client_account_invite']) {
    const args =
      rpc === 'read_client_project'
        ? { p_user: f.client.id, p_workspace: f.workspaceId, p_project: f.projectId }
        : { p_user: f.client.id, p_hash: 'unavailable' };
    expect((await anon.rpc(rpc, args)).error?.code).toBe('42501');
  }
});
test('acceptance racing owner revocation cannot restore account access, and sample replacement never transfers old relationships', async () => {
  const a = await accounts(),
    f = await fixture();
  const invite = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  const raced = await Promise.allSettled([
    a.accept(f.client.id, invite.token),
    a.revokeAccess(f.owner.id, f.workspaceId, f.projectId),
  ]);
  expect(raced[1].status).toBe('fulfilled');
  expect(await a.listProjects(f.client.id)).toEqual([]);
  await expect(a.accept(f.client.id, invite.token)).rejects.toThrow(/revoked/i);
  await a.accept(f.client.id, (await a.inviteClient(f.owner.id, f.workspaceId, f.projectId)).token);
  const before = await backend.loadWorkspace(f.owner.id);
  await backend.loadSample(f.owner.id, { version: before.version, replace: true });
  expect(await a.listProjects(f.client.id)).toEqual([]);
  await expect(a.loadProject(f.client.id, f.workspaceId, f.projectId)).rejects.toThrow(/access/i);
});
test('revoked, declined and expired recipient previews cannot read current project details', async () => {
  const a = await accounts(),
    f = await fixture();
  const revoked = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.accept(f.client.id, revoked.token);
  await a.revokeAccess(f.owner.id, f.workspaceId, f.projectId);
  await mutate(f.owner.id, {
    type: 'project.update',
    projectId: f.projectId,
    description: 'New confidential detail after revocation',
  });
  await expect(a.preview(f.client.id, revoked.token)).rejects.toThrow(/revoked/i);
  const declined = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await a.decline(f.client.id, declined.token);
  await expect(a.preview(f.client.id, declined.token)).rejects.toThrow(/declined/i);
  const expired = await a.inviteClient(f.owner.id, f.workspaceId, f.projectId);
  await db
    .from('client_account_invites')
    .update({ expires_at: new Date(0).toISOString() })
    .eq('id', expired.id);
  await expect(a.preview(f.client.id, expired.token)).rejects.toThrow(/expired/i);
});
