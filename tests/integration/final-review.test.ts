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
  mail = new Mail(backend);
const users: string[] = [],
  paths: string[] = [];
async function account() {
  const email = `final-${randomUUID()}@example.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: 'Test-password-734!',
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  return { id: data.user.id, email };
}
async function mutate(user: string, command: Command) {
  const v = await backend.loadWorkspace(user);
  return backend.mutateWorkspace(user, { version: v.version, command });
}
async function fixture() {
  const owner = await account();
  const v = await mutate(owner.id, {
    type: 'projects.import',
    rows: [
      {
        clientName: 'A',
        clientEmail: 'a@example.test',
        company: '',
        title: 'Private A',
        description: '',
        dueDate: null,
        revisionAllowance: 2,
      },
    ],
  });
  return { owner, workspaceId: v.state.workspaceId, projectId: v.state.projects[0].id };
}
afterAll(async () => {
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
test('delete/import prunes capabilities and registry, rejects reused IDs, and allows fresh invitations', async () => {
  const { owner, workspaceId, projectId } = await fixture();
  const member = await account(),
    pending = await account();
  const accepted = await mail.inviteMember(owner.id, workspaceId, member.email, [projectId]);
  await mail.acceptMemberInvite(member.id, accepted.token);
  const stale = await mail.inviteMember(owner.id, workspaceId, pending.email, [projectId]);
  const old = await files.upload(
    { userId: owner.id, workspaceId },
    projectId,
    new File(['private A'], 'a.txt', { type: 'text/plain' }),
  );
  paths.push(old.path);
  expect(await (await files.download({ userId: member.id, workspaceId }, old.path)).text()).toBe(
    'private A',
  );
  await mutate(owner.id, { type: 'project.delete', projectId, confirm: true });
  expect(
    (
      await db
        .from('memberships')
        .select('project_ids')
        .eq('workspace_id', workspaceId)
        .eq('user_id', member.id)
        .single()
    ).data?.project_ids,
  ).toEqual([]);
  expect(
    (
      await db
        .from('member_invites')
        .select('project_ids,revoked_at')
        .eq('id', stale.invitationId)
        .single()
    ).data?.revoked_at,
  ).toBeTruthy();
  expect((await db.from('file_registry').select('path').eq('path', old.path)).data).toEqual([]);
  const next = await mutate(owner.id, {
    type: 'projects.import',
    rows: [
      {
        clientName: 'B',
        clientEmail: 'b@example.test',
        company: '',
        title: 'Private B',
        description: '',
        dueDate: null,
        revisionAllowance: 2,
      },
    ],
  });
  const newId = next.state.projects[0].id;
  expect(newId).not.toBe(projectId);
  expect((await backend.loadWorkspace(member.id, workspaceId)).state.projects).toEqual([]);
  await expect(
    backend.mutateWorkspace(member.id, {
      workspaceId,
      version: next.version,
      command: { type: 'project.update', projectId: newId, title: 'Stolen' },
    }),
  ).rejects.toThrow(/scope|access/i);
  const freshFile = await files.upload(
    { userId: owner.id, workspaceId },
    newId,
    new File(['private B'], 'b.txt', { type: 'text/plain' }),
  );
  paths.push(freshFile.path);
  await expect(files.download({ userId: member.id, workspaceId }, freshFile.path)).rejects.toThrow(
    /access/i,
  );
  await expect(files.download({ userId: owner.id, workspaceId }, old.path)).rejects.toThrow(
    /access|found/i,
  );
  await expect(mail.acceptMemberInvite(pending.id, stale.token)).rejects.toThrow(/revoked/i);
  await expect(
    mutate(owner.id, {
      type: 'project.create',
      id: projectId,
      clientId: next.state.projects[0].clientId,
      title: 'Reused',
      description: '',
      dueDate: null,
      revisionAllowance: 2,
    }),
  ).rejects.toThrow(/identifier|identity|reused/i);
  const fresh = await mail.inviteMember(owner.id, workspaceId, pending.email, [newId]);
  await mail.acceptMemberInvite(pending.id, fresh.token);
  expect(
    (await backend.loadWorkspace(pending.id, workspaceId)).state.projects.map((p) => p.title),
  ).toEqual(['Private B']);
});
test('revoking a member atomically invalidates older invitations, while a fresh invitation restores access', async () => {
  const { owner, workspaceId, projectId } = await fixture();
  const member = await account();
  const first = await mail.inviteMember(owner.id, workspaceId, member.email, [projectId]);
  await mail.acceptMemberInvite(member.id, first.token);
  const stale = await mail.inviteMember(owner.id, workspaceId, member.email, [projectId]);
  const file = await files.upload(
    { userId: owner.id, workspaceId },
    projectId,
    new File(['private'], 'x.txt', { type: 'text/plain' }),
  );
  paths.push(file.path);
  await backend.revokeMember(owner.id, workspaceId, member.id);
  await expect(mail.acceptMemberInvite(member.id, stale.token)).rejects.toThrow(/revoked/i);
  await expect(files.download({ userId: member.id, workspaceId }, file.path)).rejects.toThrow(
    /access/i,
  );
  const fresh = await mail.inviteMember(owner.id, workspaceId, member.email, [projectId]);
  await mail.acceptMemberInvite(member.id, fresh.token);
  expect(await (await files.download({ userId: member.id, workspaceId }, file.path)).text()).toBe(
    'private',
  );
});
test('samples preserve customized settings and templates and replace projects with fresh identities', async () => {
  const owner = await account();
  await mutate(owner.id, {
    type: 'settings.update',
    brandName: 'Custom Studio',
    brandColor: '#112233',
    currency: 'PKR',
    weeklyDigest: false,
  });
  let v = await mutate(owner.id, {
    type: 'template.save',
    id: 'custom',
    name: 'Custom',
    description: 'Keep me',
    revisionAllowance: 7,
    requests: [],
    milestones: [],
  });
  const settings = structuredClone(v.state.settings),
    templates = structuredClone(v.state.templates);
  v = await backend.loadSample(owner.id, { version: v.version });
  expect(v.state.settings).toEqual(settings);
  expect(v.state.templates).toEqual(templates);
  const ids = v.state.projects.map((p) => p.id);
  const member = await account();
  const invite = await mail.inviteMember(owner.id, v.state.workspaceId, member.email, [ids[0]]);
  await mail.acceptMemberInvite(member.id, invite.token);
  const portal = await backend.createPortalLink(owner.id, v.state.workspaceId, ids[0]);
  v = await backend.loadSample(owner.id, { version: v.version, replace: true });
  expect(v.state.settings).toEqual(settings);
  expect(v.state.templates).toEqual(templates);
  expect(v.state.projects.every((p) => !ids.includes(p.id))).toBe(true);
  expect((await backend.loadWorkspace(member.id, v.state.workspaceId)).state.projects).toEqual([]);
  await expect(backend.loadPortal(portal.token)).rejects.toThrow(/revoked/i);
});
test('server rejects scoped member pricing without saving; owner quote and client acceptance persist', async () => {
  const { owner, workspaceId, projectId } = await fixture();
  const member = await account();
  const invite = await mail.inviteMember(owner.id, workspaceId, member.email, [projectId]);
  await mail.acceptMemberInvite(member.id, invite.token);
  const portal = await backend.createPortalLink(owner.id, workspaceId, projectId);
  let v = await backend.loadPortal(portal.token);
  v = await backend.mutatePortal(portal.token, {
    version: v.version,
    command: {
      type: 'change.request',
      projectId,
      id: 'extra',
      title: 'Extra',
      description: 'Extra work',
    },
  });
  const before = await backend.row(workspaceId);
  const quote: Command = {
    type: 'change.quote',
    projectId,
    changeId: 'extra',
    amountCents: 13000,
    currency: 'USD',
    dueDate: null,
    note: 'Quote',
  };
  await expect(
    backend.mutateWorkspace(member.id, { workspaceId, version: v.version, command: quote }),
  ).rejects.toThrow(/owner.*authorized/i);
  expect(await backend.row(workspaceId)).toEqual(before);
  await mutate(owner.id, quote);
  v = await backend.loadPortal(portal.token);
  v = await backend.mutatePortal(portal.token, {
    version: v.version,
    command: { type: 'change.respond', projectId, changeId: 'extra', accepted: true },
  });
  expect(v.project.changes[0].status).toBe('accepted');
});
