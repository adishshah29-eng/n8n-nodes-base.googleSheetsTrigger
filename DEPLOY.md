# Deploying Aotan on Vercel

One Vercel project serves everything: the PWA (`client/`, static) and the API (`api/`, plain Node.js
functions). `vercel.json` already wires this up. You need a Vercel account and a Postgres database.

## 1. Database

Create a Postgres database. Neon or Vercel Postgres both work; use the **pooled** connection string,
because each serverless function instance opens its own connection (`lib/db.js` caps it at one).

```
DATABASE_URL='postgres://…?sslmode=require' npm run migrate
```

Migrations are plain SQL in `db/migrations/` and are applied once each, in order.

## 2. Keys and secrets

```
node scripts/gen-key.js
```

prints two lines. **Keep `ED25519_PRIVATE_KEY` private**: anyone who has it can forge certificates.

| Variable | Where | Value |
| --- | --- | --- |
| `DATABASE_URL` | Vercel env (server) | pooled Postgres URL |
| `ED25519_PRIVATE_KEY` | Vercel env (server) | from `gen-key.js` |
| `VITE_CERT_PUBLIC_KEY` | Vercel env (**build**) | from `gen-key.js`; baked into the client at build time |
| `ADMIN_PASSWORD` | Vercel env (server) | long random password for `/admin` |
| `ADMIN_JWT_SECRET` | Vercel env (server) | long random string, e.g. `openssl rand -hex 32` |
| `VITE_VERIFY_BASE_URL` | Vercel env (build), optional | `https://aotan.arovat.com`, so the QR always points at the public domain |
| `CERT_VALIDITY_MONTHS` | Vercel env (server), optional | default 12 (our assumption, not a DGMS rule) |

Rotating the signing key invalidates every certificate issued under the old key, and the client must be
rebuilt (redeploy) so `VITE_CERT_PUBLIC_KEY` matches.

## 3. Deploy

1. Import the repo in Vercel (framework preset: **Other**; `vercel.json` sets the build).
2. Add the environment variables above (build-time ones for *Production* and *Preview*).
3. Deploy, then add the domain `aotan.arovat.com` under Project → Domains.

Camera access (AR) and service workers need **HTTPS**, which Vercel provides.

Function count: the API is 7 functions (all admin endpoints share `api/admin.js`, reached through a rewrite in `vercel.json`),
inside the Hobby plan's limit of 12.

## 4. After the first deploy

- `curl https://<domain>/api/health` returns `{"ok":true}`.
- Add your sites: `INSERT INTO sites (name, district) VALUES ('Gua Iron Ore Mine', 'West Singhbhum');`
  (the enrollment form shows a site dropdown only when sites exist).
- Optional demo data for the dashboard: `DATABASE_URL=… ED25519_PRIVATE_KEY=… node scripts/seed-demo.js`
  (add `--reset` only on an empty/demo database: it truncates the tables).
- Open `/admin`, log in, check the Overview.
- Install the app on a phone over Wi-Fi, wait for **Ready offline**, then try airplane mode.

## 5. Content that is not in the repo yet

- **Markers**: `markers/M102.pdf` and `markers/M205.pdf` are generated placeholders (busy, high-contrast artwork
  that tracks well). For the real demo, replace `markers/M102.png` and `markers/M205.png` with a photo of the
  actual panel / conveyor (keep a bold border and the station code), then run `npm run targets --prefix client`
  to recompile `content/targets/targets.mind`. The image order is the scenario's `target` number
  (M102 = 0 = fire-panel, M205 = 1 = conveyor-loto). Print the PDFs at 100% on matte paper and laminate matte.
- **Voice clips**: `content/audio/RECORDING_SCRIPT.md` lists every clip to record (111 across three languages).
  `npm run audio:check` shows progress. Until Santali clips exist the app plays the Hindi ones.
- **Santali on-screen text**: the UI falls back to Hindi until a native speaker supplies it (`client/src/i18n.ts`).

## Local development and tests

```
npm i && npm i --prefix client
cp .env.example .env            # fill in values
npm run migrate
npx vercel dev                  # client + api together
npm test                        # server tests; DATABASE_URL must be a local, disposable database
npm test --prefix client        # client unit tests
npm run e2e                     # full browser run (needs local Postgres + Chromium), see e2e/README.md
npm run budget                  # after building the client: asset size limits
```

Before every demo rehearsal, use the checklist in the implementation plan, and run `npm run e2e` once.
