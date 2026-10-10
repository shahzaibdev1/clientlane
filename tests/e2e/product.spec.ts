import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('demo persists client responses, version feedback, approvals and agreements', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'A little clarity for today.' })).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'Client preview', exact: true }).click();
  await page.getByRole('button', { name: 'Respond to Final menu and opening hours' }).click();
  await page.getByLabel('Response').fill('Coffee 8am to 6pm');
  await page.getByRole('button', { name: 'Send response', exact: true }).click();
  await expect(page.getByText('Coffee 8am to 6pm')).toBeVisible();
  await page.getByRole('button', { name: 'Deliveries', exact: true }).click();
  await page.getByRole('button', { name: 'Add feedback', exact: true }).click();
  await page.getByLabel('Feedback', { exact: true }).fill('This direction feels welcoming.');
  await page.getByRole('button', { name: 'Post feedback', exact: true }).click();
  await expect(page.getByText('This direction feels welcoming.')).toBeVisible();
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await page.getByLabel('Decision note').fill('Please use a warmer accent');
  await page.getByRole('button', { name: 'Confirm changes', exact: true }).click();
  await expect(page.getByText('1 used', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to studio', exact: true }).click();
  await page.getByRole('button', { name: 'Publish new version', exact: true }).click();
  await page.getByLabel('Delivery note').fill('A warmer direction');
  await page.getByRole('button', { name: 'Publish version', exact: true }).click();
  await page.getByRole('button', { name: 'Client preview', exact: true }).click();
  await page.getByRole('button', { name: 'Approve work', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(page.getByText('approved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'Requests', exact: true }).click();
  await expect(page.getByText('Coffee 8am to 6pm')).toBeVisible();
  await expect(page.getByText('Reminders paused — input received.', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/workspace.png', fullPage: true });
});

test('demo template projects and CSV preview create real records', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project title').fill('Template project');
  await page.getByLabel('Project template').selectOption('branding');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('button', { name: 'Requests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Brand brief', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await page
    .getByLabel('CSV content')
    .fill(
      'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\nImported project,Nora,nora@example.test,Studio,New work,2026-12-01,2',
    );
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByText('Imported project', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Imported project' })).toBeVisible();
});

test('mobile demo has accessible dialogs and no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/demo');
  await page.getByRole('button', { name: 'New client', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'New client', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'docs/screenshots/workspace-mobile.png', fullPage: true });
});

test('auth screens and invalid client links give usable recovery routes', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeVisible();
  await page.goto('/forgot-password');
  await expect(page.getByRole('button', { name: 'Send recovery link' })).toBeVisible();
  await page.goto('/portal/invalid-product-token');
  await expect(page.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
});
