import process from 'node:process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import { URL } from 'node:url';
import { setInterval } from 'node:timers';

const { fetch, AbortSignal } = globalThis;

if (!process.argv.includes('--no-env-file') && existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
async function tick() {
  const secret = process.env.JOBS_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('A server-only JOBS_SECRET of at least 32 characters is required.');
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001');
  if (
    origin.protocol !== 'https:' &&
    !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  ) {
    throw new Error('Use HTTPS for a remote application.');
  }
  const response = await fetch(new URL('/api/jobs', origin), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Notification processing failed (${response.status}). Check the application and email configuration.`,
    );
  console.log('Notification queue checked.');
}
try {
  if (process.argv.includes('--once')) {
    await tick();
  } else {
    const requestedInterval = Number(process.env.NOTIFICATION_INTERVAL_MS || 60000);
    const interval = Number.isFinite(requestedInterval)
      ? Math.max(1000, Math.min(requestedInterval, 3600000))
      : 60000;
    try {
      await tick();
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Notification processing failed.');
    }
    console.log(`Local notification worker running. Checks every ${interval / 1000} seconds.`);
    let busy = false;
    setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await tick();
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Notification processing failed.');
      } finally {
        busy = false;
      }
    }, interval);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Notification processing failed.');
  process.exitCode = 1;
}
