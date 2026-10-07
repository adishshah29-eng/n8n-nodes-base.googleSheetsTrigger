import assert from 'node:assert/strict';
import { BASE, enrolledPhone, launch, launchWithCamera, makeFeed, step } from '../lib.mjs';

console.log('AR stage: marker tracking, tracking-lost hint, no-marker mode, camera-denied fallback');
const feed = await makeFeed('M102');
const blank = await makeFeed(null);
const tracking = (page) => page.locator('.stage-ar').getAttribute('data-tracking');

await step('MindAR finds the printed marker in the camera feed and renders at <= ~30 fps', async () => {
  const browser = await launchWithCamera(feed);
  const { page } = await enrolledPhone(browser, { contextOptions: { permissions: ['camera'] } });
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('.stage-ar canvas', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.stage-ar')?.dataset.tracking === 'found', null, { timeout: 60000 });
  assert.equal(await page.locator('.tracking-hint').isHidden(), true);
  const f1 = +(await page.locator('.stage-ar').getAttribute('data-frames'));
  await page.waitForTimeout(3000);
  const f2 = +(await page.locator('.stage-ar').getAttribute('data-frames'));
  const fps = (f2 - f1) / 3;
  console.log(`    render rate ${fps.toFixed(1)} fps (software GL)`);
  assert.ok(fps > 3, 'is rendering');
  assert.ok(fps <= 31, 'render loop is capped near 30 fps');
  await browser.close();
});

await step('no marker in view: hint appears; long-press on the logo switches to no-marker mode', async () => {
  const browser = await launchWithCamera(blank);
  const { page } = await enrolledPhone(browser, { contextOptions: { permissions: ['camera'] } });
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('.stage-ar canvas', { timeout: 60000 });
  await page.waitForSelector('.tracking-hint:not([hidden])', { timeout: 20000 }); // 1.5 s grace + a slow software-GL start
  assert.equal(await tracking(page), 'lost');
  const box = await page.locator('.logo').boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.stage-ar')?.dataset.tracking === 'free');
  assert.equal(await page.locator('.tracking-hint').isHidden(), true);
  await browser.close();
});

await step('no camera: falls back to the 3D viewer, says why, and the scenario still plays', async () => {
  const browser = await launch();
  const { page } = await enrolledPhone(browser);
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('button:has-text("Continue")', { timeout: 60000 });
  assert.equal(await page.locator('.stage-ar').count(), 0);
  assert.equal(await page.locator('.stage-viewer canvas, .stage-flat').count(), 1, 'a non-AR stage is showing');
  const chip = page.locator('.stage-chip');
  assert.equal(await chip.getAttribute('data-problem'), 'missing');
  assert.match(await chip.innerText(), /No camera found/);
  await browser.close();
});

await step('camera permission denied: the reason is shown with a retry button', async () => {
  const browser = await launchWithCamera(feed);
  const { page } = await enrolledPhone(browser); // no 'camera' permission granted in this context
  await page.context().clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('.stage-chip', { timeout: 60000 });
  assert.equal(await page.locator('.stage-chip').getAttribute('data-problem'), 'denied');
  assert.equal(await page.locator('.stage-chip button').count(), 1, 'offers "Try camera again"');
  await browser.close();
});

await step('?ar=0 skips AR even when a camera exists', async () => {
  const browser = await launchWithCamera(feed);
  const { page } = await enrolledPhone(browser, { contextOptions: { permissions: ['camera'] } });
  await page.goto(`${BASE}/scenario?id=fire-panel&ar=0`);
  await page.waitForSelector('button:has-text("Continue")');
  assert.equal(await page.locator('.stage-ar').count(), 0);
  await browser.close();
});
