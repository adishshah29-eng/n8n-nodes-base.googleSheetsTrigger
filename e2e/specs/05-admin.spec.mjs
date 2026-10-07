import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ADMIN_PASSWORD, BASE, launch, sql, step } from '../lib.mjs';

console.log('Admin dashboard with demo data (also exercises scripts/seed-demo.js)');

await step('seed script fills the database', async () => {
  const r = spawnSync('node', ['scripts/seed-demo.js'], { env: process.env, cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /seeded: 24 workers/);
  assert.ok((await sql('SELECT count(*)::int AS n FROM certificates WHERE revoked_at IS NOT NULL'))[0].n >= 1);
});

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('    PAGE ERROR:', e.message));

await step('wrong password is refused, correct one logs in', async () => {
  await page.goto(`${BASE}/admin`);
  await page.locator('input[type=password]').fill('wrong');
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('text=Wrong password');
  await page.locator('input[type=password]').fill(ADMIN_PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('.stats');
});

await step('overview: counts, pass-rate chart and wrong-first-choice chart', async () => {
  await page.waitForFunction(() => document.querySelectorAll('canvas').length === 2);
  const stats = await page.locator('.stat-n').allInnerTexts();
  assert.ok(+stats[0] >= 24, 'workers enrolled');
  assert.ok(+stats[2] > 0, 'attempts counted');
  const [{ n }] = await sql('SELECT count(*)::int AS n FROM workers');
  assert.equal(+stats[0], n);
});

await step('scenario filter narrows the overview', async () => {
  const before = (await page.locator('.stat-n').allInnerTexts())[2];
  await page.locator('select').nth(1).selectOption('conveyor-loto');
  await page.waitForFunction((b) => document.querySelectorAll('.stat-n')[2]?.textContent !== b, before);
  const after = +(await page.locator('.stat-n').allInnerTexts())[2];
  const [{ n }] = await sql("SELECT count(*)::int AS n FROM attempts WHERE scenario_id='conveyor-loto' AND flag IS NULL");
  assert.equal(after, n);
  await page.locator('select').nth(1).selectOption('');
});

await step('workers page lists everyone with certificate status', async () => {
  await page.locator('nav a:has-text("Workers")').click();
  await page.waitForSelector('tbody tr');
  const [{ n }] = await sql('SELECT count(*)::int AS n FROM workers');
  assert.equal(await page.locator('tbody tr').count(), n);
  const badges = new Set(await page.locator('tbody .badge').allInnerTexts());
  assert.ok(badges.has('valid') && badges.has('revoked'));
});

await step('attempt detail shows every choice in order', async () => {
  await page.locator('nav a:has-text("Attempts")').click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 5);
  await page.locator('tbody tr').first().click();
  await page.waitForSelector('.detail-head');
  assert.ok((await page.locator('tbody tr').count()) >= 1, 'at least one step row');
  assert.ok((await page.locator('tbody .badge').count()) >= 1, 'choices are shown as badges');
  assert.equal(await page.locator('.detail-head img.avatar').count(), 1, 'enrollment photo is shown');
});

await step('certificates: search and revoke from the UI', async () => {
  await page.locator('nav a:has-text("Certificates")').click();
  await page.waitForFunction(() => document.querySelector('button.danger'));
  const valid = (await sql('SELECT count(*)::int AS n FROM certificates WHERE revoked_at IS NULL AND expires_at > now()'))[0].n;
  assert.equal(await page.locator('button.danger').count(), valid);
  page.once('dialog', (d) => d.accept());
  await page.locator('button.danger').first().click();
  await page.waitForFunction((v) => document.querySelectorAll('button.danger').length === v - 1, valid);
  assert.equal((await sql('SELECT count(*)::int AS n FROM certificates WHERE revoked_at IS NULL AND expires_at > now()'))[0].n, valid - 1);
  await page.locator('input[type=search]').fill('EMP-1000');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await page.locator('input[type=search]').fill('');
});

await step('CSV export downloads one row per counted attempt', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button:has-text("Export")').click()]);
  const lines = readFileSync(await dl.path(), 'utf8').trim().split('\r\n');
  const [{ n }] = await sql('SELECT count(*)::int AS n FROM attempts WHERE flag IS NULL');
  assert.equal(lines.length - 1, n);
  assert.match(lines[0], /^attempt_id,received_at/);
});

await step('log out returns to the login form and a reload stays logged out', async () => {
  await page.locator('nav button').click();
  await page.waitForSelector('.admin-login');
  await page.goto(`${BASE}/admin`);
  assert.equal(await page.locator('.admin-login').count(), 1);
});

await browser.close();
