# Aotan

AR safety-training prototype: scenarios run offline in a PWA, results sync to a server that issues Ed25519-signed QR certificates.

```
client/    PWA (worker app + /admin) — Vite + TypeScript, MindAR, three.js, Dexie
api/       Vercel serverless functions — plain Node.js, no framework
lib/       shared server code (db)
db/        SQL migrations
scripts/   migrate.js
content/   scenarios (JSON), compiled AR targets, 3D models, audio clips
markers/   printable A4 marker PDFs
```

## Run

```
npm i && npm i --prefix client
cp .env.example .env        # set DATABASE_URL (Neon / Vercel Postgres)
node scripts/gen-key.js     # prints ED25519_PRIVATE_KEY (server env) and VITE_CERT_PUBLIC_KEY (client env)
npm run migrate
npm test                    # needs DATABASE_URL pointing at a disposable DB
npx vercel dev              # serves client + api/ together
```

Deploy: import the repo in Vercel; `vercel.json` builds `client/` and serves `api/` as functions. Set `DATABASE_URL` and `ED25519_PRIVATE_KEY` in project env vars, and `VITE_CERT_PUBLIC_KEY` for the client build (it is baked in at build time, so changing the key needs a redeploy). `CERT_VALIDITY_MONTHS` is optional (default 12).

See the implementation plan for scope and schedule.
