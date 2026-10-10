import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import { URL } from 'node:url';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const capture = (path) => page.screenshot({ path, fullPage: true, animations: 'disabled' });
await page.goto('http://127.0.0.1:3001');
await capture('docs/screenshots/marketing.png');
await page.setViewportSize({ width: 375, height: 812 });
await capture('docs/screenshots/marketing-mobile.png');
await page.goto('http://127.0.0.1:3001/tools/revision-tracker');
await capture('docs/screenshots/revision-tool-mobile.png');
await page.setViewportSize({ width: 1440, height: 1050 });
await page.goto('http://127.0.0.1:3001/demo');
await page.getByRole('heading', { name: 'A little clarity for today.' }).waitFor();
await capture('docs/screenshots/workspace.png');
await page.setViewportSize({ width: 375, height: 812 });
await page.goto('http://127.0.0.1:3001/demo');
await page.getByRole('heading', { name: 'A little clarity for today.' }).waitFor();
await capture('docs/screenshots/workspace-mobile.png');
await page.goto('http://127.0.0.1:3001/login');
await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
await capture('docs/screenshots/login-mobile.png');

process.loadEnvFile('.env.local');
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== '127.0.0.1')
  throw new Error('Visual fixtures require the isolated local Supabase instance.');
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);
const email = `visual-${randomUUID()}@example.test`;
const password = 'Visual-Fixture-Password-451!';
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
try {
  await page.goto('http://127.0.0.1:3001/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'A little clarity for today.' }).waitFor();
  await page.getByRole('button', { name: 'Load sample projects' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'Share client link', exact: true }).click();
  await page.getByRole('button', { name: 'Create / rotate secure link', exact: true }).click();
  await page.getByLabel('Client portal URL').waitFor();
  const url = await page.getByLabel('Client portal URL').inputValue();
  const clientContext = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const clientPage = await clientContext.newPage();
  await clientPage.goto(url);
  await clientPage.getByRole('heading', { name: 'Field Coffee website', exact: true }).waitFor();
  await clientPage.screenshot({
    path: 'docs/screenshots/client-portal.png',
    fullPage: true,
    animations: 'disabled',
  });
  await clientPage.setViewportSize({ width: 375, height: 812 });
  await clientPage.screenshot({
    path: 'docs/screenshots/client-portal-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await clientContext.close();
} finally {
  await admin.auth.admin.deleteUser(data.user.id);
  await browser.close();
}
