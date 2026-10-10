import { expect, test } from '@playwright/test';

test('private routes refresh sessions and prevent browser caching or referrer disclosure', async ({
  request,
}) => {
  const protectedPage = await request.get('/app', { maxRedirects: 0 });
  expect(protectedPage.status()).toBe(307);
  const destination = new URL(protectedPage.headers().location, protectedPage.url());
  expect(destination.pathname).toBe('/login');
  expect(destination.searchParams.get('next')).toBe('/app');
  for (const route of ['/login', '/reset', '/portal/invalid-release-test-token']) {
    const response = await request.get(route);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
});

test('scheduled email endpoint rejects missing and incorrect secrets over real HTTP', async ({
  request,
}) => {
  for (const headers of [{}, { Authorization: 'Bearer incorrect-release-test-secret' }]) {
    const response = await request.post('/api/jobs', { headers });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized' });
  }
});

test('private file proxy refuses an unauthenticated guessed path and an invalid portal token', async ({
  request,
}) => {
  for (const suffix of ['', '&token=invalid-release-test-token']) {
    const response = await request.get(
      `/api/files?path=other-workspace/project/private.txt${suffix}`,
    );
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toContain('no-store');
    const result = await response.json();
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error).not.toContain('other-workspace');
  }
});
