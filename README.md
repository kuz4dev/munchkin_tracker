# Munchkin Tracker

Real-time level tracker for the Munchkin board game: every player edits their own
stats from their phone and the whole table sees changes instantly.

| Path | What |
|---|---|
| `server/` | Go game server: WebSocket rooms, Postgres persistence |
| `packages/core/` | Platform-independent game logic (protocol, store, connection) |
| `apps/app/` | Expo (React Native) app for iOS, Android and web |
| `legacy-web/` | Previous Vue web client, kept until the Expo app reaches parity |

## Development

Requirements: Node 22, Go 1.25+, Docker.

```sh
npm install                 # workspaces: packages/core and apps/app
docker compose up -d db     # Postgres on localhost:5433
```

Game server:

```sh
cd server && DATABASE_URL=postgres://munchkin:munchkin@localhost:5433/munchkin go run ./cmd/server
```

App (scan the QR code with Expo Go, or press `w` for web):

```sh
npm run app
```

In development the app talks to the server on port 8080 of the machine running
`expo start`, so a phone on the same Wi-Fi works without configuration. Production
builds need `EXPO_PUBLIC_API_URL` (see `apps/app/.env.example`).

## Tests

```sh
npm test                                   # packages/core
npm run typecheck && npm run lint          # core and app
cd server && go test ./...                 # server (set TEST_DATABASE_URL for Postgres tests)
```
