# Aotan

AR safety-training prototype: scenarios run offline in a PWA, results sync to a server that issues Ed25519-signed QR certificates.

```
client/    PWA (worker app + /admin) — Vite + TypeScript, MindAR, three.js, Dexie
server/    Express + PostgreSQL API, certificate signing
content/   scenarios (JSON), compiled AR targets, 3D models, audio clips
markers/   printable A4 marker PDFs
```

## Run

```
cd server && cp .env.example .env && npm i && npm run migrate && npm run dev
cd client && npm i && npm run dev
```

See the implementation plan for scope and schedule.
