import { expect, test } from 'vitest';
import { parseEnv } from 'node:util';
import {
  canSetupLocally,
  localJobsSecret,
  localJobsSecretAssignment,
} from '../../scripts/local-secrets.mjs';

test('local setup protects hosted environments including quoted HTTPS configuration', () => {
  expect(canSetupLocally('NEXT_PUBLIC_SUPABASE_URL="https://hosted.example.test"\n')).toBe(false);
  expect(canSetupLocally('NEXT_PUBLIC_SUPABASE_URL=http://hosted.example.test\n')).toBe(false);
});

test('local setup leaves malformed existing environment URLs intact', () => {
  expect(canSetupLocally('NEXT_PUBLIC_SUPABASE_URL=not-a-url\n')).toBe(false);
});

test('local setup accepts a first run and an existing local instance', () => {
  expect(canSetupLocally('')).toBe(true);
  expect(canSetupLocally('NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\n')).toBe(true);
});

test('repeated local setup preserves the encryption key for existing portal emails', () => {
  const key = 'existing-test-only-encryption-key-with-32-characters';
  expect(localJobsSecret(`JOBS_SECRET=${key}\nSMTP_PORT=55325\n`)).toBe(key);
});

test('local setup preserves quoted keys using dotenv syntax', () => {
  const key = 'quoted-test-only-encryption-key-with-32-characters';
  expect(localJobsSecret(`JOBS_SECRET="${key}" # existing configuration\n`)).toBe(key);
});

test('first local setup creates a strong key when none exists', () => {
  expect(localJobsSecret('SMTP_PORT=55325\n')).toMatch(/^[a-f0-9]{64}$/);
});

test('local setup rejects an existing invalid key without silently changing it', () => {
  expect(() => localJobsSecret('JOBS_SECRET=too-short\n')).toThrow(/existing.*secret/i);
});

test('local setup writes hash characters and surrounding spaces without changing the existing key', () => {
  const key = ' existing-test-only-key-with-a-hash#and-space ';
  const assignment = localJobsSecretAssignment(`JOBS_SECRET='${key}'\n`);
  expect(parseEnv(assignment).JOBS_SECRET).toBe(key);
});

test('local setup preserves quote characters when a safe dotenv delimiter exists', () => {
  for (const key of [
    'existing-test-only-key-with-double-"-quote',
    "existing-test-only-key-with-single-'-quote",
  ]) {
    const delimiter = key.includes("'") ? '"' : "'";
    expect(
      parseEnv(localJobsSecretAssignment(`JOBS_SECRET=${delimiter}${key}${delimiter}\n`))
        .JOBS_SECRET,
    ).toBe(key);
  }
});

test('local setup rejects keys that cannot be safely rewritten before touching the environment', () => {
  for (const suffix of ['\\', '$', '\'"']) {
    const key = `existing-test-only-key-with-32-characters${suffix}`;
    const environment = `JOBS_SECRET=\`${key}\`\n`;
    expect(() => localJobsSecretAssignment(environment)).toThrow(/safely.*preserve/i);
  }
});
