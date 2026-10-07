import assert from 'node:assert/strict';
import { BASE, launch, selfiePng, sql, step, text, waitOfflineReady } from '../lib.mjs';

console.log('Language picker, enrollment, home screen, offline reload');
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('    PAGE ERROR:', e.message));

await step('language picker shows three languages, Continue locked until one is chosen', async () => {
  await page.goto(BASE + '/');
  await page.waitForSelector('.lang');
  assert.equal(await page.locator('.lang').count(), 3);
  assert.ok(await page.locator('button:has-text("Continue")').isDisabled());
});

await step('Ol Chiki font is bundled and loads (phones do not have it)', async () => {
  const ok = await page.evaluate(async () => {
    await document.fonts.load('700 1.8rem "Noto Sans Ol Chiki"', 'ᱥᱟᱱᱛᱟᱲᱤ');
    return document.fonts.check('700 1.8rem "Noto Sans Ol Chiki"', 'ᱥᱟᱱᱛᱟᱲᱤ');
  });
  assert.ok(ok);
});

await step('choosing Santali shows the form (Hindi text until native Santali exists)', async () => {
  await page.locator('.lang', { hasText: 'Santali' }).click();
  await page.locator('button:has-text("Continue")').click();
  await page.waitForSelector('form');
  assert.match(await text(page), /आपकी जानकारी/);
});

await step('empty submit is refused with a message', async () => {
  await page.locator('button[type=submit]').click();
  assert.match(await page.locator('.note').innerText(), /नाम/);
});

await step('offline enrollment explains it needs internet and keeps the form', async () => {
  await page.locator('input').nth(0).fill('Sunil Hembram');
  await page.locator('input').nth(1).fill('EMP-1042');
  await page.locator('select').selectOption({ label: 'E2E Mine (Test District)' });
  await page.locator('input[type=file]').setInputFiles(selfiePng());
  await page.waitForSelector('img.photo:not([hidden])');
  await context.setOffline(true);
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('.note').innerText(), /इंटरनेट/);
  assert.equal(await page.locator('input').nth(0).inputValue(), 'Sunil Hembram');
  await context.setOffline(false);
});

await step('online enrollment lands on home and the worker is stored server-side with photo and site', async () => {
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('.home');
  assert.match(await text(page), /Sunil Hembram/);
  const [w] = await sql("SELECT lang, site_id, photo_url, employer_id FROM workers WHERE name = 'Sunil Hembram'");
  assert.equal(w.lang, 'sat');
  assert.ok(w.site_id);
  assert.match(w.photo_url, /^data:image\/jpeg;base64,/);
  assert.ok(w.photo_url.length < 100_000, 'photo was downscaled');
  assert.equal(w.employer_id, 'EMP-1042');
});

await step('home lists both scenarios and the badge turns "ready offline" only after precaching', async () => {
  assert.equal(await page.locator('.scenario').count(), 2);
  await page.waitForSelector('.offline-badge.ready', { timeout: 20000 });
  await waitOfflineReady(page);
});

await step('airplane mode + reload still shows the home screen', async () => {
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.home');
  assert.match(await text(page), /Sunil Hembram/);
  assert.equal(await page.locator('.offline-badge.ready').count(), 1);
});

await browser.close();
