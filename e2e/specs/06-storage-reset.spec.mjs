// On Vercel the SQLite file lives in /tmp and is wiped when the function restarts. The phone is the
// durable copy; this checks that a reset in the middle of the demo is survivable.
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { BASE, chooseOption, doParts, enrolledPhone, launch, sql, step, text } from '../lib.mjs';

console.log('Server storage wiped after the certificate was issued (Vercel restart): phone restores it');

const png = new PNG({ width: 8, height: 8 });
png.data.fill(150);
const photo = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
const browser = await launch();
const { page, workerId } = await enrolledPhone(browser, { name: 'Reset Worker', photo });
let certId, verifyUrl;

await step('worker passes and gets a certificate', async () => {
  await page.goto(`${BASE}/scenario?id=fire-panel&ar=0`);
  await page.waitForSelector('button:has-text("Continue")', { timeout: 60000 });
  await page.locator('button:has-text("Continue")').click();
  await chooseOption(page, 'alarm');
  await doParts(page, ['pull', 'aim', 'squeeze', 'sweep']);
  await page.waitForSelector('a[href="/certificate"]', { timeout: 20000 });
  [{ id: certId }] = await sql('SELECT id FROM certificates WHERE worker_id = ?', [workerId]);
  const token = await page.evaluate(async (id) => {
    const db = await new Promise((res) => { const r = indexedDB.open('aotan'); r.onsuccess = () => res(r.result); });
    const c = await new Promise((res) => { const q = db.transaction('certificates').objectStore('certificates').get(id); q.onsuccess = () => res(q.result); });
    db.close();
    return c.token;
  }, certId);
  verifyUrl = `${BASE}/v#${token}`;
});

await step('the server loses everything (as after a Vercel restart)', async () => {
  for (const t of ['attempts', 'certificates', 'workers']) await sql(`DELETE FROM ${t}`);
  assert.equal((await sql('SELECT count(*) AS n FROM certificates'))[0].n, 0);
});

const judge = await (await launch()).newPage({ viewport: { width: 390, height: 844 } });
await step('a judge scanning now still sees a genuine certificate (signature), not "Not valid"', async () => {
  await judge.goto(verifyUrl);
  await judge.waitForSelector('.banner');
  await judge.waitForTimeout(300);
  assert.equal(await judge.locator('.banner').innerText(), 'Valid');
  assert.match(await text(judge), /no record of it right now/);
});

await step('the worker opens their certificate: the phone restores worker, photo, certificate and attempts', async () => {
  await page.goto(`${BASE}/certificate`);
  await page.waitForSelector('.qr svg');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && (await sql('SELECT count(*) AS n FROM attempts WHERE worker_id = ?', [workerId]))[0].n === 0) await page.waitForTimeout(250);
  const [w] = await sql('SELECT name, photo_url FROM workers WHERE id = ?', [workerId]);
  assert.equal(w?.name, 'Reset Worker');
  assert.equal(w.photo_url, photo);
  assert.equal((await sql('SELECT count(*) AS n FROM certificates WHERE id = ?', [certId]))[0].n, 1, 'same certificate id restored');
  assert.equal((await sql('SELECT count(*) AS n FROM attempts WHERE worker_id = ?', [workerId]))[0].n, 1, 'attempt re-sent');
});

await step('the judge scans again: Valid, with the worker photo and name', async () => {
  await judge.goto('about:blank');
  await judge.goto(verifyUrl);
  await judge.waitForSelector('.banner');
  await judge.waitForTimeout(300);
  assert.equal(await judge.locator('.banner').innerText(), 'Valid');
  assert.match(await text(judge), /Reset Worker/);
  assert.equal(await judge.locator('img.photo').count(), 1);
});

await browser.close();
await judge.context().browser().close();
