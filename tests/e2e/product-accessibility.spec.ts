import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
