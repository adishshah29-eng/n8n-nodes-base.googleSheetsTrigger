// Asset budget check, run after `npm run build --prefix client`:  node scripts/check-budget.js
// Limits come from the implementation plan so a full install stays small enough for a cheap phone on site Wi-Fi.
//   each .glb            < 2 MB
//   each scenario        < 8 MB   (its models + its audio clips, all languages)
//   whole install        < 25 MB  (everything the service worker precaches)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MB = 1024 * 1024;
const LIMITS = { glb: 2 * MB, scenario: 8 * MB, install: 25 * MB };
const root = join(fileURLToPath(import.meta.url), '../..');
const dist = join(root, 'client/dist');

if (!existsSync(dist)) {
  console.error('client/dist not found: run `npm run build --prefix client` first');
  process.exit(2);
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(dist).map((f) => ({ path: relative(dist, f), size: statSync(f).size }));
const mb = (n) => (n / MB).toFixed(2) + ' MB';
const problems = [];

for (const f of files.filter((f) => f.path.endsWith('.glb')))
  if (f.size > LIMITS.glb) problems.push(`${f.path} is ${mb(f.size)} (limit ${mb(LIMITS.glb)} per .glb)`);

const scenarioDir = join(root, 'content/scenarios');
for (const file of readdirSync(scenarioDir).filter((f) => f.endsWith('.json'))) {
  const s = JSON.parse(readFileSync(join(scenarioDir, file), 'utf8'));
  const models = new Set(s.steps.map((st) => st.model).filter(Boolean));
  const size = files
    .filter((f) => (f.path.startsWith('audio/') && f.path.split('/').pop().startsWith(`${s.id}_`)) || [...models].some((m) => f.path === `models/${m}.glb`))
    .reduce((n, f) => n + f.size, 0);
  console.log(`scenario ${s.id.padEnd(14)} ${mb(size)}  (limit ${mb(LIMITS.scenario)})`);
  if (size > LIMITS.scenario) problems.push(`scenario ${s.id} is ${mb(size)} (limit ${mb(LIMITS.scenario)})`);
}

const total = files.reduce((n, f) => n + f.size, 0);
console.log(`whole install        ${mb(total)}  (limit ${mb(LIMITS.install)})`);
const biggest = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
console.log('largest files:\n' + biggest.map((f) => `  ${mb(f.size).padStart(9)}  ${f.path}`).join('\n'));
if (total > LIMITS.install) problems.push(`install is ${mb(total)} (limit ${mb(LIMITS.install)})`);

if (problems.length) {
  console.error('\nOVER BUDGET:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('\nwithin budget');
