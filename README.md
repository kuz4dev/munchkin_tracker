# Munchkin Tracker

Real-time level tracker for the Munchkin board game: every player edits their own
stats from their phone and the whole table sees changes instantly.

| Path | What |
|---|---|
| `server/` | Go game server: WebSocket rooms, Postgres persistence |
| `packages/core/` | Platform-independent game logic (protocol, store, connection) |
| `apps/web/` | React web app (Vite, Tailwind, shadcn/ui), installable as a PWA |

## Development

Requirements: Node 22, Go 1.25+, Docker.

```sh
npm install                 # workspaces: packages/core and apps/web
docker compose up -d db     # Postgres on localhost:5433
```

Game server:

```sh
cd server && DATABASE_URL=postgres://munchkin:munchkin@localhost:5433/munchkin go run ./cmd/server
```

Web app on http://localhost:5173 (proxies `/api` and `/ws` to the server):

```sh
npm run dev
```

Production builds talk to the server at `VITE_API_URL` (same origin if unset).

The web app is a PWA: it can be installed to the home screen, keeps the screen
on during a game and offers a reload when a new version is deployed. Icons are
generated from `apps/web/public/icon.svg`:

```sh
cd apps/web && npx pwa-assets-generator
```

Test the production build (service worker, CSP) with `npm run build && npm run preview -w @munchkin/web`.

## Tests

```sh
npm test                                   # core and web
npm run typecheck && npm run lint && npm run build
cd server && go test ./...                 # server (set TEST_DATABASE_URL for Postgres tests)
```

## Analytics

No cookies and no personal data, so no consent banner is needed.

- **Traffic** (visitors, countries, devices, referrers): Cloudflare Web Analytics, enabled in the Pages project (Metrics → Web Analytics). Cloudflare injects its script; the CSP allows it.
- **Game funnel**: run `SELECT * FROM daily_stats LIMIT 30;` in the Neon SQL editor. One row per day (UTC): visits and launches of the installed app, rooms created, rooms where friends joined, finished games, players, median game length, invites shared, install clicks and confirmed installs.

The app sends the counters with `track()` (`apps/web/src/lib/metrics.ts`) to `POST /api/metrics`. The server accepts only known event names, counts them in memory and writes per-day totals to `app_metrics` once a minute.
