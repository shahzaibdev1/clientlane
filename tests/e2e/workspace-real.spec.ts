import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const password = 'Browser-Password-741!';
const users: string[] = [];
const fixtureEmails: string[] = [];
test.setTimeout(120000);
test.afterAll(async () => {
  const accounts = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const account of accounts.data.users)
    if (fixtureEmails.includes(account.email ?? '') && !users.includes(account.id))
      users.push(account.id);
  for (const id of users) {
    const w = await admin.from('workspaces').select('id').eq('owner_id', id);
    for (const row of w.data ?? []) {
      const files = await admin.from('file_registry').select('path').eq('workspace_id', row.id);
      if (files.data?.length)
        await admin.storage.from('clientlane-private').remove(files.data.map((f) => f.path));
    }
    await admin.auth.admin.deleteUser(id);
  }
});
async function signup(page: Page, email: string) {
  fixtureEmails.push(email);
  await page.goto('/signup');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity for today.' })).toBeVisible({
    timeout: 20000,
  });
  const list = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = list.data.users.find((u) => u.email === email);
  expect(u).toBeTruthy();
  if (u) users.push(u.id);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name.includes('auth-token') && !cookie.secure)).toBe(true);
}
async function login(page: Page, email: string, pwd = password) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pwd);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity for today.' })).toBeVisible();
}
test('real signup persists workspace, uploads private delivery, client approves, rotation and revoke remove access', async ({
  page,
  browser,
}) => {
  const email = `ui-owner-${randomUUID()}@example.test`;
  await signup(page, email);
  await page.getByRole('button', { name: 'New client', exact: true }).click();
  await page.getByLabel('Client name').fill('Browser Client');
  await page.getByLabel('Client email').fill(`ui-client-${randomUUID()}@example.test`);
  await page.getByLabel('Company', { exact: true }).fill('Browser Studio');
  await page.getByRole('button', { name: 'Create client', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project title').fill('Private launch');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Private launch', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Private launch' }).click();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Add private note' }).click();
  await page.getByLabel('Private note', { exact: true }).fill('Never visible to the client');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByRole('button', { name: 'Requests', exact: true }).click();
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await page.getByLabel('Request title').fill('Client source file');
  await page.getByLabel('Response type').selectOption('file');
  await page.getByRole('button', { name: 'Create request', exact: true }).click();
  await page.getByRole('button', { name: 'Deliveries', exact: true }).click();
  await page.getByRole('button', { name: 'Publish delivery', exact: true }).click();
  await page.getByLabel('Delivery title').fill('Launch package');
  await page.getByLabel('Delivery note').fill('Please review the attached file.');
  await page.getByLabel('Upload file').setInputFiles({
    name: 'launch.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Private launch content'),
  });
  await expect(page.getByRole('button', { name: 'Remove launch.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish version', exact: true }).click();
  await page.getByRole('button', { name: 'Share client link', exact: true }).click();
  await page.getByRole('button', { name: 'Create / rotate secure link', exact: true }).click();
  const first = await page.getByLabel('Client portal URL').inputValue();
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(first);
  await expect(
    clientPage.getByRole('heading', { name: 'Private launch', exact: true }),
  ).toBeVisible();
  await expect(clientPage.getByText('Never visible to the client')).toHaveCount(0);
  await clientPage
    .getByRole('button', { name: 'Respond to Client source file', exact: true })
    .click();
  await clientPage.getByLabel('Upload file').setInputFiles({
    name: 'client-copy.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Client private source'),
  });
  await expect(clientPage.getByRole('button', { name: 'Remove client-copy.txt' })).toBeVisible();
  await clientPage.getByRole('button', { name: 'Send response', exact: true }).click();
  await expect(clientPage.getByRole('link', { name: /client-copy.txt/ })).toBeVisible();
  await clientPage.getByRole('button', { name: 'Deliveries', exact: true }).click();
  const file = clientPage.getByRole('link', { name: /launch.txt/ });
  const response = await clientContext.request.get((await file.getAttribute('href'))!);
  expect(await response.text()).toBe('Private launch content');
  await clientPage.getByRole('button', { name: 'Approve work', exact: true }).click();
  await clientPage.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(clientPage.getByText('approved', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Send client invitation', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'accepted by the email server' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Share client link', exact: true }).click();
  await page.getByRole('button', { name: 'Create / rotate secure link', exact: true }).click();
  await expect(page.getByLabel('Client portal URL')).not.toHaveValue(first);
  const second = await page.getByLabel('Client portal URL').inputValue();
  expect(second).not.toBe(first);
  await clientPage.goto(first);
  await expect(clientPage.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
  await clientPage.goto(second);
  await expect(
    clientPage.getByRole('heading', { name: 'Private launch', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Revoke client link', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await clientPage.reload();
  await expect(clientPage.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
  await clientContext.close();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await login(page, email);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Private launch' })).toBeVisible();
});
test('team invitation confirms email and restricts selected workspace to project scope', async ({
  page,
  browser,
}) => {
  const owner = `ui-team-${randomUUID()}@example.test`,
    member = `ui-member-${randomUUID()}@example.test`;
  await signup(page, owner);
  await page.getByRole('button', { name: 'Load sample projects' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Invite teammate', exact: true }).click();
  await page.getByLabel('Teammate email').fill(member);
  await page.getByLabel('Access to Field Coffee website').check();
  await page.getByRole('button', { name: 'Send team invitation', exact: true }).click();
  const text = await page.getByRole('status').filter({ hasText: 'Link:' }).textContent();
  const invitation = text!.match(/http\S+/)![0];
  const context = await browser.newContext(),
    memberPage = await context.newPage();
  await signup(memberPage, member);
  await memberPage.goto(invitation);
  await memberPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(
    memberPage.getByRole('heading', { name: 'A little clarity for today.' }),
  ).toBeVisible();
  await expect(memberPage.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
  await memberPage.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(memberPage.getByRole('button', { name: 'Open Field Coffee website' })).toBeVisible();
  await expect(memberPage.getByRole('button', { name: 'Open Arc brand identity' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh team', exact: true }).click();
  await expect(
    page.locator('.ws-team-row').filter({ hasText: member }).getByText('Active', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Assigned teammate').selectOption({ label: member });
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const workspaceSelect = memberPage.getByRole('combobox', { name: 'Workspace', exact: true });
  const ownWorkspace = await workspaceSelect
    .locator('option')
    .filter({ hasText: 'owner' })
    .getAttribute('value');
  await workspaceSelect.selectOption(ownWorkspace!);
  await expect(memberPage.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(memberPage.getByText('Your next great project starts here.')).toBeVisible();
  await context.close();
});

test('password recovery email returns to reset and the new password signs in', async ({
  page,
  request,
}) => {
  const email = `ui-recovery-${randomUUID()}@example.test`;
  await signup(page, email);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send recovery link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('recovery link');
  let messageId = '';
  await expect
    .poll(async () => {
      const response = await request.get('http://127.0.0.1:55324/api/v1/messages');
      const data = await response.json();
      const mail = data.messages.find((m: { To: { Address: string }[]; ID: string }) =>
        m.To.some((r) => r.Address === email),
      );
      messageId = mail?.ID ?? '';
      return Boolean(messageId);
    })
    .toBe(true);
  const message = await (
    await request.get(`http://127.0.0.1:55324/api/v1/message/${messageId}`)
  ).json();
  const links = [...String(message.HTML).matchAll(/href="([^"]+)"/g)].map((m) =>
    m[1].replaceAll('&amp;', '&'),
  );
  const link = links.find((h) => h.includes('/auth/v1/verify'));
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page.getByRole('button', { name: 'Save password', exact: true })).toBeVisible();
  const next = 'New-Browser-Password-935!';
  await page.getByLabel('Password', { exact: true }).fill(next);
  await page.getByLabel('Confirm password').fill(next);
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity for today.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await login(page, email, next);
});
