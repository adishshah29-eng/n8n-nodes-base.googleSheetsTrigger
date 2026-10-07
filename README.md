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
npm run migrate
npx vercel dev              # serves client + api/ together
```

Deploy: import the repo in Vercel; `vercel.json` builds `client/` and serves `api/` as functions. Set `DATABASE_URL` in project env vars.

See the implementation plan for scope and schedule.
