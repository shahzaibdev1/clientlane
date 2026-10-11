import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
test.setTimeout(45000);

test('public site explains the workflow and routes visitors to usable demo and signup', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/client|project/i);
  await page.getByRole('link', { name: 'Explore the demo', exact: true }).first().click();
  await expect(page).toHaveURL(/\/demo/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Start your workspace', exact: true }).first().click();
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm password')).toBeVisible();
});

test('revision utility calculates remaining allowance and creates a usable summary', async ({
  page,
}) => {
  await page.goto('/tools/revision-tracker');
  await page.getByLabel('Project name').fill('Acme website');
  await page.getByLabel('Included revision rounds').fill('3');
  await page.getByLabel('Used revision rounds').fill('2');
  await expect(page.getByTestId('revision-result')).toContainText('1 round remaining');
  await page.getByLabel('Used revision rounds').fill('5');
  await expect(page.getByTestId('revision-result')).toContainText('2 extra rounds');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download summary' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('revision-summary.txt');
  const path = await download.path();
  expect(path).not.toBeNull();
  const summary = await readFile(path!, 'utf8');
  expect(summary).toContain('Acme website');
  expect(summary).toContain('Included revision rounds: 3');
  expect(summary).toContain('Used revision rounds: 5');
  expect(summary).toContain('2 extra rounds');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Summary copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('2 extra rounds');
});

test('search metadata and sitemap include public routes and exclude private work', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Clientlane/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /client/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'http://127.0.0.1:3001',
  );
  const data = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(data.some((item) => JSON.parse(item)['@type'] === 'SoftwareApplication')).toBe(true);
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('/tools/revision-tracker');
  expect(xml).toContain('/guides/client-onboarding');
  expect(xml).not.toMatch(/<loc>[^<]*\/(app|portal|login|demo)/);
  await page.goto('/demo');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('guides provide actionable original workflows and accessible mobile layout', async ({
  page,
}) => {
  for (const slug of ['client-onboarding', 'manage-client-revisions', 'project-delays']) {
    await page.goto(`/guides/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('article')).toContainText(/client/i);
  }
  for (const path of [
    '/',
    '/features',
    '/guides',
    '/guides/client-onboarding',
    '/tools/revision-tracker',
  ]) {
    await page.goto(path);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test('shared guides identify the actual article instead of generic homepage copy', async ({
  page,
}) => {
  await page.goto('/guides/manage-client-revisions');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Keep revisions clear before they become extra work',
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
});
