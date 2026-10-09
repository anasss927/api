# polsec-api

A lightweight REST API backend for a Discord bot key / whitelist / loader system
(similar to PolSec). Node.js + Express + SQLite (via `better-sqlite3`). No heavy
dependencies, single SQLite file, easy to deploy on Railway, Render, or any VPS.

## Stack

- **Express** — HTTP server / routing
- **better-sqlite3** — embedded, synchronous SQLite (fast, zero external DB to run)
- **jsonwebtoken** — optional JWT admin sessions (a static secret also works)
- **express-rate-limit** — rate limiting on sensitive routes
- **cors** — CORS enabled for all routes

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set JWT_SECRET / ADMIN_SECRET to long random strings
npm start
```

The server listens on `PORT` (default `3000`). A `data.sqlite` file is created
automatically on first run — no separate database server needed.

For local development with auto-restart:

```bash
npm run dev
```

## Authentication

Admin-only routes accept **either**:

- Header `X-Admin-Secret: <ADMIN_SECRET>` — use this directly, no login step, or
- Header `Authorization: Bearer <token>` — obtained from `POST /admin/login`

Use the JWT flow if you don't want to pass the raw admin secret on every request
from your bot.

## Endpoints

### Health

| Method | Path      | Auth | Description       |
|--------|-----------|------|--------------------|
| GET    | `/health` | none | Health check       |

### Admin

| Method | Path            | Auth  | Description                          |
|--------|-----------------|-------|---------------------------------------|
| POST   | `/admin/login`  | none  | Exchange `ADMIN_SECRET` for a JWT     |
| GET    | `/admin/stats`  | admin | Key / whitelist / link stats          |

### Keys

| Method | Path                  | Auth  | Description                              |
|--------|-----------------------|-------|--------------------------------------------|
| POST   | `/keys`               | admin | Create a single key                        |
| POST   | `/keys/bulk`          | admin | Create keys in bulk                        |
| GET    | `/keys`               | admin | List all keys                              |
| GET    | `/keys/:key/validate` | none  | Check if a key is valid (rate limited)     |
| POST   | `/keys/:key/redeem`   | none  | Redeem a key for a Discord ID              |
| GET    | `/keys/:key/loader`   | none  | Get the raw link / loader string           |
| PATCH  | `/keys/:key/loader`   | admin | Set a custom loader string / raw link      |
| POST   | `/keys/:key/revoke`   | admin | Revoke a key without deleting it           |
| DELETE | `/keys/:key`          | admin | Permanently delete a key                   |

### Whitelist

| Method | Path                     | Auth  | Description                     |
|--------|--------------------------|-------|-----------------------------------|
| POST   | `/whitelist`             | admin | Add a Discord user ID             |
| GET    | `/whitelist`             | admin | List whitelisted users            |
| GET    | `/whitelist/:discordId`  | none  | Check if a user is whitelisted    |
| DELETE | `/whitelist/:discordId`  | admin | Remove a user from the whitelist  |

### Links

| Method | Path               | Auth  | Description                                   |
|--------|--------------------|-------|-------------------------------------------------|
| POST   | `/links`           | none  | Link a Discord ID with a key and/or external ID |
| GET    | `/links/:discordId`| none  | Get linked data for a Discord ID                |
| DELETE | `/links/:discordId`| admin | Unlink a Discord ID                             |

### Apply / access requests

| Method | Path          | Auth  | Description                     |
|--------|---------------|-------|-----------------------------------|
| POST   | `/apply`      | none  | Submit an access request          |
| GET    | `/apply`      | admin | List access requests              |
| PATCH  | `/apply/:id`  | admin | Approve / reject a request        |

All rate-limited public routes are capped at 10 requests/minute per IP by
default; general routes are capped at 30 requests/minute per IP. Adjust in
`src/middleware/rateLimit.js`.

## Example requests

Get an admin JWT:

```bash
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"secret":"your_admin_secret"}'
```

Create a key (expires in 7 days, single use):

```bash
curl -X POST http://localhost:3000/keys \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your_admin_secret" \
  -d '{"note":"discord giveaway","maxUses":1,"expiresInSeconds":604800}'
```

Create 50 keys in bulk:

```bash
curl -X POST http://localhost:3000/keys/bulk \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your_admin_secret" \
  -d '{"count":50,"note":"batch-1"}'
```

Validate a key:

```bash
curl http://localhost:3000/keys/POLSEC-AB12-CD34-EF56-7890/validate
```

Redeem a key for a Discord user:

```bash
curl -X POST http://localhost:3000/keys/POLSEC-AB12-CD34-EF56-7890/redeem \
  -H "Content-Type: application/json" \
  -d '{"discordId":"123456789012345678"}'
```

Get the loader string / raw link for a redeemed key:

```bash
curl http://localhost:3000/keys/POLSEC-AB12-CD34-EF56-7890/loader
```

Set a custom loader string on a key:

```bash
curl -X PATCH http://localhost:3000/keys/POLSEC-AB12-CD34-EF56-7890/loader \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your_admin_secret" \
  -d '{"loaderString":"loadstring(game:HttpGet(\"https://example.com/raw/abc\"))()"}'
```

Add a user to the whitelist:

```bash
curl -X POST http://localhost:3000/whitelist \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your_admin_secret" \
  -d '{"discordId":"123456789012345678","note":"vip"}'
```

Check whitelist status:

```bash
curl http://localhost:3000/whitelist/123456789012345678
```

Link a Discord ID to a key:

```bash
curl -X POST http://localhost:3000/links \
  -H "Content-Type: application/json" \
  -d '{"discordId":"123456789012345678","key":"POLSEC-AB12-CD34-EF56-7890"}'
```

Get admin stats:

```bash
curl http://localhost:3000/admin/stats -H "X-Admin-Secret: your_admin_secret"
```

## Deploying

- **Railway / Render**: set `JWT_SECRET`, `ADMIN_SECRET`, and optionally
  `RAW_LINK_BASE_URL` as environment variables in the dashboard, set the
  start command to `npm start`. The SQLite file is written to the working
  directory — attach a persistent volume/disk if you need the data to survive
  redeploys (on Railway: add a volume mounted at the project directory; on
  Render: add a disk and set `DB_PATH` to a path inside it).
- **VPS**: `git clone`, `npm install`, `cp .env.example .env` and fill it in,
  then run with `pm2 start src/server.js --name polsec-api` or a systemd unit.

## Notes

- All responses are JSON.
- Errors return `{ "error": "..." }` with an appropriate HTTP status code.
- The `access_requests` table is a lightweight inbox for `/apply` submissions
  from a Discord form/bot command — extend as needed.
- No frontend is included, this is API-only.
