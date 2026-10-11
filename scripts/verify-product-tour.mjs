import { chromium, expect } from '@playwright/test';
/* global document, innerWidth, getComputedStyle */
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server = spawn(process.execPath, ['scripts/serve-product-tour.mjs', '--port', '3014'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  await once(server.stdout, 'data');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto('http://127.0.0.1:3014');
  const video = page.locator('video');
  await expect(page.locator('.chapter')).toHaveCount(6);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1);
  const duration = await video.evaluate((v) => v.duration);
  assert.ok(
    Number.isFinite(duration) && duration > 110 && duration < 300,
    `Expected a finite short video duration, got ${duration}`,
  );
  await video.evaluate((v) => v.play());
  await page.waitForFunction(() => document.querySelector('video').currentTime > 1);
  await video.evaluate((v) => v.pause());
  const chapters = JSON.parse(await readFile('docs/product-tour/chapters.json', 'utf8'));
  const results = [];
  for (let index = 0; index < chapters.length; index++) {
    await page.locator('.chapter').nth(index).click();
    await page.waitForFunction(
      (start) =>
        Math.abs(document.querySelector('video').currentTime - start) < 2 &&
        document.querySelector('video').readyState >= 2,
      chapters[index].start,
    );
    await video.evaluate((v) => v.pause());
    const currentTime = await video.evaluate((v) => v.currentTime);
    results.push({
      chapter: chapters[index].title,
      expectedSeconds: chapters[index].start,
      actualSeconds: currentTime,
    });
  }
  await page.locator('summary').click();
  await expect(page.locator('#transcript-copy')).toContainText(
    'One shared record, from input to handover',
  );
  await page.locator('summary').click();
  await page.screenshot({ path: 'docs/product-tour/guide-desktop.png', fullPage: true });
  for (const [label, index] of [
    ['intro', 0],
    ['inputs', 1],
    ['feedback', 2],
    ['revision', 3],
    ['scope', 4],
    ['handover', 5],
  ]) {
    const frameTime = chapters[index].start + 2;
    await video.evaluate((v, seconds) => {
      v.currentTime = seconds;
    }, frameTime);
    await page.waitForFunction(
      (t) =>
        Math.abs(document.querySelector('video').currentTime - t) < 0.2 &&
        document.querySelector('video').readyState >= 2,
      frameTime,
    );
    await page.waitForTimeout(300);
    // Canvas captures the actual decoded video frame, without poster or native controls.
    const bytes = await video.evaluate((v) => {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext('2d').drawImage(v, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await writeFile(`docs/product-tour/video-frame-${label}.png`, Buffer.from(bytes, 'base64'));
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'docs/product-tour/guide-mobile.png', fullPage: true });
  const mobile = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    smallestBodyText: Math.min(
      ...[...document.querySelectorAll('.lead,.context p,.step p,.chapter strong')].map((e) =>
        parseFloat(getComputedStyle(e).fontSize),
      ),
    ),
    overflow: [...document.querySelectorAll('body *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.classList.contains('skip')
        );
      })
      .map((e) => e.tagName + '.' + e.className),
  }));
  assert.equal(mobile.documentWidth, 375);
  assert.equal(mobile.bodyWidth, 375);
  assert.equal(mobile.overflow.length, 0);
  assert.ok(mobile.smallestBodyText >= 15);
  await page.locator('.chapter').last().click();
  await page.waitForFunction(
    (start) => Math.abs(document.querySelector('video').currentTime - start) < 2,
    chapters.at(-1).start,
  );
  await video.evaluate((v) => v.pause());
  const evidence = {
    verifiedAt: new Date().toISOString(),
    durationSeconds: duration,
    nativePlaybackAdvanced: true,
    chapters: results,
    mobileChapterJump: true,
    mobile,
    videoDimensions: await video.evaluate((v) => ({ width: v.videoWidth, height: v.videoHeight })),
    transcriptLoaded: true,
  };
  await writeFile(
    'docs/product-tour/playback-evidence.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence));
} finally {
  if (browser) await browser.close();
  server.kill();
}
