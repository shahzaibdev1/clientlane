import { afterAll, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Backend } from '../../src/lib/backend/service';
import { ClientAccounts } from '../../src/lib/backend/client-accounts';
import { Files } from '../../src/lib/backend/files';
import { Mail } from '../../src/lib/backend/mail';
import type { Command } from '../../src/lib/domain';
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const backend = new Backend(db),
  accounts = new ClientAccounts(backend),
  files = new Files(backend),
  users: string[] = [],
  paths: string[] = [],
  queueIds: string[] = [];
async function user(email = `account-review-${randomUUID()}@example.test`) {
  const r = await db.auth.admin.createUser({
    email,
    password: 'Accounts-review-741!',
    email_confirm: true,
  });
  if (r.error) throw r.error;
  users.push(r.data.user.id);
  return { id: r.data.user.id, email };
}
async function mutate(id: string, command: Command) {
  const v = await backend.loadWorkspace(id);
  return backend.mutateWorkspace(id, { version: v.version, command });
}
async function fixture(accepted = true) {
  const client = await user(),
    owner = await user();
  const v = await mutate(owner.id, {
    type: 'projects.import',
    rows: [
      {
        clientName: 'Retained Client',
        clientEmail: client.email,
        company: '',
        title: 'Retained Project',
        description: 'Earlier authorized description',
        dueDate: null,
        revisionAllowance: 2,
      },
    ],
  });
  const workspaceId = v.state.workspaceId,
    projectId = v.state.projects[0].id,
    invite = await accounts.inviteClient(owner.id, workspaceId, projectId);
  if (accepted) await accounts.accept(client.id, invite.token);
  return { client, owner, workspaceId, projectId, invite };
}
async function upload(owner: string, workspaceId: string, projectId: string, name: string) {
  const file = await files.upload(
    { userId: owner, workspaceId },
    projectId,
    new File([name], name, { type: 'text/plain' }),
  );
  paths.push(file.path);
  return file;
}
afterAll(async () => {
  if (queueIds.length) {
    const r = await db.from('mail_queue').delete().in('id', queueIds);
    if (r.error) throw r.error;
  }
  if (paths.length) {
    const r = await db.storage.from('clientlane-private').remove(paths);
    if (r.error) throw r.error;
  }
  for (const id of users) {
    const exists = await db.auth.admin.getUserById(id);
    if (!exists.data.user) continue;
    const r = await db.auth.admin.deleteUser(id);
    if (r.error) throw r.error;
    expect((await db.from('workspaces').select('id').eq('owner_id', id)).data).toEqual([]);
  }
});
test('Auth deletion preserves submitted project files and bearer bytes without adopting unsubmitted uploads into a replacement account', async () => {
  const f = await fixture(),
    portal = await backend.createPortalLink(f.owner.id, f.workspaceId, f.projectId);
  await mutate(f.owner.id, {
    type: 'request.create',
    projectId: f.projectId,
    id: 'source',
    title: 'Source',
    instructions: '',
    requestType: 'file',
    dueDate: null,
  });
  const actor = { userId: f.client.id, workspaceId: f.workspaceId, clientAccount: true };
  const submitted = await files.upload(
    actor,
    f.projectId,
    new File(['retained submitted bytes'], 'submitted.txt', { type: 'text/plain' }),
  );
  const unattached = await files.upload(
    actor,
    f.projectId,
    new File(['unsubmitted bytes'], 'unsubmitted.txt', { type: 'text/plain' }),
  );
  paths.push(submitted.path, unattached.path);
  const v = await accounts.loadProject(f.client.id, f.workspaceId, f.projectId);
  await accounts.mutateProject(f.client.id, f.workspaceId, f.projectId, {
    version: v.version,
    command: {
      type: 'request.submit',
      projectId: f.projectId,
      requestId: 'source',
      text: '',
      files: [submitted],
    },
  });
  const deletion = await db.auth.admin.deleteUser(f.client.id);
  if (deletion.error) throw deletion.error;
  expect(
    await (
      await files.download({ userId: f.owner.id, workspaceId: f.workspaceId }, submitted.path)
    ).text(),
  ).toBe('retained submitted bytes');
  expect(await (await files.download({ token: portal.token }, submitted.path)).text()).toBe(
    'retained submitted bytes',
  );
  await expect(files.download({ token: portal.token }, unattached.path)).rejects.toThrow(
    /public|shared/i,
  );
  const registry = await db
    .from('file_registry')
    .select('uploader_id,client_access_id')
    .eq('path', unattached.path)
    .single();
  expect(registry.error).toBeNull();
  expect(registry.data).toEqual({ uploader_id: null, client_access_id: null });
  const replacement = await user(f.client.email);
  expect(await accounts.listProjects(replacement.id)).toEqual([]);
  await expect(
    files.download({ userId: replacement.id, clientAccount: true }, submitted.path),
  ).rejects.toThrow(/access/i);
  await accounts.accept(
    replacement.id,
    (await accounts.inviteClient(f.owner.id, f.workspaceId, f.projectId)).token,
  );
  expect(
    await (
      await files.download({ userId: replacement.id, clientAccount: true }, submitted.path)
    ).text(),
  ).toBe('retained submitted bytes');
  const fresh = await accounts.loadProject(replacement.id, f.workspaceId, f.projectId);
  await expect(
    accounts.mutateProject(replacement.id, f.workspaceId, f.projectId, {
      version: fresh.version,
      command: {
        type: 'request.submit',
        projectId: f.projectId,
        requestId: 'source',
        text: '',
        files: [unattached],
      },
    }),
  ).rejects.toThrow(/uploaded|another client/i);
});
// The fetch hook preserves an actual response from Postgres, commits the competing real
// mutation, then releases that earlier response. No authorization/workspace data is fabricated.
function interleaved(change: () => Promise<void>, target: 'project' | 'preview') {
  let fired = false;
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const response = await fetch(input, init),
            url = String(input);
          const match =
            target === 'project'
              ? /\/rpc\/(valid_client_access|read_client_project)(?:\?|$)/.test(url)
              : /\/rpc\/read_client_account_invite(?:\?|$)/.test(url) ||
                (/\/client_account_invites\?/.test(url) && url.includes('token_hash=eq.'));
          if (!fired && match) {
            fired = true;
            await response.clone().arrayBuffer();
            await change();
          }
          return response;
        },
      },
    },
  );
  return { backend: new Backend(client), fired: () => fired };
}
test.each(['revoke', 'email change'] as const)(
  'account load uses an authorized snapshot during %s rather than reading newer confidential details',
  async (operation) => {
    const f = await fixture();
    const hooked = interleaved(async () => {
      if (operation === 'revoke')
        await accounts.revokeAccess(f.owner.id, f.workspaceId, f.projectId);
      else {
        const row = await backend.row(f.workspaceId);
        await mutate(f.owner.id, {
          type: 'client.update',
          clientId: row.state.projects[0].clientId,
          email: `replacement-${randomUUID()}@example.test`,
        });
      }
      await mutate(f.owner.id, {
        type: 'project.update',
        projectId: f.projectId,
        description: 'New confidential detail after invalidation',
      });
    }, 'project');
    const result = await new ClientAccounts(hooked.backend)
      .loadProject(f.client.id, f.workspaceId, f.projectId)
      .catch((error) => {
        expect(error.message).toMatch(/access/i);
        return null;
      });
    expect(hooked.fired()).toBe(true);
    expect((await backend.row(f.workspaceId)).state.projects[0].description).toBe(
      'New confidential detail after invalidation',
    );
    if (result) expect(result.project.description).toBe('Earlier authorized description');
  },
);
test.each(['pending', 'accepted'] as const)(
  '%s recipient preview returns only its eligible snapshot when the client email changes before shaping',
  async (state) => {
    const f = await fixture(state === 'accepted');
    const hooked = interleaved(async () => {
      const row = await backend.row(f.workspaceId);
      await mutate(f.owner.id, {
        type: 'client.update',
        clientId: row.state.projects[0].clientId,
        email: `replacement-${randomUUID()}@example.test`,
      });
      await mutate(f.owner.id, {
        type: 'project.update',
        projectId: f.projectId,
        description: 'New preview secret after invalidation',
      });
    }, 'preview');
    const result = await new ClientAccounts(hooked.backend)
      .preview(f.client.id, f.invite.token)
      .catch((error) => {
        expect(error.message).toMatch(/expired|revoked|access/i);
        return null;
      });
    expect(hooked.fired()).toBe(true);
    if (result) expect(result.description).toBe('Earlier authorized description');
  },
);
test('account file download cannot authorize a new shared reference from a later workspace snapshot after revocation', async () => {
  const f = await fixture(),
    file = await upload(f.owner.id, f.workspaceId, f.projectId, 'later-secret.txt');
  const hooked = interleaved(async () => {
    await accounts.revokeAccess(f.owner.id, f.workspaceId, f.projectId);
    await mutate(f.owner.id, {
      type: 'delivery.publish',
      projectId: f.projectId,
      deliveryId: 'new-private',
      versionId: 'v1',
      title: 'Confidential later delivery',
      note: '',
      files: [file],
    });
  }, 'project');
  await expect(
    new Files(hooked.backend).download({ userId: f.client.id, clientAccount: true }, file.path),
  ).rejects.toThrow(/public|shared|access/i);
  expect(hooked.fired()).toBe(true);
  await expect(
    files.download({ userId: f.client.id, clientAccount: true }, file.path),
  ).rejects.toThrow(/access/i);
  const portal = await backend.createPortalLink(f.owner.id, f.workspaceId, f.projectId);
  expect(await (await files.download({ token: portal.token }, file.path)).text()).toBe(
    'later-secret.txt',
  );
});
test('queued brief mail cancels when originating email or confirmation changes and valid originating briefs still send', async () => {
  expect(['127.0.0.1', 'localhost']).toContain(process.env.SMTP_HOST);
  const provider = await user(),
    mail = new Mail(backend),
    jobs: string[] = [];
  for (const condition of ['valid', 'email', 'unconfirmed']) {
    const client = await user(),
      invite = await accounts.inviteProvider(client.id, {
        providerEmail: provider.email,
        clientName: 'Client',
        title: condition,
        description: 'Local review mail fixture',
        dueDate: null,
      });
    const job = await mail.sendAccountInvite(client.id, invite.id);
    jobs.push(job.id);
    queueIds.push(job.id);
    if (condition === 'email') {
      const r = await db.auth.admin.updateUserById(client.id, {
        email: `changed-${randomUUID()}@example.test`,
        email_confirm: true,
      });
      if (r.error) throw r.error;
    }
    if (condition === 'unconfirmed') {
      expect(client.id).toMatch(/^[0-9a-f-]{36}$/);
      execFileSync(
        'docker',
        [
          'exec',
          'supabase_db_clientlane',
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          `update auth.users set email_confirmed_at=null where id='${client.id}'`,
        ],
        { stdio: 'pipe' },
      );
      expect((await backend.user(client.id)).email_confirmed_at).toBeFalsy();
    }
  }
  await mail.run();
  expect((await mail.status(jobs[0])).status).toBe('sent');
  expect((await mail.status(jobs[1])).status).toBe('cancelled');
  expect((await mail.status(jobs[2])).status).toBe('cancelled');
});
