# End-to-end tests

Real browser, real API handlers, real Postgres — the closest thing to the demo that runs unattended.

```
DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run e2e
npm run e2e -- demo            # only specs whose file name contains "demo"
```

The runner (`run.mjs`) creates a throwaway database on the local server you point it at, makes a fresh
signing key, builds the client with the matching public key, starts `server.mjs` (a small stand-in for
`vercel dev` that routes the real files in `api/`), runs each spec in `specs/`, then drops the database.
It refuses non-local databases.

| Spec | Covers |
| --- | --- |
| `01-enroll-home` | language picker, Ol Chiki font, enrollment (offline refusal, photo, site), "ready offline", airplane-mode reload |
| `02-scenario` | both scenarios in 2D: wrong try then pass, critical fail, timeout, scoring and what the server stores |
| `03-ar` | MindAR finds the marker in a fake camera feed, fps cap, tracking-lost hint, no-marker mode, fallbacks |
| `04-demo-flow` | the 3-minute demo script, start to finish, including the judge scanning the QR and the revoke |
| `05-admin` | seed script, dashboard pages, filters, revoke, CSV export |

Needs Chromium (`CHROMIUM_PATH`, default `/opt/pw-browsers/chromium`). The AR specs use Chromium's fake
camera streaming the printed marker, with software WebGL, so frame rates are lower than on a phone.
What this cannot cover: a physical camera, glare on a printed marker, a real phone's performance and heat.
