// A real, local-only product walkthrough. No credentials or portal bearer URLs are persisted.
/* global document */
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

process.loadEnvFile('.env.local');
const origin = process.env.TOUR_APP_ORIGIN ?? 'http://127.0.0.1:3001';
if (
  !['localhost', '127.0.0.1'].includes(new URL(origin).hostname) ||
  new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== '127.0.0.1'
)
  throw new Error('Tour fixtures require local application and Supabase.');
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const directory = resolve('docs/product-tour');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const email = `tour-${randomUUID()}@example.test`,
  password = `Tour-${randomUUID()}!`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw new Error('Could not create local tour fixture.');
const userId = created.data.user.id;
let recorded, recording, workspaceId;
const chapters = [],
  cues = [];
const evidence = {
  workflow: {},
  cleanup: {},
  capturedAt: new Date().toISOString(),
  appOrigin: origin,
  silentCaptioned: true,
};
try {
  const prep = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const setup = await prep.newPage();
  setup.setDefaultTimeout(20000);
  await setup.goto(`${origin}/login`);
  await setup.getByLabel('Email address').fill(email);
  await setup.getByLabel('Password', { exact: true }).fill(password);
  await setup.getByRole('button', { name: 'Sign in', exact: true }).click();
  await setup.getByRole('heading', { name: 'A little clarity for today.' }).waitFor();
  await setup.getByRole('button', { name: 'Load sample projects' }).click();
  await setup.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(setup.getByRole('dialog')).toHaveCount(0);
  await setup.getByRole('button', { name: 'Projects', exact: true }).click();
  await setup.getByRole('button', { name: 'Open Field Coffee website' }).click();
  await setup.getByRole('button', { name: 'Share client link', exact: true }).click();
  await setup.getByRole('button', { name: 'Create / rotate secure link', exact: true }).click();
  await setup.getByLabel('Client portal URL').waitFor();
  const portalUrl = await setup.getByLabel('Client portal URL').inputValue();
  const storageState = await prep.storageState();
  const workspaces = await admin.from('workspaces').select('id').eq('owner_id', userId);
  if (workspaces.error || workspaces.data.length !== 1)
    throw new Error('Fixture workspace isolation failed.');
  workspaceId = workspaces.data[0].id;
  await prep.close();

  recording = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: directory, size: { width: 1440, height: 900 } },
  });
  const page = await recording.newPage();
  page.setDefaultTimeout(20000);
  recorded = page.video();
  const started = Date.now();
  const time = () => (Date.now() - started) / 1000;
  const caption = async (role, title, text, chapter = false) => {
    const at = time();
    if (cues.length) cues.at(-1).end = at;
    cues.push({ start: at, end: at, role, title, text });
    if (chapter) {
      chapters.push({ start: at, title, role, text });
      console.log(`Chapter at ${at.toFixed(1)}s: ${title}`);
    }
    await page.evaluate(
      ({ role, title, text }) => {
        let overlay = document.querySelector('#tour-caption');
        if (!overlay) {
          overlay = document.createElement('aside');
          overlay.id = 'tour-caption';
          document.body.append(overlay);
          const style = document.createElement('style');
          style.textContent =
            '#tour-caption{position:fixed;inset:auto 20px 18px;z-index:2147483647;background:#102c29;color:white;border:1px solid #77c1aa;border-radius:16px;padding:18px 26px;box-shadow:0 8px 40px #0004;font-family:Arial,sans-serif;pointer-events:none;display:grid;grid-template-columns:170px 1fr;gap:24px;min-height:90px}#tour-caption small{font-size:15px;letter-spacing:1.5px;color:#b6edce;font-weight:700}#tour-caption strong{font-size:25px;display:block;margin-bottom:8px}#tour-caption p{font-size:21px;line-height:1.35;margin:0;color:#f1f8f5}body{padding-bottom:155px!important}';
          document.head.append(style);
        }
        overlay.replaceChildren();
        const label = document.createElement('small');
        label.textContent = role;
        const copy = document.createElement('div'),
          heading = document.createElement('strong'),
          description = document.createElement('p');
        heading.textContent = title;
        description.textContent = text;
        copy.append(heading, description);
        overlay.append(label, copy);
      },
      { role, title, text },
    );
  };
  const pause = (ms = 5000) => page.waitForTimeout(ms);
  const click = (name) => page.getByRole('button', { name, exact: true }).click();
  const submit = async (name) => {
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  };
  const owner = async () => {
    await page.goto(`${origin}/app`);
    await page.getByRole('heading', { name: 'A little clarity for today.' }).waitFor();
    await click('Projects');
    await click('Open Field Coffee website');
  };
  const client = async () => {
    await page.goto(portalUrl);
    await page.getByRole('heading', { name: 'Field Coffee website', exact: true }).waitFor();
  };
  await page.goto(`${origin}/app`);
  await page.getByRole('heading', { name: 'A little clarity for today.' }).waitFor();
  await caption(
    'FREELANCER',
    'Less chasing. Clearer client decisions.',
    'Clientlane helps freelancers and small studios gather inputs, review versions, agree changes, and hand over approved work.',
    true,
  );
  await pause(8000);
  await caption(
    'FREELANCER',
    'Start with what needs attention',
    'Northline Studio is designing a website for Field Coffee. The dashboard brings missing inputs and review decisions into view.',
  );
  await pause(6000);
  await click('Projects');
  await pause(1000);
  await click('Open Field Coffee website');
  await caption(
    'FREELANCER',
    'Ask for the content you need',
    'Requests put instructions and deadlines in one place. Here the designer asks the café for its final launch message.',
    true,
  );
  await click('Requests');
  await click('New request');
  await page.getByLabel('Request title').fill('Launch headline');
  await page
    .getByLabel('Instructions')
    .fill('What should visitors know first? Please share the approved headline.');
  await page.getByLabel('Due date').fill('2026-10-14');
  await pause(2500);
  await submit('Create request');
  await pause(3000);
  await client();
  await caption(
    'CAFÉ CLIENT',
    'Reply in your private project space',
    'Asha uses the client portal. She can respond to the designer without entering the studio workspace.',
  );
  await click('Requests');
  await click('Respond to Launch headline');
  await page
    .getByLabel('Response', { exact: true })
    .fill('Good coffee. Warm company. Open daily, 7am–6pm.');
  await pause(2500);
  await submit('Send response');
  await page
    .getByText('Good coffee. Warm company. Open daily, 7am–6pm.', { exact: true })
    .waitFor();
  await pause(4500);

  await click('Deliveries');
  await caption(
    'CAFÉ CLIENT',
    'Feedback stays with this version',
    'Asha reviews Homepage design, adds feedback, and asks for a clearer opening-hours section. One revision round is counted.',
    true,
  );
  await click('Add feedback');
  await page
    .getByLabel('Feedback', { exact: true })
    .fill('Love the calm direction. Please make our opening hours more prominent.');
  await submit('Post feedback');
  await pause(2000);
  await click('Request changes');
  await page.getByLabel('Decision note').fill('Move the opening hours beside the main café photo.');
  await pause(2500);
  await submit('Confirm changes');
  await expect(page.getByText('Changes requested', { exact: true })).toBeVisible();
  await pause(4500);

  await owner();
  await click('Deliveries');
  await caption(
    'FREELANCER',
    'Publish a new version',
    'The designer makes the requested change and uploads a private handover note. Earlier feedback stays attached to version 1.',
    true,
  );
  await click('Publish new version');
  await page
    .getByLabel('Delivery note')
    .fill('Opening hours now sit beside the main café photo. Ready for approval.');
  await page.getByLabel('Upload file').setInputFiles({
    name: 'field-coffee-handover.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Field Coffee website — approved homepage direction\nOpening hours: daily 7am–6pm\nLaunch headline: Good coffee. Warm company.\nPrepared by Northline Studio for this local product tour.\n',
    ),
  });
  await page.getByRole('button', { name: 'Remove field-coffee-handover.txt' }).waitFor();
  await pause(2500);
  await submit('Publish version');
  await pause(3000);
  await client();
  await click('Deliveries');
  await caption(
    'CAFÉ CLIENT',
    'Approve the latest work',
    'Asha reviews version 2 and records her approval. The latest approved version becomes available in Handover.',
  );
  await click('Approve work');
  await page.getByLabel('Decision note').fill('Approved. This is ready for our launch.');
  await pause(2000);
  await submit('Confirm approval');
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  await pause(4000);

  await click('Agreements');
  await caption(
    'CAFÉ CLIENT',
    'Make added scope explicit',
    'The café asks for three seasonal drink illustrations. Extra work gets its own request, quote, and client decision.',
    true,
  );
  await click('Request extra work');
  await page.getByLabel('Change title').fill('Seasonal drink illustrations');
  await page
    .getByLabel('What would you like to add?')
    .fill('Please add three illustrated seasonal drinks for the menu.');
  await pause(2000);
  await submit('Send change request');
  await pause(2500);
  await owner();
  await click('Agreements');
  await caption(
    'FREELANCER',
    'Quote the work and propose a date',
    'Northline quotes USD $125.50 and proposes October 28 to allow time for the illustrations. No payment is processed.',
  );
  await click('Publish quote');
  await page.getByLabel('Quote amount').fill('125.50');
  await page.getByLabel('Due date').fill('2026-10-28');
  await page.getByLabel('Quote note').fill('Three print-ready seasonal drink illustrations.');
  await pause(2000);
  await submit('Publish quote');
  await click('Propose new deadline');
  await page.getByLabel('Proposed deadline').fill('2026-10-28');
  await page
    .getByLabel('Reason for the new deadline')
    .fill('Allow time for the additional drink illustrations.');
  await pause(2000);
  await submit('Send deadline proposal');
  await pause(3000);
  await client();
  await click('Agreements');
  await caption(
    'CAFÉ CLIENT',
    'Accept scope and the new deadline',
    'Asha accepts the $125.50 quote and the October 28 deadline. Clientlane records the agreement; invoicing happens elsewhere.',
  );
  await click('Accept quote');
  await pause(1000);
  await submit('Confirm');
  await click('Accept deadline');
  await pause(1000);
  await submit('Confirm');
  await expect(page.getByText('accepted', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Due Oct 28, 2026', { exact: true }).first()).toBeVisible();
  await pause(5000);

  await click('Handover');
  await caption(
    'CAFÉ CLIENT',
    'Leave with approved work',
    'Handover contains the latest approved delivery and its private file. Both sides have a clear record of what was decided.',
    true,
  );
  await expect(page.getByText('APPROVED · VERSION 2', { exact: true })).toBeVisible();
  const fileHref = await page
    .getByRole('link', { name: /field-coffee-handover.txt/ })
    .getAttribute('href');
  const fileResponse = await recording.request.get(new URL(fileHref, origin).href);
  expect(fileResponse.status()).toBe(200);
  expect(await fileResponse.text()).toContain('Field Coffee website');
  await pause(5000);
  const downloadEvent = page.waitForEvent('download');
  await click('Export handover');
  const downloaded = await downloadEvent;
  // The download is checked, but the private fixture export is never included in published artifacts.
  const downloadPath = await downloaded.path();
  const { readFile } = await import('node:fs/promises');
  const handover = JSON.parse(await readFile(downloadPath, 'utf8'));
  expect(handover.deliveries).toHaveLength(1);
  expect(handover.deliveries[0].version.number).toBe(2);
  await caption(
    'THE OUTCOME',
    'One shared record, from input to handover',
    'Use Clientlane when client delivery needs clear requests, version feedback, approvals, and scope decisions. Silent captions; real local application.',
  );
  await pause(7000);
  await page.screenshot({ path: `${directory}/handover.png` });
  const row = await admin.from('workspaces').select('state').eq('id', workspaceId).single();
  if (row.error) throw new Error('Could not verify fixture outcomes.');
  const project = row.data.state.projects.find((p) => p.id === 'field-website');
  expect(project.requests.find((r) => r.title === 'Launch headline').status).toBe('received');
  expect(project.deliveries[0].versions.at(-1).decision.value).toBe('approved');
  expect(project.changes[0].quote.amountCents).toBe(12550);
  expect(project.changes[0].status).toBe('accepted');
  expect(project.deadlineProposals[0].status).toBe('accepted');
  expect(project.dueDate).toBe('2026-10-28');
  evidence.workflow = {
    inputReceived: true,
    feedbackOnVersion1: project.deliveries[0].versions[0].comments.length,
    version1Decision: project.deliveries[0].versions[0].decision.value,
    latestVersion: 2,
    latestApproved: true,
    quoteAmountCents: 12550,
    currency: 'USD',
    quoteAccepted: true,
    deadlineAccepted: true,
    dueDate: project.dueDate,
    handoverExportDeliveries: handover.deliveries.length,
    privateFileDownloadStatus: fileResponse.status(),
    paymentProcessed: false,
  };
  cues.at(-1).end = time();
  await recording.close();
  recording = null;
  await recorded.saveAs(`${directory}/clientlane-tour.webm`);
  const rawPath = await recorded.path();
  if (resolve(rawPath) !== resolve(`${directory}/clientlane-tour.webm`)) {
    const { unlink } = await import('node:fs/promises');
    await unlink(rawPath);
  }
  await writeFile(`${directory}/chapters.json`, JSON.stringify(chapters, null, 2) + '\n');
  const stamp = (n) => {
    const ms = Math.round(n * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  await writeFile(
    `${directory}/captions.vtt`,
    'WEBVTT\n\n' +
      cues
        .map(
          (c, i) =>
            `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.role}: ${c.title}\n${c.text}\n`,
        )
        .join('\n'),
  );
  await writeFile(
    `${directory}/transcript.md`,
    '# Clientlane product walkthrough\n\nSilent, captioned recording of the real local application. The studio and café are fictional fixture data.\n\n' +
      cues
        .map((c) => `## ${stamp(c.start)} · ${c.role}\n\n**${c.title}**\n\n${c.text}\n`)
        .join('\n'),
  );
  evidence.recordedSeconds = cues.at(-1).end;
} finally {
  if (recording) await recording.close();
  if (recorded) {
    const { unlink } = await import('node:fs/promises');
    const raw = await recorded.path();
    if (resolve(raw) !== resolve(`${directory}/clientlane-tour.webm`))
      await unlink(raw).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
  await browser.close();
  await cleanFixture();
}

async function cleanFixture() {
  const rows = await admin.from('workspaces').select('id').eq('owner_id', userId);
  if (rows.error) throw new Error('Cleanup could not enumerate fixture workspace.');
  let removedCount = 0;
  for (const row of rows.data) {
    const files = await admin.from('file_registry').select('path').eq('workspace_id', row.id);
    if (files.error) throw new Error('Cleanup could not enumerate fixture files.');
    for (const file of files.data)
      if (!file.path.startsWith(`${row.id}/`))
        throw new Error('Cleanup file escaped fixture workspace.');
    if (files.data.length) {
      const removed = await admin.storage
        .from('clientlane-private')
        .remove(files.data.map((f) => f.path));
      if (removed.error) throw new Error('Fixture file cleanup failed.');
      for (const file of files.data) {
        const absent = await admin.storage.from('clientlane-private').download(file.path);
        if (!absent.error) throw new Error('Fixture file survived cleanup.');
      }
      removedCount += files.data.length;
    }
  }
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) throw new Error('Fixture account cleanup failed.');
  const account = await admin.auth.admin.getUserById(userId);
  const remains = await admin.from('workspaces').select('id').eq('owner_id', userId);
  if (!account.error || remains.error || remains.data.length)
    throw new Error('Fixture account/workspace survived cleanup.');
  evidence.cleanup = {
    ownerDeleted: true,
    fixtureWorkspacesRemaining: 0,
    exactStorageFilesRemoved: removedCount,
    storageFilesVerifiedMissing: true,
    externalMailSent: false,
  };
  await writeFile(`${directory}/recording-evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(
    JSON.stringify({
      recordedSeconds: evidence.recordedSeconds,
      workflow: evidence.workflow,
      cleanup: evidence.cleanup,
    }),
  );
}
