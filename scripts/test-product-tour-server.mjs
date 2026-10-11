import assert from 'node:assert/strict';
/* global fetch */
import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const child = spawn(process.execPath, ['scripts/serve-product-tour.mjs', '--port', '3013'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  await once(child.stdout, 'data');
  const base = 'http://127.0.0.1:3013';
  const html = await fetch(base);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  const video = await fetch(`${base}/clientlane-tour.webm`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(video.status, 206);
  assert.equal(video.headers.get('content-type'), 'video/webm');
  assert.match(video.headers.get('content-range'), /^bytes 0-99\//);
  assert.equal((await video.arrayBuffer()).byteLength, 100);
  assert.equal(
    (await fetch(`${base}/clientlane-tour.webm`, { headers: { Range: 'bytes=999999999-' } }))
      .status,
    416,
  );
  assert.equal((await fetch(`${base}/%2e%2e%2fpackage.json`)).status, 403);
  assert.equal((await fetch(`${base}/index.html`, { method: 'POST' })).status, 405);
  console.log('PASS: HTML, WebM MIME, byte ranges, invalid range, path boundary, methods.');
} finally {
  child.kill();
}
