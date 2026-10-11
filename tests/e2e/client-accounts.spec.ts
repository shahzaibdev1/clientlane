import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Backend } from '../../src/lib/backend/service';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }),
  backend = new Backend(db),
  users: string[] = [],
  paths: string[] = [];
Object.assign(process.env, env);
const password = 'Accounts-browser-741!';
test.setTimeout(120000);
async function account() {
  const email = `account-ui-${randomUUID()}@example.test`;
  const r = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (r.error) throw r.error;
  users.push(r.data.user.id);
  return { id: r.data.user.id, email };
}
async function login(page: Page, email: string, next = '/client') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
async function axe(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
test.afterAll(async () => {
  for (const id of users) {
    const w = await db.from('workspaces').select('id').eq('owner_id', id);
    for (const row of w.data ?? []) {
      const f = await db.from('file_registry').select('path').eq('workspace_id', row.id);
      paths.push(...(f.data ?? []).map((f) => f.path));
    }
  }
  if (paths.length) {
    const r = await db.storage.from('clientlane-private').remove(paths);
    if (r.error) throw r.error;
  }
  for (const id of users) {
    const r = await db.auth.admin.deleteUser(id);
    if (r.error) throw r.error;
    expect((await db.from('workspaces').select('id').eq('owner_id', id)).data).toEqual([]);
  }
});
test('provider invites confirmed client, client uploads and approves in private account view, owner revokes account only', async ({
  page,
  browser,
}) => {
  const owner = await account(),
    client = await account();
  let v = await backend.loadWorkspace(owner.id);
  v = await backend.mutateWorkspace(owner.id, {
    version: v.version,
    command: {
      type: 'projects.import',
      rows: [
        {
          clientName: 'Invited Client',
          clientEmail: client.email,
          company: '',
          title: 'Account launch',
          description: 'Shared launch brief',
          dueDate: null,
          revisionAllowance: 2,
        },
      ],
    },
  });
  const workspaceId = v.state.workspaceId,
    projectId = v.state.projects[0].id;
  for (const command of [
    { type: 'note.add', projectId, id: 'private', body: 'Internal account secret' },
    {
      type: 'request.create',
      projectId,
      id: 'source',
      title: 'Source document',
      instructions: 'Upload your source',
      requestType: 'file',
      dueDate: null,
    },
    {
      type: 'delivery.publish',
      projectId,
      deliveryId: 'review',
      title: 'Launch review',
      versionId: 'v1',
      note: 'Ready to approve',
      files: [],
    },
  ] as const)
    v = await backend.mutateWorkspace(owner.id, { version: v.version, command });
  const portal = await backend.createPortalLink(owner.id, workspaceId, projectId);
  await login(page, owner.email, '/app');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Account launch' }).click();
  await page.getByRole('button', { name: 'Invite client account', exact: true }).click();
  const url = await page.getByLabel('Account invitation URL').inputValue();
  expect(url).toContain('/client/invite/');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await context.newPage();
  await login(cp, client.email, new URL(url).pathname);
  await expect(cp.getByRole('heading', { name: 'Accept your project invitation.' })).toBeVisible();
  await axe(cp);
  await cp.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(cp.getByRole('heading', { name: 'Account launch', exact: true })).toBeVisible();
  await expect(cp.getByRole('button', { name: 'Notes', exact: true })).toHaveCount(0);
  await expect(cp.getByText('Internal account secret')).toHaveCount(0);
  await cp.getByRole('button', { name: 'Requests', exact: true }).click();
  await cp.getByRole('button', { name: 'Respond to Source document', exact: true }).click();
  await cp.getByLabel('Upload file').setInputFiles({
    name: 'source.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Account uploaded content'),
  });
  await expect(cp.getByRole('button', { name: 'Remove source.txt' })).toBeVisible();
  await cp.getByRole('button', { name: 'Send response', exact: true }).click();
  await expect(cp.getByRole('link', { name: /source.txt/ })).toBeVisible();
  const download = await cp.request.get(
    (await cp.getByRole('link', { name: /source.txt/ }).getAttribute('href'))!,
  );
  expect(download.status()).toBe(200);
  expect(await download.text()).toBe('Account uploaded content');
  await cp.getByRole('button', { name: 'Deliveries', exact: true }).click();
  await cp.getByRole('button', { name: 'Approve work', exact: true }).click();
  await cp.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(cp.getByText('approved', { exact: true }).first()).toBeVisible();
  await cp.getByRole('button', { name: 'Handover', exact: true }).click();
  await axe(cp);
  await cp.getByRole('button', { name: 'Handover', exact: true }).focus();
  await cp.screenshot({
    path: 'docs/verification/client-account-project-mobile.png',
    fullPage: true,
  });
  await cp.getByRole('link', { name: 'My client projects', exact: true }).click();
  await expect(cp.getByRole('heading', { name: 'Your client projects.' })).toBeVisible();
  await axe(cp);
  await cp.screenshot({
    path: 'docs/verification/client-account-dashboard-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Revoke account access', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
  await cp.reload();
  await expect(cp.getByRole('link', { name: /Open Account launch/ })).toHaveCount(0);
  await cp.goto(`/client/project/${workspaceId}/${projectId}`);
  await expect(cp.getByRole('heading', { name: 'Client project unavailable' })).toBeVisible();
  expect((await backend.loadPortal(portal.token)).project.id).toBe(projectId);
  await context.close();
});
test('client creates brief, existing provider accepts once, linked project appears in both views and dual-role navigation works', async ({
  page,
  browser,
}) => {
  const client = await account(),
    provider = await account();
  await login(page, client.email);
  await expect(page.getByRole('heading', { name: 'Your client projects.' })).toBeVisible();
  await expect(page.getByText('No accepted projects yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Invite your provider', exact: true }).click();
  await page.getByLabel('Provider email').fill(provider.email);
  await page.getByLabel('Your name', { exact: true }).fill('Brief Client');
  await page.getByLabel('Project title', { exact: true }).fill('Client brief launch');
  await page
    .getByLabel('Project brief', { exact: true })
    .fill('Create our launch identity and deliverables.');
  await page.getByLabel('Target date', { exact: true }).fill('2026-12-01');
  await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
  const url = await page.getByLabel('Account invitation URL').inputValue();
  await page.screenshot({
    path: 'docs/verification/client-account-brief-desktop.png',
    fullPage: true,
  });
  const context = await browser.newContext(),
    pp = await context.newPage();
  await login(pp, provider.email, new URL(url).pathname);
  await expect(
    pp.getByRole('heading', { name: 'A client invited you to a project.' }),
  ).toBeVisible();
  await expect(pp.getByText('Create our launch identity and deliverables.')).toBeVisible();
  await axe(pp);
  await pp.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(pp).toHaveURL(/\/app\?workspace=/);
  await pp.getByRole('button', { name: 'Projects', exact: true }).click();
  await pp.getByRole('button', { name: 'Open Client brief launch' }).click();
  await expect(pp.getByRole('heading', { name: 'Client brief launch', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Open Client brief launch', exact: true }).click();
  await expect(page).toHaveURL(/\/client\/project\//);
  await expect(
    page.getByRole('heading', { name: 'Client brief launch', exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Studio workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity for today.' })).toBeVisible();
  await page.getByRole('link', { name: 'My client projects', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Open Client brief launch', exact: true }),
  ).toBeVisible();
  expect((await backend.loadWorkspace(provider.id)).state.projects).toHaveLength(1);
  await context.close();
});
test('client entry and private empty, wrong-recipient and expired invitation screens remain accessible on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/signup?next=/client');
  await expect(page.getByText('CREATE YOUR CLIENT ACCOUNT')).toBeVisible();
  await expect(page.getByRole('link', { name: 'I’m a freelancer or agency' })).toHaveAttribute(
    'href',
    '/signup?next=/app',
  );
  await axe(page);
  const client = await account(),
    provider = await account(),
    wrong = await account();
  const { ClientAccounts } = await import('../../src/lib/backend/client-accounts');
  const a = new ClientAccounts(backend);
  const invite = await a.inviteProvider(client.id, {
    providerEmail: provider.email,
    clientName: 'Client',
    title: 'Private brief',
    description: 'Private scope',
    dueDate: null,
  });
  await login(page, wrong.email, new URL(invite.url).pathname);
  await expect(page.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible();
  await expect(page.getByText('Private scope')).toHaveCount(0);
  await axe(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await db
    .from('client_account_invites')
    .update({ expires_at: new Date(0).toISOString() })
    .eq('id', invite.id);
  await login(page, provider.email, new URL(invite.url).pathname);
  await expect(page.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible();
  await expect(page.getByText('Invitation expired, declined or revoked.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation', exact: true })).toHaveCount(0);
  const response = await page.goto('/client');
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByText('No accepted projects yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Invite your provider', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await axe(page);
  await page.screenshot({
    path: 'docs/verification/client-account-brief-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Invite your provider', exact: true }),
  ).toBeFocused();
});
