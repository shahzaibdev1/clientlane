import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { Backend } from '../../src/lib/backend/service';
import { Files } from '../../src/lib/backend/files';
import { Mail } from '../../src/lib/backend/mail';
import { decryptToken } from '../../src/lib/backend/crypto';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const backend = new Backend(admin);
const files = new Files(backend),
  mail = new Mail(backend);
const users: string[] = [];
let owner: string, outsider: string, member: string, workspaceId: string;
async function account() {
  const email = `backend-${randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Test-password-734!',
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  return { id: data.user.id, email };
}
beforeAll(async () => {
  owner = (await account()).id;
  outsider = (await account()).id;
  member = (await account()).id;
});
afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
});
describe('real database authorization and persistence', () => {
  test('sample replacement requires confirmation when only clients exist', async () => {
    let view = await backend.loadWorkspace(outsider);
    view = await backend.mutateWorkspace(outsider, {
      version: view.version,
      command: {
        type: 'client.create',
        id: 'existing-client',
        name: 'Existing',
        email: 'existing@example.test',
        company: '',
      },
    });
    await expect(backend.loadSample(outsider, { version: view.version })).rejects.toThrow(
      /Confirm replacement/i,
    );
    expect((await backend.loadWorkspace(outsider)).state.clients[0].id).toBe('existing-client');
  });
  test('new owner gets an empty persistent workspace and outsider cannot load it', async () => {
    const initial = await backend.loadWorkspace(owner);
    expect(initial.state.projects).toEqual([]);
    workspaceId = initial.state.workspaceId;
    expect((await backend.loadWorkspace(owner)).state.workspaceId).toBe(workspaceId);
    await expect(backend.loadWorkspace(outsider, workspaceId)).rejects.toThrow(/access/i);
  });
  test('atomic expected version has one winner in a concurrent race', async () => {
    const initial = await backend.loadWorkspace(owner);
    const outcomes = await Promise.allSettled([
      backend.mutateWorkspace(owner, {
        workspaceId,
        version: initial.version,
        command: {
          type: 'client.create',
          id: 'client-a',
          name: 'A',
          email: 'a@example.test',
          company: '',
        },
      }),
      backend.mutateWorkspace(owner, {
        workspaceId,
        version: initial.version,
        command: {
          type: 'client.create',
          id: 'client-b',
          name: 'B',
          email: 'b@example.test',
          company: '',
        },
      }),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await backend.loadWorkspace(owner)).state.clients).toHaveLength(1);
  });
  test('anonymous callers cannot save or read another owner aggregate', async () => {
    const anonymous = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const saved = await anonymous.rpc('save_workspace', {
      p_workspace: workspaceId,
      p_version: 1,
      p_state: {},
      p_user: owner,
      p_grant: null,
    });
    expect(saved.error?.code).toBe('42501');
    const read = await anonymous.from('workspaces').select('*');
    expect(read.data ?? []).toEqual([]);
    expect(read.error?.code).toBe('42501');
  });
  test('members see assigned projects only and lose current access on revocation', async () => {
    const initial = await backend.loadWorkspace(owner);
    const clientId = initial.state.clients[0].id;
    let current = await backend.mutateWorkspace(owner, {
      workspaceId,
      version: initial.version,
      command: {
        type: 'project.create',
        id: 'project-a',
        clientId,
        title: 'Project A',
        description: '',
        dueDate: null,
        revisionAllowance: 2,
      },
    });
    current = await backend.mutateWorkspace(owner, {
      workspaceId,
      version: current.version,
      command: {
        type: 'project.create',
        id: 'project-b',
        clientId,
        title: 'Project B',
        description: '',
        dueDate: null,
        revisionAllowance: 1,
      },
    });
    const { error } = await admin.from('memberships').insert({
      workspace_id: workspaceId,
      user_id: member,
      email: 'member@example.test',
      project_ids: ['project-a'],
    });
    if (error) throw error;
    const scoped = await backend.loadWorkspace(member, workspaceId);
    expect(scoped.state.projects.map((p) => p.id)).toEqual(['project-a']);
    await expect(
      backend.mutateWorkspace(member, {
        workspaceId,
        version: current.version,
        command: { type: 'project.update', projectId: 'project-b', title: 'Stolen' },
      }),
    ).rejects.toThrow(/scope|access/i);
    await backend.revokeMember(owner, workspaceId, member);
    await expect(
      backend.mutateWorkspace(member, {
        workspaceId,
        version: current.version,
        command: { type: 'note.add', projectId: 'project-a', id: 'note-a', body: 'Late' },
      }),
    ).rejects.toThrow(/access/i);
  });
  test('portal hides notes and revocation prevents a stale token from mutating', async () => {
    const current = await backend.loadWorkspace(owner);
    await backend.mutateWorkspace(owner, {
      workspaceId,
      version: current.version,
      command: { type: 'note.add', projectId: 'project-a', id: 'secret', body: 'Internal only' },
    });
    const grant = await backend.createPortalLink(owner, workspaceId, 'project-a');
    const portal = await backend.loadPortal(grant.token);
    expect(JSON.stringify(portal)).not.toContain('Internal only');
    expect('internalNotes' in portal.project).toBe(false);
    await expect(
      backend.mutatePortal(grant.token, {
        version: portal.version,
        command: { type: 'note.add', projectId: 'project-a', id: 'forged', body: 'Hack' },
      }),
    ).rejects.toThrow(/authorized/i);
    await backend.revokePortal(owner, workspaceId, 'project-a');
    await expect(backend.loadPortal(grant.token)).rejects.toThrow(/expired|revoked/i);
  });
  test('file bytes roundtrip privately, unsupported content and forged references fail', async () => {
    const uploaded = await files.upload(
      { userId: owner, workspaceId },
      'project-a',
      new File(['hello private'], 'note.txt', { type: 'text/plain' }),
    );
    expect(await (await files.download({ userId: owner }, uploaded.path)).text()).toBe(
      'hello private',
    );
    await expect(files.download({ userId: outsider }, uploaded.path)).rejects.toThrow(/access/i);
    await expect(
      files.upload(
        { userId: owner, workspaceId },
        'project-a',
        new File(['<script>alert(1)</script>'], 'fake.png', { type: 'image/png' }),
      ),
    ).rejects.toThrow(/content|type/i);
    const current = await backend.loadWorkspace(owner);
    await expect(
      backend.mutateWorkspace(owner, {
        workspaceId,
        version: current.version,
        command: {
          type: 'delivery.publish',
          projectId: 'project-a',
          deliveryId: 'delivery',
          title: 'Work',
          versionId: 'v1',
          note: '',
          files: [{ ...uploaded, path: `${workspaceId}/project-a/not-real.txt` }],
        },
      }),
    ).rejects.toThrow(/registered/i);
    const grant = await backend.createPortalLink(owner, workspaceId, 'project-a');
    await expect(files.download({ token: grant.token }, uploaded.path)).rejects.toThrow(
      /public|access/i,
    );
    const published = await backend.mutateWorkspace(owner, {
      workspaceId,
      version: current.version,
      command: {
        type: 'delivery.publish',
        projectId: 'project-a',
        deliveryId: 'delivery',
        title: 'Work',
        versionId: 'v1',
        note: '',
        files: [uploaded],
      },
    });
    expect(published.state.projects[0].deliveries).toHaveLength(1);
    expect(await (await files.download({ token: grant.token }, uploaded.path)).text()).toBe(
      'hello private',
    );
    await backend.revokePortal(owner, workspaceId, 'project-a');
    await expect(files.download({ token: grant.token }, uploaded.path)).rejects.toThrow(
      /expired|revoked/i,
    );
  });
  test('email membership acceptance requires the confirmed invited email', async () => {
    const invitee = await account();
    const invite = await mail.inviteMember(owner, workspaceId, invitee.email, ['project-a']);
    await expect(mail.acceptMemberInvite(outsider, invite.token)).rejects.toThrow(/email/i);
    expect((await mail.acceptMemberInvite(invitee.id, invite.token)).workspaceId).toBe(workspaceId);
    expect(
      (await backend.loadWorkspace(invitee.id, workspaceId)).state.projects.map((p) => p.id),
    ).toEqual(['project-a']);
    const queued = await admin.from('mail_queue').select('payload').eq('workspace_id', workspaceId);
    expect(JSON.stringify(queued.data)).not.toContain(invite.token);
  });
  test('SMTP delivery is recorded only after a successful send and can recover failure', async () => {
    const queued = await mail.sendPortalInvite(owner, workspaceId, 'project-a');
    const original = process.env.SMTP_PORT;
    process.env.SMTP_PORT = '1';
    const failed = await mail.run();
    expect(failed.errors).toBeGreaterThan(0);
    const row = await admin.from('mail_queue').select('status').eq('id', queued.id).single();
    expect(row.data?.status).toBe('error');
    process.env.SMTP_PORT = original;
    await admin
      .from('mail_queue')
      .update({ next_attempt_at: new Date(0).toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('status', 'error');
    expect((await mail.run()).sent).toBeGreaterThan(0);
    const sent = await admin
      .from('mail_queue')
      .select('status,sent_at')
      .eq('id', queued.id)
      .single();
    expect(sent.data?.status).toBe('sent');
    expect(sent.data?.sent_at).toBeTruthy();
    const payload = await admin.from('mail_queue').select('payload').eq('id', queued.id).single();
    const grant = await admin
      .from('portal_grants')
      .select('token_cipher')
      .eq('id', payload.data!.payload.grantId)
      .single();
    const messages = await (await fetch('http://127.0.0.1:55324/api/v1/messages')).json();
    const deliveries = messages.messages.filter(
      (m: { Subject: string }) => m.Subject === 'Your project portal: Project A',
    );
    let delivered = false;
    for (const message of deliveries) {
      const content = await (
        await fetch(`http://127.0.0.1:55324/api/v1/message/${message.ID}`)
      ).json();
      if (content.Text.includes(decryptToken(grant.data!.token_cipher))) delivered = true;
    }
    expect(delivered).toBe(true);
  });
  test('invitation expiry and unconfirmed identities cannot acquire membership', async () => {
    const email = `unconfirmed-${randomUUID()}@example.test`;
    const unconfirmed = await admin.auth.admin.createUser({
      email,
      password: 'Test-password-734!',
      email_confirm: false,
    });
    if (unconfirmed.error) throw unconfirmed.error;
    users.push(unconfirmed.data.user.id);
    const invite = await mail.inviteMember(owner, workspaceId, email, ['project-a']);
    await expect(mail.acceptMemberInvite(unconfirmed.data.user.id, invite.token)).rejects.toThrow(
      /confirm.*email/i,
    );
    await admin
      .from('member_invites')
      .update({ expires_at: new Date(0).toISOString() })
      .eq('id', invite.invitationId);
    await expect(mail.acceptMemberInvite(unconfirmed.data.user.id, invite.token)).rejects.toThrow(
      /expired/i,
    );
  });
  test('current authorization in the save RPC rejects previously authorized snapshots', async () => {
    const row = await backend.row(workspaceId);
    const memberSave = await admin.rpc('save_workspace', {
      p_workspace: workspaceId,
      p_version: row.version,
      p_state: row.state,
      p_user: member,
      p_grant: null,
    });
    expect(memberSave.error?.message).toMatch(/access/i);
    const grant = await backend.createPortalLink(owner, workspaceId, 'project-a');
    const stored = await admin
      .from('portal_grants')
      .select('token_hash,token_cipher')
      .eq('id', grant.id)
      .single();
    expect(stored.data?.token_hash).not.toBe(grant.token);
    expect(stored.data?.token_cipher).not.toContain(grant.token);
    await backend.revokePortal(owner, workspaceId, 'project-a');
    const stale = await admin.rpc('save_workspace', {
      p_workspace: workspaceId,
      p_version: row.version,
      p_state: row.state,
      p_user: null,
      p_grant: stored.data!.token_hash,
    });
    expect(stale.error?.message).toMatch(/revoked/i);
  });
  test('changing a client email invalidates the old portal link immediately', async () => {
    const grant = await backend.createPortalLink(owner, workspaceId, 'project-a');
    const current = await backend.loadWorkspace(owner),
      clientId = current.state.projects.find((p) => p.id === 'project-a')!.clientId;
    await backend.mutateWorkspace(owner, {
      workspaceId,
      version: current.version,
      command: { type: 'client.update', clientId, email: 'new@example.test' },
    });
    await expect(backend.loadPortal(grant.token)).rejects.toThrow(/revoked/i);
  });
  test('reminders are tenant scoped and advance only after mail is accepted', async () => {
    const second = await account();
    const secondView = await backend.loadWorkspace(second.id);
    const secondId = secondView.state.workspaceId;
    for (const [user, id] of [
      [owner, workspaceId],
      [second.id, secondId],
    ]) {
      let current = await backend.loadWorkspace(user, id);
      if (!current.state.clients.length)
        current = await backend.mutateWorkspace(user, {
          workspaceId: id,
          version: current.version,
          command: {
            type: 'client.create',
            id: 'client',
            name: 'Client',
            email: 'reminders@example.test',
            company: '',
          },
        });
      if (!current.state.projects.length)
        current = await backend.mutateWorkspace(user, {
          workspaceId: id,
          version: current.version,
          command: {
            type: 'project.create',
            id: 'project-a',
            clientId: current.state.clients[0].id,
            title: 'Reminder test',
            description: '',
            dueDate: null,
            revisionAllowance: 1,
          },
        });
      await backend.mutateWorkspace(user, {
        workspaceId: id,
        version: current.version,
        command: {
          type: 'request.create',
          projectId: 'project-a',
          id: 'same-request',
          title: 'Content',
          instructions: 'Send content',
          requestType: 'text',
          dueDate: '2020-01-01',
          reminder: { enabled: true, intervalDays: 3, nextDueDate: '2020-01-01' },
        },
      });
      await backend.createPortalLink(user, id, 'project-a');
    }
    await mail.schedule();
    await mail.schedule();
    const queued = await admin
      .from('mail_queue')
      .select('workspace_id')
      .eq('kind', 'reminder')
      .in('workspace_id', [workspaceId, secondId]);
    expect(queued.data?.map((q) => q.workspace_id).sort()).toEqual([workspaceId, secondId].sort());
    const original = process.env.SMTP_PORT;
    process.env.SMTP_PORT = '1';
    await mail.run();
    process.env.SMTP_PORT = original;
    expect(
      (await backend.row(workspaceId)).state.projects
        .find((p) => p.id === 'project-a')!
        .requests.find((r) => r.id === 'same-request')!.reminder!.nextDueDate,
    ).toBe('2020-01-01');
    await admin
      .from('mail_queue')
      .update({ next_attempt_at: new Date(0).toISOString() })
      .in('workspace_id', [workspaceId, secondId])
      .eq('status', 'error');
    await mail.run();
    expect(
      (await backend.row(workspaceId)).state.projects
        .find((p) => p.id === 'project-a')!
        .requests.find((r) => r.id === 'same-request')!.reminder!.nextDueDate,
    ).not.toBe('2020-01-01');
  });
  test('weekly digest groups one email per client and live suppression cancels queued work', async () => {
    const current = await backend.loadWorkspace(owner),
      clientId = current.state.projects.find((p) => p.id === 'project-a')!.clientId;
    const grant = await backend.createPortalLink(owner, workspaceId, 'project-b');
    let next = await backend.mutateWorkspace(owner, {
      workspaceId,
      version: current.version,
      command: {
        type: 'request.create',
        projectId: 'project-b',
        id: 'digest-request',
        title: 'Another input',
        instructions: 'Share details',
        requestType: 'text',
        dueDate: '2020-01-01',
      },
    });
    const count = await admin
      .from('mail_queue')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'digest');
    await mail.schedule();
    await mail.schedule();
    const digest = await admin
      .from('mail_queue')
      .select('id,payload')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'digest');
    expect(digest.data).toHaveLength(1);
    expect(digest.data![0].payload.clientId).toBe(clientId);
    // Delete the prior unsent test queue so this case represents a fresh grouping.
    if (count.data?.length)
      await admin
        .from('mail_queue')
        .update({
          status: 'pending',
          payload: {
            clientId,
            grantIds: (await mail.activeGrants(workspaceId)).map((g) => g.id),
            date: new Date().toISOString().slice(0, 10),
          },
        })
        .eq('id', digest.data![0].id);
    const content = await mail.content({
      id: digest.data![0].id,
      kind: 'digest',
      workspace_id: workspaceId,
      payload: { clientId, grantIds: (await mail.activeGrants(workspaceId)).map((g) => g.id) },
      attempts: 1,
    });
    expect(content?.text).toContain('Project A');
    expect(content?.text).toContain('Project B');
    next = await backend.mutateWorkspace(owner, {
      workspaceId,
      version: next.version,
      command: { type: 'settings.update', weeklyDigest: false },
    });
    await mail.run();
    const cancelled = await admin
      .from('mail_queue')
      .select('status')
      .eq('id', digest.data![0].id)
      .single();
    expect(cancelled.data?.status).toBe('cancelled');
    await backend.revokePortal(owner, workspaceId, 'project-b');
    await expect(backend.loadPortal(grant.token)).rejects.toThrow(/revoked/);
    expect(next.state.settings.weeklyDigest).toBe(false);
  });
  test('simultaneous portal rotation leaves one current bearer grant', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => backend.createPortalLink(owner, workspaceId, 'project-a')),
    );
    const grants = await admin
      .from('portal_grants')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('project_id', 'project-a')
      .is('revoked_at', null);
    expect(grants.data).toHaveLength(1);
    const usable = await Promise.allSettled(outcomes.map((g) => backend.loadPortal(g.token)));
    expect(usable.filter((p) => p.status === 'fulfilled')).toHaveLength(1);
  });
  test('script filenames cannot bypass upload policy with a plain text MIME', async () => {
    await expect(
      files.upload(
        { userId: owner, workspaceId },
        'project-a',
        new File(['echo dangerous'], 'run.sh', { type: 'text/plain' }),
      ),
    ).rejects.toThrow(/file.*name|unsupported/i);
  });
  test('trailing whitespace cannot hide an executable extension', async () => {
    await expect(
      files.upload(
        { userId: owner, workspaceId },
        'project-a',
        new File(['echo dangerous'], 'run.sh ', { type: 'text/plain' }),
      ),
    ).rejects.toThrow(/file.*name|unsupported/i);
    await expect(
      files.upload(
        { userId: owner, workspaceId },
        'project-a',
        new File(['fake executable'], 'run.exe.', { type: 'text/plain' }),
      ),
    ).rejects.toThrow(/file.*name|unsupported/i);
  });
  test('authenticated direct writes and private bucket listing cannot bypass the backend', async () => {
    const signed = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const email = (await backend.user(owner)).email!;
    const signin = await signed.auth.signInWithPassword({ email, password: 'Test-password-734!' });
    if (signin.error) throw signin.error;
    const direct = await signed.from('workspaces').update({ state: {} }).eq('id', workspaceId);
    expect(direct.error?.code).toBe('42501');
    const rpc = await signed.rpc('save_workspace', {
      p_workspace: workspaceId,
      p_version: 0,
      p_state: {},
      p_user: owner,
      p_grant: null,
    });
    expect(rpc.error?.code).toBe('42501');
    const listing = await signed.storage.from('clientlane-private').list(workspaceId);
    expect(listing.data ?? []).toEqual([]);
    const file = await admin
      .from('file_registry')
      .select('path')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .single();
    const directDownload = await signed.storage
      .from('clientlane-private')
      .download(file.data!.path);
    expect(directDownload.error).not.toBeNull();
  });
  test('received requests cancel a queued reminder before sending', async () => {
    let view = await backend.loadWorkspace(owner);
    view = await backend.mutateWorkspace(owner, {
      workspaceId,
      version: view.version,
      command: {
        type: 'request.create',
        projectId: 'project-a',
        id: 'stop-request',
        title: 'Stop reminder',
        instructions: 'Share',
        requestType: 'text',
        dueDate: '2020-01-01',
        reminder: { enabled: true, intervalDays: 1, nextDueDate: '2020-01-01' },
      },
    });
    const grant = await backend.createPortalLink(owner, workspaceId, 'project-a');
    await mail.schedule();
    const portal = await backend.loadPortal(grant.token);
    await backend.mutatePortal(grant.token, {
      version: portal.version,
      command: {
        type: 'request.submit',
        projectId: 'project-a',
        requestId: 'stop-request',
        text: 'Received now',
        files: [],
      },
    });
    await mail.run();
    const rows = await admin
      .from('mail_queue')
      .select('status,payload')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'reminder');
    expect(rows.data?.find((q) => q.payload.requestId === 'stop-request')?.status).toBe(
      'cancelled',
    );
    expect(view.state.projects[0].requests.some((r) => r.id === 'stop-request')).toBe(true);
  });
  test('expired portal cannot read or download and revoked invitations cannot be accepted', async () => {
    const grant = await backend.createPortalLink(owner, workspaceId, 'project-a');
    await admin
      .from('portal_grants')
      .update({ expires_at: new Date(0).toISOString() })
      .eq('id', grant.id);
    await expect(backend.loadPortal(grant.token)).rejects.toThrow(/expired/i);
    const registered = await admin
      .from('file_registry')
      .select('path')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .single();
    await expect(files.download({ token: grant.token }, registered.data!.path)).rejects.toThrow(
      /expired/i,
    );
    const invitee = await account(),
      invite = await mail.inviteMember(owner, workspaceId, invitee.email, ['project-a']);
    await mail.revokeMemberInvite(owner, workspaceId, invite.invitationId);
    await expect(mail.acceptMemberInvite(invitee.id, invite.token)).rejects.toThrow(/revoked/i);
  });
  test('a sent email can repair its reminder schedule without sending again', async () => {
    let current = await backend.loadWorkspace(owner);
    await backend.mutateWorkspace(owner, {
      workspaceId,
      version: current.version,
      command: {
        type: 'request.create',
        projectId: 'project-a',
        id: 'repair-request',
        title: 'Repair schedule',
        instructions: 'Details',
        requestType: 'text',
        dueDate: '2020-01-01',
        reminder: { enabled: true, intervalDays: 2, nextDueDate: '2020-01-01' },
      },
    });
    await backend.createPortalLink(owner, workspaceId, 'project-a');
    await mail.schedule();
    await mail.run();
    const sentJobs = await admin
      .from('mail_queue')
      .select('id,payload,status')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'reminder');
    const job = sentJobs.data!.find((j) => j.payload.requestId === 'repair-request')!;
    expect(job.status).toBe('sent');
    current = await backend.loadWorkspace(owner);
    await backend.mutateWorkspace(owner, {
      workspaceId,
      version: current.version,
      command: {
        type: 'request.update',
        projectId: 'project-a',
        requestId: 'repair-request',
        reminder: { enabled: true, intervalDays: 2, nextDueDate: '2020-01-01' },
      },
    });
    await admin
      .from('mail_queue')
      .update({ error: 'Email accepted; schedule transaction conflicted' })
      .eq('id', job.id);
    expect((await mail.run()).sent).toBe(0);
    expect(
      (await backend.row(workspaceId)).state.projects
        .find((p) => p.id === 'project-a')!
        .requests.find((r) => r.id === 'repair-request')!.reminder!.nextDueDate,
    ).not.toBe('2020-01-01');
  });
  test('only the workspace owner can retry an exhausted email queue record', async () => {
    const queued = await mail.sendPortalInvite(owner, workspaceId, 'project-a');
    await admin
      .from('mail_queue')
      .update({
        status: 'error',
        attempts: 8,
        error: 'Previous transport failure',
        next_attempt_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .eq('id', queued.id);
    await expect(mail.retryEmail(outsider, workspaceId, queued.id)).rejects.toThrow(
      /Owner access/i,
    );
    expect((await mail.retryEmail(owner, workspaceId, queued.id)).status).toBe('sent');
  });
});
