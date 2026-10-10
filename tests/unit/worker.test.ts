import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});
async function runWorker(base: string, secret: string) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(
      process.execPath,
      ['scripts/notification-worker.mjs', '--once', '--no-env-file'],
      {
        env: { ...process.env, NEXT_PUBLIC_APP_URL: base, JOBS_SECRET: secret },
        windowsHide: true,
      },
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    child.on('close', (code) => resolve({ code, output }));
  });
}
async function listen(status: number, errors = 0) {
  const requests: { method?: string; url?: string; authorization?: string }[] = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ ok: status === 200, data: { queued: 0, sent: 0, errors, cancelled: 0 } }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server');
  return { base: `http://127.0.0.1:${address.port}`, requests };
}
test('notification worker invokes the authenticated scheduled endpoint without exposing its secret', async () => {
  const { base, requests } = await listen(200);
  const secret = 'test-only-secret-with-at-least-32-characters';
  const result = await runWorker(base, secret);
  expect(requests).toEqual([
    { method: 'POST', url: '/api/jobs', authorization: `Bearer ${secret}` },
  ]);
  expect(result.code).toBe(0);
  expect(result.output).not.toContain(secret);
});
test('notification worker reports failed delivery processing with a failing exit code', async () => {
  const { base } = await listen(401);
  const result = await runWorker(base, 'another-long-private-test-secret-32');
  expect(result.code).toBe(1);
  expect(result.output).toContain('401');
  expect(result.output).not.toContain('another-long-private-test-secret-32');
});
test('notification worker refuses an unencrypted remote destination', async () => {
  const result = await runWorker('http://remote.invalid', 'long-enough-secret-for-test-only-32');
  expect(result.code).toBe(1);
  expect(result.output).toContain('HTTPS');
});
test('notification worker surfaces failed emails even when job processing returns HTTP success', async () => {
  const { base } = await listen(200, 2);
  const result = await runWorker(base, 'email-failure-test-private-secret-32');
  expect(result.code).toBe(1);
  expect(result.output).toContain('2 email attempts failed');
  expect(result.output).not.toContain('email-failure-test-private-secret-32');
});
test('continuous worker recovers when the app is unavailable during its first check', async () => {
  let count = 0;
  const server = createServer((_req, res) => {
    count++;
    res.writeHead(count === 1 ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: count > 1 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server');
  const child = spawn(process.execPath, ['scripts/notification-worker.mjs', '--no-env-file'], {
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${address.port}`,
      JOBS_SECRET: 'continuous-worker-only-secret-32-chars',
      NOTIFICATION_INTERVAL_MS: '1000',
    },
    windowsHide: true,
    stdio: 'ignore',
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(count).toBeGreaterThanOrEqual(2);
  } finally {
    child.kill();
  }
});
