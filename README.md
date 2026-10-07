# Aotan

AR safety training that runs offline on a cheap Android phone, in the worker's own language, and ends in a
signed QR certificate anyone can verify. Prototype for the demo described in the implementation plan.

```
client/      PWA: worker app, certificate + verify pages, /admin dashboard   (Vite + TypeScript, MindAR, three.js, Dexie)
api/         Vercel serverless functions, plain Node.js (no framework)
lib/         shared server code: db, signing, certificates, plausibility, admin router
db/          SQL migrations
content/     scenarios (JSON), gestures, compiled AR targets, audio clips, icons
markers/     printable A4 markers (PDF) + the images they were compiled from
scripts/     migrate, gen-key, seed-demo, audio script/check, asset budget
e2e/         full-browser tests, including the 3-minute demo script
```

## What works

- **Worker app**: language picker (each button spoken in its own language), enrollment with selfie, home with a
  "Ready offline" badge that only turns green when the install is really complete.
- **Scenarios** (data files in `content/scenarios/`): electrical panel fire, conveyor lock-out/tag-out. Choice cards
  (tap once to hear, again to choose), timed steps, wrong-choice feedback, critical mistakes, P-A-S-S / LOTO action
  sequences. In **AR** on the printed marker (MindAR + three.js, procedural fire/smoke), or a **2D** fallback when
  there is no camera. Long-press the logo for no-marker mode.
- **Offline-first**: attempts queue in IndexedDB and sync on reconnect; the server upserts by attempt id.
- **Certificates**: the server checks plausibility, signs with Ed25519; the QR opens `/v#<token>`, which verifies the
  signature on the device (works offline) and, online, shows revocation status and the worker's photo.
- **Admin** (`/admin`): pass rate per scenario, most common wrong first choice, workers, attempt detail, certificate
  search/revoke, CSV export.

## Run it

```
npm i && npm i --prefix client
cp .env.example .env            # DATABASE_URL, ED25519_PRIVATE_KEY, ADMIN_PASSWORD, ADMIN_JWT_SECRET
node scripts/gen-key.js         # prints ED25519_PRIVATE_KEY and VITE_CERT_PUBLIC_KEY
npm run migrate
npx vercel dev                  # client + api together
```

Deploying: see **[DEPLOY.md](DEPLOY.md)**. Tests:

```
npm test                        # server (needs a LOCAL, disposable DATABASE_URL)
npm test --prefix client        # client unit tests
npm run e2e                     # real browser end to end, see e2e/README.md
npm run budget                  # asset size limits, after building the client
```

## Still needed from people (not code)

- Real marker photos of the actual panel/conveyor (the shipped markers are generated placeholders).
- Voice recordings: `content/audio/RECORDING_SCRIPT.md` lists all 111 clips; `npm run audio:check` tracks progress.
- Native Santali on-screen text (the UI shows Hindi until then) and a native review of the Hindi text.
- Testing on real phones: camera tracking under real light, glare on laminated markers, battery and heat.
