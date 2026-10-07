# Aotan

AR safety training that runs offline on a cheap Android phone, in the worker's own language, and ends in a
signed QR certificate anyone can verify. Prototype for the demo described in the implementation plan.

```
client/      PWA: worker app, certificate + verify pages, /admin dashboard   (Vite + TypeScript, MindAR, three.js, Dexie)
api/         one Vercel serverless function (api/index.js), plain Node.js; routes in lib/api.js
lib/         server code: SQLite storage, handlers, signing, certificates, plausibility, admin router
db/          SQLite schema (migrations)
content/     scenarios (JSON), gestures, compiled AR targets, audio clips, icons
markers/     printable A4 markers (PDF) + the images they were compiled from
scripts/     gen-key, seed-demo, migrate, audio script/check, asset budget
e2e/         full-browser tests, including the 3-minute demo script
```

## What works

- **Worker app**: language picker (each button spoken in its own language), enrollment with selfie, home with a
  "Ready offline" badge that only turns green when the install is really complete.
- **Scenarios** (data files in `content/scenarios/`): electrical panel fire, conveyor lock-out/tag-out. Choice cards
  (tap once to hear, again to choose), timed steps, wrong-choice feedback, critical mistakes, P-A-S-S / LOTO action
  sequences. In **AR** on the printed marker (MindAR + three.js): physically based materials, soft shadows, image-based
  lighting, shader fire/smoke/embers/CO2, and lighting estimated from the live camera. Without a camera, the same scene
  plays in a **3D viewer** you can drag around. Long-press the logo for no-marker mode. Resolution adapts to hold ~30 fps.
- **Offline-first**: attempts queue in IndexedDB and sync on reconnect; the server upserts by attempt id.
- **Storage**: a SQLite file (Node's built-in SQLite), no database server. On Vercel it lives in `/tmp` and can be
  reset; the phone is the durable copy and restores the worker, photo, certificates and attempts on its next sync.
- **Certificates**: the server checks plausibility, signs with Ed25519; the QR opens `/v#<token>`, which verifies the
  signature on the device (works offline) and, online, shows revocation status and the worker's photo.
- **Admin** (`/admin`): pass rate per scenario, most common wrong first choice, workers, attempt detail, certificate
  search/revoke, CSV export.

## Run it

```
npm i && npm i --prefix client
cp .env.example .env            # ED25519_PRIVATE_KEY, ADMIN_PASSWORD, ADMIN_JWT_SECRET (no database to set up)
node scripts/gen-key.js         # prints ED25519_PRIVATE_KEY and VITE_CERT_PUBLIC_KEY
npx vercel dev                  # client + api together; data goes to data/aotan.db (SQLite)
```

### Testing the camera on a real phone

Phones only allow the camera on **https**. On the same Wi-Fi as your laptop:

```
npx vercel dev                          # API on :3000
npm run dev:phone --prefix client       # https://<laptop-ip>:5173 with a self-signed cert (accept the warning once)
```

Useful URL switches: `?debug=1` shows fps, render scale, quality tier and camera resolution; `?quality=low|high`
overrides the device tier; `?ar=0` shows the 3D viewer instead of AR. If AR cannot start, the scenario screen says
why (no https, permission denied, no camera, camera busy) and offers "Try camera again" where that can help.

Deploying: see **[DEPLOY.md](DEPLOY.md)**. Tests:

```
npm test                        # server (temporary SQLite files; nothing to set up)
npm test --prefix client        # client unit tests
npm run e2e                     # real browser end to end, see e2e/README.md
npm run budget                  # asset size limits, after building the client
```

## Still needed from people (not code)

- Real marker photos of the actual panel/conveyor (the shipped markers are generated placeholders).
- Voice recordings: `content/audio/RECORDING_SCRIPT.md` lists all 111 clips; `npm run audio:check` tracks progress.
- Native Santali on-screen text (the UI shows Hindi until then) and a native review of the Hindi text.
- Testing on real phones: camera tracking under real light, glare on laminated markers, battery and heat.
