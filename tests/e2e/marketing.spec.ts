import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.setTimeout(15000);

test('public site explains the workflow and routes visitors to usable demo and signup', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/client|project/i);
  await page.getByRole('link', { name: 'Explore the demo', exact: true }).first().click();
  await expect(page).toHaveURL(/\/demo/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Start your workspace', exact: true }).first().click();
  await expect(page).toHaveURL(/\/login\?mode=signup/);
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
  await page.goto('/');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
