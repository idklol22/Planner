# Planner hub

A small Cloudflare Worker + D1 backend for Planner. It stores client rows
(`category`, `task`, `goal`, `meal`), serves a sync feed, records events and
commands, and publishes a private iCalendar feed. There is no UI wiring here.

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

The script prints the token once and the SQL plus a ready-to-run
`npx wrangler d1 execute planner --local --command '...'` line. Only the
token's SHA-256 hash is stored in the `device` table. Revoke a device later
with `UPDATE device SET revoked_at = CURRENT_TIMESTAMP WHERE id = 'dev_...'`.

To revoke locally:

```bash
npx wrangler d1 execute planner --local --command "UPDATE device SET revoked_at = datetime('now') WHERE id = 'dev_...'"
```

## API

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /ops` `{ops:[{table,row}]}` | Bearer | Upsert `category`/`task`/`goal`/`meal`; newest `updatedAt` wins. Returns `{applied,cursor}`. |
| `GET /sync?since=<seq>` | Bearer | Up to 500 `{table,row}` changes, with `cursor` and `more`. |
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
apply `migrations/0001_init.sql` to an isolated local D1 database.

## Deploying later (not done here)

Workers and D1 both have free tiers that are ample for a personal planner;
this hub needs no paid plan.

1. Create the database: `npx wrangler d1 create planner`, then copy the
   returned `database_id` into the `[[d1_databases]]` block in `wrangler.toml`.
2. Apply migrations remotely: `npx wrangler d1 migrations apply planner --remote`.
3. Set the calendar secret: `npx wrangler secret put CAL_SECRET`. Insert a
   device (see above) with `--remote`.
4. Set `ALLOWED_ORIGINS` to the deployed web app's origin(s) and run
   `npx wrangler deploy`.

Nothing has been deployed as part of this task.
