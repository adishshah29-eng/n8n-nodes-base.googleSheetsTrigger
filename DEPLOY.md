# Deploying Aotan on Vercel

One Vercel project serves everything: the PWA (`client/`, static) and the API (one plain Node.js function,
`api/index.js`). `vercel.json` already wires this up. **No database server is needed**: storage is a SQLite
file, using the SQLite built into Node.

## 1. Storage (nothing to set up)

- **On Vercel** the file is `/tmp/aotan.db`, the only writable place. Vercel wipes `/tmp` when the function
  goes idle and restarts. That is safe for the demo, because the **phone is the durable copy**. Every sync
  re-sends the worker's profile, photo and certificates. If the server had lost them, the phone re-sends
  all its attempts too. Device tokens are signed, so they stay valid across a reset.
  What does *not* survive a restart: the admin dashboard's history (until phones sync again) and
  revocations. Set `SEED_DEMO=1` so the dashboard always has demo data after a restart.
- **On a normal server or laptop** the file is `data/aotan.db` and is kept. `DATABASE_PATH` overrides
  the location.
- Sites for the enrollment form come from `content/sites.json`: edit it and redeploy.

Check it with `https://<your-domain>/api/health`. It shows the storage path, whether it is ephemeral, and
row counts.

## 2. Keys and secrets

```
node scripts/gen-key.js
```

prints two lines. **Keep `ED25519_PRIVATE_KEY` private**: anyone who has it can forge certificates.

| Variable | Where | Value |
| --- | --- | --- |
| `ED25519_PRIVATE_KEY` | Vercel env (server) | from `gen-key.js` |
| `VITE_CERT_PUBLIC_KEY` | Vercel env (**build**) | from `gen-key.js`; baked into the client at build time |
| `ADMIN_PASSWORD` | Vercel env (server) | long random password for `/admin` |
| `ADMIN_JWT_SECRET` | Vercel env (server) | long random string, e.g. `openssl rand -hex 32` |
| `VITE_VERIFY_BASE_URL` | Vercel env (build), optional | `https://aotan.arovat.com`, so the QR always points at the public domain |
| `CERT_VALIDITY_MONTHS` | Vercel env (server), optional | default 12 (our assumption, not a DGMS rule) |
| `SEED_DEMO` | Vercel env (server), optional | `1`: fill a fresh database with demo data for the dashboard |

Rotating the signing key invalidates every certificate issued under the old key, and the client must be
rebuilt (redeploy) so `VITE_CERT_PUBLIC_KEY` matches.

## 3. Deploy

1. Import the repo in Vercel (framework preset: **Other**; `vercel.json` sets the build).
2. Add the environment variables above (build-time ones for *Production* and *Preview*).
3. Deploy, then add the domain `aotan.arovat.com` under Project → Domains.

Camera access (AR) and service workers need **HTTPS**, which Vercel provides.

All of `/api/*` is one function (`api/index.js`, reached through a rewrite in `vercel.json`), so every
request shares the same SQLite file. Separate functions would each get their own `/tmp`.

## 4. After the first deploy

- `https://<domain>/api/health` returns `{"ok":true,"storage":"sqlite",...}`.
- If enrollment says the server is not ready, the response names what is missing (usually
  `ED25519_PRIVATE_KEY`).
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
npx vercel dev                  # client + api together (data in data/aotan.db)
npm run seed                    # optional: demo data for the dashboard
npm test                        # server tests (each uses its own temporary SQLite file)
npm test --prefix client        # client unit tests
npm run e2e                     # full browser run (needs only Chromium), see e2e/README.md
npm run budget                  # after building the client: asset size limits
```

Before every demo rehearsal, use the checklist in the implementation plan, and run `npm run e2e` once.
