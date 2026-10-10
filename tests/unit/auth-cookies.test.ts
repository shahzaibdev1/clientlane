import { expect, test } from 'vitest';
import { authCookieOptions } from '../../src/lib/auth/cookies';
test.each([
  ['https://clientlane.example', true],
  ['https://clientlane.example/app', true],
  ['HTTPS://clientlane.example', true],
  ['  https://clientlane.example  ', true],
  [undefined, false],
  ['invalid URL', false],
  ['http://127.0.0.1:3001', false],
  ['http://localhost:3001', false],
])('auth cookies follow configured transport security for %s', (url, secure) => {
  expect(authCookieOptions(url).secure).toBe(secure);
});
