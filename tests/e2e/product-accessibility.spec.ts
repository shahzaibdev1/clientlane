import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('native auth submission keeps credentials out of the URL without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:3001/login');
    await page.getByLabel('Email address').fill('native-auth@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Native-Form-Fixture-741!');
    await page.route('**/login*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<p>Submission captured</p>',
      });
    });
    const submitted = page.waitForRequest((request) => request.isNavigationRequest());
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const request = await submitted;
    expect(request.method()).toBe('POST');
    const params = new URL(request.url()).searchParams;
    expect(params.has('email') || params.has('password')).toBe(false);
    const body = new URLSearchParams(request.postData() ?? '');
    expect(body.has('email') && body.has('password')).toBe(true);
  } finally {
    await context.close();
  }
});

test('mobile navigation hides closed controls and restores keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/demo');
  const open = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(open).toBeFocused();
  await page.keyboard.press('Enter');
  const close = page.getByRole('button', { name: 'Close navigation', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toHaveCount(0);
  await open.click();
  await close.click();
  await expect(open).toBeFocused();
  await open.click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(open).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toBeVisible();
});
test('auth and open workspace dialogs are accessible with focused recoverable errors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/login');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'Deliveries', exact: true }).click();
  await page.getByRole('button', { name: 'Publish new version', exact: true }).click();
  await page.getByLabel('HTTPS attachment link').fill('http://example.com/file');
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('valid HTTPS');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Publish new version', exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
