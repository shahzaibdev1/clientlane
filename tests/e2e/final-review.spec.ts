import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Backend } from '../../src/lib/backend/service';
import { Mail } from '../../src/lib/backend/mail';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
Object.assign(process.env, env);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const backend = new Backend(db),
  mail = new Mail(backend);
const users: string[] = [];
const password = 'Browser-Password-741!';
test.setTimeout(60000);
async function account() {
  const email = `final-ui-${randomUUID()}@example.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  return { id: data.user.id, email };
}
async function fixture() {
  const owner = await account(),
    member = await account();
  let v = await backend.loadWorkspace(owner.id);
  v = await backend.loadSample(owner.id, { version: v.version });
  const workspaceId = v.state.workspaceId,
    projectId = v.state.projects[0].id;
  const invitation = await mail.inviteMember(owner.id, workspaceId, member.email, [projectId]);
  await mail.acceptMemberInvite(member.id, invitation.token);
  v = await backend.mutateWorkspace(owner.id, {
    version: v.version,
    command: { type: 'project.update', projectId, assigneeId: member.id },
  });
  const portal = await backend.createPortalLink(owner.id, workspaceId, projectId);
  await backend.mutatePortal(portal.token, {
    version: v.version,
    command: {
      type: 'change.request',
      projectId,
      id: 'extra',
      title: 'Browser extra work',
      description: 'Additional design',
    },
  });
  return { owner, member, workspaceId, projectId };
}
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity for today.' })).toBeVisible();
}
async function openProject(page: Page, title = 'Field Coffee website') {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: `Open ${title}`, exact: true }).click();
}
test.afterAll(async () => {
  for (const id of users) {
    const result = await db.auth.admin.deleteUser(id);
    if (result.error) throw result.error;
    expect((await db.from('workspaces').select('id').eq('owner_id', id)).data).toEqual([]);
  }
});
for (const mode of ['delayed', 'failed'] as const) {
  test(`${mode} team loading preserves assignment through an unrelated edit`, async ({ page }) => {
    const f = await fixture();
    await login(page, f.owner.email);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page
        .locator('.ws-team-row')
        .filter({ hasText: f.member.email })
        .getByText('Active', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    // After reload the owner's first ancillary action is listMembers.
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let intercepted = false,
      teamAction = '';
    await page.route('**/app**', async (route) => {
      const action = route.request().headers()['next-action'];
      if (!action || (teamAction && action !== teamAction)) return route.continue();
      teamAction = action;
      intercepted = true;
      if (mode === 'failed') {
        const response = await route.fetch();
        const body = await response.text();
        const failed = body.replace(
          /^([0-9a-f]+:)\{"ok":true,"data":\{"members".*$/gm,
          '$1{"ok":false,"error":"Team unavailable for regression"}',
        );
        expect(failed).not.toBe(body);
        return route.fulfill({ response, body: failed });
      }
      await hold;
      await route.continue();
    });
    try {
      await page.reload();
      await expect.poll(() => intercepted).toBe(true);
      await openProject(page);
      await page.getByRole('button', { name: 'Edit project', exact: true }).click();
      await expect(page.getByLabel('Assigned teammate')).toBeDisabled();
      await expect(page.getByLabel('Assigned teammate')).toHaveValue(f.member.id);
      await page.getByLabel('Project title').fill(`Preserved ${mode}`);
      await page.getByRole('button', { name: 'Save project', exact: true }).click();
      release(); // Next dispatches actions sequentially; the open form remains a snapshot.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const current = await backend.row(f.workspaceId);
      expect(current.state.projects.find((p) => p.id === f.projectId)?.assigneeId).toBe(
        f.member.id,
      );
      expect(current.state.projects.find((p) => p.id === f.projectId)?.title).toBe(
        `Preserved ${mode}`,
      );
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
test('deliberate unassignment and scoped reassignment persist; revoked current assignment survives unrelated editing', async ({
  page,
}) => {
  const f = await fixture();
  await login(page, f.owner.email);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page
      .locator('.ws-team-row')
      .filter({ hasText: f.member.email })
      .getByText('Active', { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await openProject(page);
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Assigned teammate').selectOption('');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await backend.row(f.workspaceId)).state.projects[0].assigneeId).toBeNull();
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Assigned teammate').selectOption(f.member.id);
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await backend.row(f.workspaceId)).state.projects[0].assigneeId).toBe(f.member.id);
  await backend.revokeMember(f.owner.id, f.workspaceId, f.member.id);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page
      .locator('.ws-team-row')
      .filter({ hasText: f.member.email })
      .getByText('Revoked', { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await openProject(page);
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Project description').fill('Unrelated edit after revocation');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await backend.row(f.workspaceId)).state.projects[0].assigneeId).toBe(f.member.id);
});
test('member pricing action is absent', async ({ page }) => {
  const f = await fixture();
  await login(page, f.member.email);
  await page.goto(`/app?workspace=${f.workspaceId}`);
  await openProject(page);
  await page.getByRole('button', { name: 'Agreements', exact: true }).click();
  const extra = page
    .locator('.ws-card')
    .filter({ has: page.getByRole('heading', { name: 'Browser extra work', exact: true }) });
  await expect(extra).toBeVisible();
  await expect(extra.getByRole('button', { name: 'Publish quote' })).toHaveCount(0);
});
test('handover milestone progress is read only for owner and member', async ({ page }) => {
  const f = await fixture();
  for (const user of [f.member, f.owner]) {
    await login(page, user.email);
    await page.goto(`/app?workspace=${f.workspaceId}`);
    await openProject(page);
    await page.getByRole('button', { name: 'Agreements', exact: true }).click();
    const extra = page
      .locator('.ws-card')
      .filter({ has: page.getByRole('heading', { name: 'Browser extra work', exact: true }) });
    if (user.id === f.owner.id)
      await expect(extra.getByRole('button', { name: 'Publish quote' })).toBeVisible();
    await page.getByRole('button', { name: 'Handover', exact: true }).click();
    const milestones = page
      .locator('.ws-card')
      .filter({ has: page.getByRole('heading', { name: 'Milestones', exact: true }) });
    await expect(milestones).toContainText('Direction approved');
    await expect(milestones).toContainText('Upcoming');
    await expect(milestones.getByRole('button')).toHaveCount(0);
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New milestone', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
  }
});
test('ready for review counts only active project deliveries', async ({ page }) => {
  const f = await fixture();
  let v = await backend.loadWorkspace(f.owner.id);
  await backend.mutateWorkspace(f.owner.id, {
    version: v.version,
    command: { type: 'project.archive', projectId: f.projectId, archived: true },
  });
  await login(page, f.owner.email);
  await expect(
    page.locator('.ws-stat').filter({ hasText: 'Ready for review' }).locator('strong'),
  ).toHaveText('00');
  v = await backend.loadWorkspace(f.owner.id);
  await backend.mutateWorkspace(f.owner.id, {
    version: v.version,
    command: { type: 'project.archive', projectId: f.projectId, archived: false },
  });
  v = await backend.loadWorkspace(f.owner.id);
  await backend.mutateWorkspace(f.owner.id, {
    version: v.version,
    command: { type: 'project.update', projectId: f.projectId, status: 'completed' },
  });
  await page.reload();
  await expect(
    page.locator('.ws-stat').filter({ hasText: 'Ready for review' }).locator('strong'),
  ).toHaveText('00');
});
test('header, hero, and shared signup CTAs open account creation while login still signs in', async ({
  page,
}) => {
  for (const index of [0, 1, 2]) {
    await page.goto('/');
    await page.getByRole('link', { name: 'Start your workspace', exact: true }).nth(index).click();
    await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  }
  await page.goto('/features');
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm password')).toHaveCount(0);
});
