// The 3-minute demo from the implementation plan, end to end, in one test.
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { ADMIN_PASSWORD, BASE, chooseOption, doParts, enrolledPhone, launch, launchWithCamera, makeFeed, sql, step, text, waitOfflineReady } from '../lib.mjs';

console.log('Demo script: airplane mode -> water mistake -> pass -> sync -> QR -> judge verifies -> admin -> revoke');

const png = new PNG({ width: 16, height: 16 });
for (let i = 0; i < png.data.length; i += 4) png.data.set([200, 120, 90, 255], i);
const photo = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;

const browser = await launchWithCamera(await makeFeed('M102'));
const { page, context, workerId } = await enrolledPhone(browser, { name: 'Demo Worker', lang: 'sat', photo, contextOptions: { permissions: ['camera'] } });
let verifyUrl;

await step('1-2. app is installed and ready offline; airplane mode on', async () => {
  await waitOfflineReady(page);
  await page.reload(); // a controlled page, like opening the installed app
  await page.waitForSelector('.home');
  await context.setOffline(true);
});

await step('3. point at the marker: AR finds it and the fire appears (offline)', async () => {
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('.stage-ar canvas', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.stage-ar')?.dataset.tracking === 'found', null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("आगे बढ़ें")').click(); // Santali UI falls back to Hindi text
});

await step('4. deliberately choose water: consequence in the worker\'s language, attempt ends as critical', async () => {
  await chooseOption(page, 'water');
  assert.match(await text(page), /पानी बिजली का संचालन करता है/);
  await page.locator('button').first().click();
  await page.waitForSelector('.banner.bad');
  assert.match(await text(page), /गंभीर गलती/);
});

await step('5. try again: correct choice and the P-A-S-S sequence -> pass, certificate pending', async () => {
  await page.locator('button:has-text("फिर से कोशिश करें")').click();
  await page.waitForSelector('.stage-ar canvas', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.stage-ar')?.dataset.tracking === 'found', null, { timeout: 60000 });
  await page.locator('button').first().click();
  await chooseOption(page, 'alarm');
  await doParts(page, ['pull', 'aim', 'squeeze', 'sweep']);
  await page.waitForSelector('.banner.ok', { timeout: 20000 });
  assert.match(await text(page), /सिंक के बाद प्रमाणपत्र/);
  assert.equal(await page.locator('a[href="/certificate"]').count(), 0);
});

await step('   nothing reached the server while offline; both attempts wait in the outbox', async () => {
  assert.equal((await sql('SELECT count(*)::int AS n FROM attempts WHERE worker_id = $1', [workerId]))[0].n, 0);
  const queued = await page.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('aotan'); r.onsuccess = () => res(r.result); });
    const n = await new Promise((res) => { const q = db.transaction('outbox').objectStore('outbox').count(); q.onsuccess = () => res(q.result); });
    db.close();
    return n;
  });
  assert.equal(queued, 2);
});

await step('6. airplane mode off: attempts sync and "View certificate" appears on the same screen', async () => {
  await context.setOffline(false);
  await page.waitForSelector('a[href="/certificate"]', { timeout: 15000 });
  const rows = await sql('SELECT passed, critical_fail, flag FROM attempts WHERE worker_id = $1 ORDER BY received_at', [workerId]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.critical_fail), [true, false]);
  assert.ok(rows.every((r) => r.flag === null), 'plausible, so not flagged');
  assert.equal((await sql('SELECT count(*)::int AS n FROM certificates WHERE worker_id = $1', [workerId]))[0].n, 1);
});

await step('7. the certificate screen shows a QR that decodes to the verify URL', async () => {
  await page.locator('a[href="/certificate"]').click();
  await page.waitForSelector('.qr svg');
  const shot = PNG.sync.read(await page.locator('.qr').screenshot());
  const code = jsQR(new Uint8ClampedArray(shot.data), shot.width, shot.height);
  assert.ok(code, 'QR decodes');
  assert.ok(code.data.startsWith(`${BASE}/v#`), code.data.slice(0, 60));
  verifyUrl = code.data;
});

const judge = await (await launch()).newContext({ viewport: { width: 390, height: 844 } });
const judgePage = await judge.newPage();
const judgeSees = async () => {
  await judgePage.goto('about:blank');
  await judgePage.goto(verifyUrl);
  await judgePage.waitForSelector('.banner');
  await judgePage.waitForTimeout(300);
  return { banner: await judgePage.locator('.banner').innerText(), page: await text(judgePage) };
};

await step('8. a judge scans it on their own phone: "Valid", photo, name, scenario', async () => {
  const seen = await judgeSees();
  assert.equal(seen.banner, 'Valid');
  assert.match(seen.page, /Demo Worker/);
  assert.match(seen.page, /fire-panel/);
  assert.equal(await judgePage.locator('img.photo').count(), 1);
});

await step('   a tampered code is rejected', async () => {
  const [head, sig] = verifyUrl.split('#')[1].split('.');
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  await judgePage.goto(`${BASE}/v#${head}.${flipped}`);
  await judgePage.waitForSelector('.banner');
  assert.match(await judgePage.locator('.banner').innerText(), /Not valid/);
});

await step('9. admin dashboard already shows the attempt and the wrong choice', async () => {
  const login = await (await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) })).json();
  const auth = { authorization: `Bearer ${login.token}` };
  const { attempts } = await (await fetch(`${BASE}/api/admin/attempts`, { headers: auth })).json();
  assert.ok(attempts.filter((a) => a.name === 'Demo Worker').length === 2);
  const o = await (await fetch(`${BASE}/api/admin/overview`, { headers: auth })).json();
  assert.ok(o.wrongFirstChoices.some((c) => c.optionId === 'water' && c.stepId === 's2'), 'water is listed as a wrong first choice');

  // 10. revoke, and the same QR now says Revoked
  const certId = JSON.parse(Buffer.from(verifyUrl.split('#')[1].split('.')[0], 'base64url')).c;
  const rev = await fetch(`${BASE}/api/admin/certificates/${certId}/revoke`, { method: 'POST', headers: auth });
  assert.equal(rev.status, 200);
  assert.equal((await judgeSees()).banner, 'Revoked');
});

await browser.close();
await judge.browser().close();
