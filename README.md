# Munchkin Tracker

Real-time level tracker for the Munchkin board game: every player edits their own
stats from their phone and the whole table sees changes instantly.

| Path | What |
|---|---|
| `server/` | Go game server: WebSocket rooms, Postgres persistence |
| `packages/core/` | Platform-independent game logic (protocol, store, connection) |
| `apps/web/` | React web app (Vite, Tailwind, shadcn/ui), installable as a PWA |
| `legacy-web/` | Previous Vue web client, kept until the React app reaches parity |

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

## Tests

```sh
npm test                                   # core and web
npm run typecheck && npm run lint && npm run build
cd server && go test ./...                 # server (set TEST_DATABASE_URL for Postgres tests)
```
