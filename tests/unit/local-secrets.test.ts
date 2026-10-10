import { expect, test } from 'vitest';
import { canSetupLocally, localJobsSecret } from '../../scripts/local-secrets.mjs';

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
