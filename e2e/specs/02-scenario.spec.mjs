import assert from 'node:assert/strict';
import { BASE, chooseOption, doParts, enrolledPhone, launch, sql, step, text } from '../lib.mjs';

console.log('Scenario screen (2D fallback): pass after a wrong try, critical fail, timeout, second scenario');
const browser = await launch(); // no camera -> the flat 2D stage

await step('electrical fire: wrong try, retry, PASS sequence -> certificate, both tries recorded', async () => {
  const { page, workerId } = await enrolledPhone(browser);
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('button:has-text("Continue"), button:has-text("आगे बढ़ें")');
  assert.match(await text(page), /fire has started/);
  await page.locator('button:has-text("Continue")').click();
  await page.waitForTimeout(1200);
  const run = page.locator('.card[data-option=run]');
  await run.click();
  assert.match(await page.locator('.note').innerText(), /Tap again/);
  await run.click();
  assert.match(await text(page), /Running away lets the fire spread/);
  await page.locator('button:has-text("Try again")').click();
  await chooseOption(page, 'alarm');
  await page.waitForTimeout(1200);
  await page.locator('.card[data-part=sweep]').click(); // out of order
  assert.match(await page.locator('.note').innerText(), /Follow the order/);
  const t0 = Date.now();
  await doParts(page, ['pull', 'aim', 'squeeze', 'sweep']);
  await page.waitForSelector('.banner', { timeout: 15000 });
  assert.ok(Date.now() - t0 > 2000, 'the outcome (fire going out) is shown before the result screen');
  assert.match(await text(page), /Well done[\s\S]*70/);
  await page.waitForSelector('a[href="/certificate"]', { timeout: 10000 });
  const [a] = await sql('SELECT passed, score, flag, steps FROM attempts WHERE worker_id = ?', [workerId]);
  assert.deepEqual([a.passed, a.score, a.flag], [true, 70, null]);
  const s2 = a.steps.find((s) => s.stepId === 's2');
  assert.deepEqual([s2.choices, s2.tries], [['run', 'alarm'], 2]);
  assert.equal((await sql('SELECT count(*) AS n FROM certificates WHERE worker_id = ?', [workerId]))[0].n, 1);
});

await step('critical mistake (water): consequence in Hindi, red result, recorded as critical', async () => {
  const { page, workerId } = await enrolledPhone(browser, { lang: 'hi' });
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('button:has-text("Continue"), button:has-text("आगे बढ़ें")');
  await page.locator('button').first().click();
  await chooseOption(page, 'water');
  assert.match(await text(page), /पानी बिजली का संचालन करता है/);
  await page.locator('button').first().click();
  await page.waitForSelector('.banner.bad');
  assert.match(await text(page), /गंभीर गलती/);
  await page.waitForTimeout(1500);
  const [a] = await sql('SELECT passed, critical_fail, score FROM attempts WHERE worker_id = ?', [workerId]);
  assert.deepEqual([a.passed, a.critical_fail, a.score], [false, true, 0]);
  assert.equal((await sql('SELECT count(*) AS n FROM certificates WHERE worker_id = ?', [workerId]))[0].n, 0);
});

await step('running out of time counts as a wrong try and replays the step', async () => {
  const { page } = await enrolledPhone(browser, { contextOptions: {} });
  await page.clock.install();
  await page.goto(`${BASE}/scenario?id=fire-panel`);
  await page.waitForSelector('button:has-text("Continue"), button:has-text("आगे बढ़ें")');
  await page.locator('button').first().click();
  await page.waitForSelector('.timer-bar:not([hidden])');
  await page.clock.fastForward(16000);
  await page.waitForSelector('text=Time is up');
  await page.locator('button:has-text("Try again")').click();
  assert.equal(await page.locator('.card').count(), 3);
});

await step('conveyor lock-out/tag-out: full pass scores 100', async () => {
  const { page, workerId } = await enrolledPhone(browser);
  await page.goto(`${BASE}/scenario?id=conveyor-loto`);
  await page.waitForSelector('button:has-text("Continue"), button:has-text("आगे बढ़ें")');
  await page.locator('button').first().click();
  await chooseOption(page, 'stop');
  await chooseOption(page, 'lock');
  await chooseOption(page, 'test');
  await doParts(page, ['isolate', 'lock', 'tag', 'test']);
  await page.waitForSelector('.banner', { timeout: 15000 });
  assert.match(await text(page), /Well done[\s\S]*100/);
  await page.waitForSelector('a[href="/certificate"]', { timeout: 10000 });
  const [a] = await sql('SELECT scenario_id, passed, score, flag FROM attempts WHERE worker_id = ?', [workerId]);
  assert.deepEqual([a.scenario_id, a.passed, a.score, a.flag], ['conveyor-loto', true, 100, null]);
});

await browser.close();
