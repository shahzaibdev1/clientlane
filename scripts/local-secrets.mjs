import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { URL } from 'node:url';

export function canSetupLocally(existingEnvironment) {
  const configuredUrl = parseEnv(existingEnvironment).NEXT_PUBLIC_SUPABASE_URL;
  if (configuredUrl === undefined) return true;
  try {
    const url = new URL(configuredUrl);
    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function localJobsSecret(existingEnvironment) {
  const existingSecret = parseEnv(existingEnvironment).JOBS_SECRET;
  if (existingSecret !== undefined) {
    if (existingSecret.length < 32)
      throw new Error(
        'The existing jobs secret is invalid. Restore the previous key before continuing.',
      );
    return existingSecret;
  }
  return randomBytes(32).toString('hex');
}
