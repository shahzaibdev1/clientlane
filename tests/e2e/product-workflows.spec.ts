import { expect, test } from '@playwright/test';
test('demo records quotes and accepted deadline with client authority', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'Client preview', exact: true }).click();
  await page.getByRole('button', { name: 'Agreements', exact: true }).click();
  await page.getByRole('button', { name: 'Request extra work', exact: true }).click();
  await page.getByLabel('Change title').fill('Menu illustrations');
  await page.getByLabel('What would you like to add?').fill('Three illustrated seasonal drinks');
  await page.getByRole('button', { name: 'Send change request', exact: true }).click();
  await page.getByRole('button', { name: 'Back to studio', exact: true }).click();
  await page.getByRole('button', { name: 'Publish quote', exact: true }).click();
  await page.getByLabel('Quote amount').fill('125.50');
  await page.getByLabel('Quote note').fill('Three print-ready illustrations');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Publish quote', exact: true })
    .click();
  await expect(page.getByText('$125.50')).toBeVisible();
  await page.getByRole('button', { name: 'Propose new deadline', exact: true }).click();
  await page.getByLabel('Proposed deadline').fill('2026-12-15');
  await page.getByLabel('Reason for the new deadline').fill('Time for the extra illustrations');
  await page.getByRole('button', { name: 'Send deadline proposal', exact: true }).click();
  await page.getByRole('button', { name: 'Client preview', exact: true }).click();
  await page.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Accept deadline', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('accepted', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Due Dec 15, 2026', { exact: true })).toBeVisible();
});
test('demo controls requests, milestones, custom templates, archive, settings and exports', async ({
  page,
}) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'New milestone', exact: true }).click();
  await page.getByLabel('Milestone title').fill('Launch checklist');
  await page.getByRole('button', { name: 'Create milestone', exact: true }).click();
  const milestone = page.locator('.ws-milestone').filter({ hasText: 'Launch checklist' });
  await milestone.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(
    milestone.getByRole('button', { name: 'Mark incomplete', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await expect(milestone.locator('small')).toContainText('· Complete');
  await expect(
    milestone.getByRole('button', { name: 'Mark incomplete', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Requests', exact: true }).click();
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await page.getByLabel('Request title').fill('Final copy');
  await page.getByLabel('Instructions').fill('Please send the final copy');
  await page.getByLabel('Enable email reminders').check();
  await page.getByRole('button', { name: 'Create request', exact: true }).click();
  await expect(page.getByText(/Reminders enabled/).last()).toBeVisible();
  await page.getByRole('button', { name: 'Client preview', exact: true }).click();
  await page.getByRole('button', { name: 'Respond to Final copy', exact: true }).click();
  await page.getByLabel('Response').fill('Draft copy');
  await page.getByRole('button', { name: 'Send response', exact: true }).click();
  await page.getByRole('button', { name: 'Back to studio', exact: true }).click();
  const request = page
    .locator('.ws-card')
    .filter({ has: page.getByRole('heading', { name: 'Final copy', exact: true }) });
  await request.getByRole('button', { name: 'Reject response', exact: true }).click();
  await page.getByLabel('Reason for rejection').fill('Please send the final version');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reject response', exact: true })
    .click();
  await expect(request.getByText('rejected', { exact: true })).toBeVisible();
  await request.getByRole('button', { name: 'Reopen request', exact: true }).click();
  await request.getByText('Response history (1)', { exact: true }).click();
  await expect(request.getByText('Draft copy', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Handover', exact: true }).click();
  await page.getByRole('button', { name: 'Save project as template', exact: true }).click();
  await page.getByLabel('Template name').fill('My launch process');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  const template = page
    .locator('.ws-card')
    .filter({ has: page.getByRole('heading', { name: 'My launch process', exact: true }) });
  await template.getByRole('button', { name: 'Edit template', exact: true }).click();
  await page.getByLabel('Template name').fill('Refined launch process');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Refined launch process', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await page.getByRole('button', { name: 'Archive project', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText(/archived project is read only/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore project', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Edit studio settings', exact: true }).click();
  await page.getByLabel('Studio name').fill('Browser Studio');
  await page.getByLabel('Weekly client digest').uncheck();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText(/Weekly digest disabled/)).toBeVisible();
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export workspace JSON', exact: true }).click();
  expect((await exported).suggestedFilename()).toBe('clientlane-workspace.json');
});
test('demo rejects stale forms after reset and lets users recover corrupt storage', async ({
  page,
  context,
}) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'New client', exact: true }).click();
  await page.getByLabel('Client name').fill('Preserved draft');
  await page.getByLabel('Client email').fill('preserved@example.test');
  const second = await context.newPage();
  await second.goto('/demo');
  await second.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await second.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Create client', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed in another tab');
  await expect(page.getByLabel('Client name')).toHaveValue('Preserved draft');
  await page.getByRole('button', { name: 'Create client', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('clientlane-demo-v1', 'not-json'));
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be read');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity for today.' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('bulk CSV projects have reachable upcoming actions beyond the first ten', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const rows = Array.from(
    { length: 15 },
    (_, i) =>
      `Bulk ${String(i).padStart(2, '0')},Nora,nora-bulk@example.test,Studio,Imported record,2030-01-01,2`,
  );
  await page
    .getByLabel('CSV content')
    .fill(
      'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\n' +
        rows.join('\n'),
    );
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByText('15 projects ready to import')).toBeVisible();
  await page.getByRole('button', { name: 'Import 15 projects', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const upcoming = page
    .locator('.ws-card')
    .filter({ has: page.getByRole('heading', { name: 'Coming up', exact: true }) });
  await expect(upcoming.getByRole('button', { name: /Check Bulk 14/ })).toHaveCount(0);
  await expect(upcoming.locator('.ws-action-row')).toHaveCount(10);
  await upcoming.getByRole('button', { name: 'Show more upcoming actions', exact: true }).click();
  await upcoming.getByRole('button', { name: 'Show more upcoming actions', exact: true }).click();
  await upcoming.getByRole('button', { name: /Check Bulk 14/ }).click();
  await expect(page.getByRole('heading', { name: 'Bulk 14', exact: true })).toBeVisible();
});
