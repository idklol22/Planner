# Planner hub

A small Cloudflare Worker + D1 backend for Planner. It stores client rows
(`category`, `task`, `goal`, `meal` and the read-only harness mirror tables
`h_subject`, `h_topic`, `h_material`, `h_deadline`), serves a sync feed,
records events and commands, stores files in R2, and publishes a private
iCalendar feed. There is no UI wiring here.

## Local development

```bash
cd hub
npm install
npx wrangler d1 migrations apply planner --local
npx wrangler dev
```

The Worker listens on `http://127.0.0.1:8787` by default. `wrangler.toml`
defines the D1 binding `DB` (database name `planner`) and a dev-only
`ALLOWED_ORIGINS` list. `CAL_SECRET` is deliberately **not** checked in: create
a `.dev.vars` file for local work:

```dotenv
CAL_SECRET=dev-calendar-secret
```

Restart `wrangler dev` after changing `.dev.vars`.

## Making a device token

Every JSON endpoint uses `Authorization: Bearer <token>`. Generate a random
32-byte token and the insert statement with:

```bash
npm run new-device -- "my laptop"
```

Add `--role harness` for the laptop agent, which is the only device allowed to
write the `h_*` mirror tables:

```bash
npm run new-device -- "laptop" --role harness
```

The script prints the token once and the SQL plus ready-to-run
`npx wrangler d1 execute planner --local --command '...'` (or `--remote`)
lines. Only the token's SHA-256 hash is stored in the `device` table; its
`role` defaults to `user`. Revoke a device later with
`UPDATE device SET revoked_at = CURRENT_TIMESTAMP WHERE id = 'dev_...'`.

To revoke locally:

```bash
npx wrangler d1 execute planner --local --command "UPDATE device SET revoked_at = datetime('now') WHERE id = 'dev_...'"
```

## API

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /ops` `{ops:[{table,row}]}` | Bearer | Upsert `category`/`task`/`goal`/`meal` and (role `harness` only) `h_subject`/`h_topic`/`h_material`/`h_deadline`; newest `updatedAt` wins. Returns `{applied,cursor}`. Other devices get 403 for `h_*` writes. |
| `GET /sync?since=<seq>` | Bearer | Up to 500 `{table,row}` changes (including `h_*`), with `cursor` and `more`. |
| `PUT /files/:sha256` (body = bytes, `Content-Type`) | Bearer | Store `files/<sha256>` if missing; 400 if the body hash differs. Returns `{sha256,bytes}`. |
| `GET /files/:sha256` (`Range` supported) | Bearer | Stream the file; 200 or 206, 404 if missing. |
| `HEAD /files/:sha256` | Bearer | 200 or 404, so agents can skip uploads. |
| `POST /events` / `GET /events?since=` | Bearer | Store/list events; `idempotencyKey` deduplicates posts. |
| `POST /commands`, `POST /commands/claim {device}`, `POST /commands/:id/complete {status,result}` | Bearer | Queue, atomically claim (5-minute lease), and finish commands. |
| `GET /cal/<CAL_SECRET>.ics` | calendar secret | Tasks with a `time`; recurring tasks get an `RRULE`. |

Rows in JSON use camelCase (`linkedSubjectId`, `updatedAt`, …); D1 columns are
snake_case. A task's note is stored in `note_json`. Recurring `rrule` values
`daily`, `weekdays`, `weekly` and `days:1,3,5` (0=Sunday) map to RFC 5545
rules; an existing `FREQ=…` value is passed through.

CORS echoes an `Origin` only when it appears in the comma-separated
`ALLOWED_ORIGINS` variable. `OPTIONS` requests are answered without auth.

## Tests and typecheck

```bash
npm test
npx tsc --noEmit
```

Tests run in the Workers runtime via `@cloudflare/vitest-pool-workers` and
apply both migrations to an isolated local D1 database and R2 bucket.

## Deploy to Cloudflare (free)

Workers, D1 and R2 all have free tiers ample for a personal planner. Run these
steps in order from `planner/hub`:

1. Log in: `npx wrangler login` (opens a browser).
2. Create the D1 database: `npx wrangler d1 create planner`.
3. Create the R2 bucket: `npx wrangler r2 bucket create planner-files`.
4. Paste the `database_id` from step 2 into the `[[d1_databases]]` block of
   `wrangler.toml`, replacing `local-dev`.
5. Set the secrets: `npx wrangler secret put CAL_SECRET`, then
   `npx wrangler secret put ALLOWED_ORIGINS` (comma-separated app origins).
6. Deploy: `npm run deploy` (applies migrations remotely, then deploys the
   Worker). Note the Worker URL.
7. Make device tokens: `npm run new-device -- "laptop" --role harness`,
   `npm run new-device -- "iphone"`, `npm run new-device -- "desktop"`. For
   each, run the printed `npx wrangler d1 execute planner --remote --command
   '...'` line, then paste the token into that device's settings.

Nothing has been deployed as part of this task.
