import { describe, test, expect } from 'vitest';
import { newToken, hashToken, encryptToken, decryptToken } from '../../src/lib/backend/crypto';
import { safeNext } from '../../src/lib/auth/redirect';
import { readUpload } from '../../src/lib/backend/files';
process.env.JOBS_SECRET = 'test-key-not-used-outside-tests-123456789';
describe('backend security boundaries', () => {
  test('bearer tokens have entropy and authenticated encrypted recovery', () => {
    const a = newToken(),
      b = newToken();
    expect(a).toHaveLength(43);
    expect(a).not.toBe(b);
    const ciphertext = encryptToken(a);
    expect(ciphertext).not.toContain(a);
    expect(hashToken(a)).not.toContain(a);
    expect(decryptToken(ciphertext)).toBe(a);
    const corrupted = Buffer.from(ciphertext, 'base64url');
    corrupted[15] ^= 1;
    expect(() => decryptToken(corrupted.toString('base64url'))).toThrow();
  });
  test.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/login',
    '/auth/callback',
    '/app%0d%0aLocation:x',
    'javascript:alert(1)',
  ])('unsafe recovery redirect %s stays internal', (value) => {
    expect(safeNext(value)).toBe('/app');
  });
  test('safe app and reset paths preserve query', () => {
    expect(safeNext('/app?project=a')).toBe('/app?project=a');
    expect(safeNext('/reset?mode=password')).toBe('/reset?mode=password');
  });
  test('multipart body size is bounded even when content length is absent', async () => {
    const multipart = new FormData();
    multipart.set(
      'file',
      new File([new Uint8Array(22 * 1024 * 1024)], 'large.txt', { type: 'text/plain' }),
    );
    const request = new Request('http://localhost/api/files', { method: 'POST', body: multipart });
    await expect(readUpload(request)).rejects.toThrow(/20MB/i);
  });
  test('bounded upload preserves a normal multipart file', async () => {
    const data = new FormData();
    data.set('projectId', 'project-a');
    data.set('file', new File(['body'], 'note.txt', { type: 'text/plain' }));
    const parsed = await readUpload(
      new Request('http://localhost/api/files', { method: 'POST', body: data }),
    );
    expect(parsed.get('projectId')).toBe('project-a');
    expect(await (parsed.get('file') as File).text()).toBe('body');
  });
});
