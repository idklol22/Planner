# Running the hub on Supabase

The hub (sync, events, commands, files, calendar feed) can run as a Supabase Edge Function instead of Cloudflare. Same routes, same JSON.

## Steps

1. Log in: `npx supabase login`
2. Link your project: `npx supabase link --project-ref <ref>` (it asks for the database password you set when creating the project).
3. Deploy: `npm run sb:deploy`. This pushes the database migrations (including the private `files` storage bucket) and deploys the `hub` function with `--no-verify-jwt`, so devices use their own token instead of a Supabase login.
4. Set the secrets: `npx supabase secrets set CAL_SECRET=<a long random string> ALLOWED_ORIGINS=<comma-separated app origins>`
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.)
5. Make a token for each device: `npm run sb:new-device -- <name>` (add `--role harness` for the Learn Harness). It prints a token and one line of SQL. Paste the SQL into the dashboard's SQL editor and run it. Keep the token; only its hash is stored.
6. Your base URL is `https://<ref>.supabase.co/functions/v1/hub`. Paste it, with the matching token, into:
   - Planner: Settings, hub URL and token
   - Learn Harness: `HUB_URL` (plus its harness-role token)
   - LetCode: `user/hub.json`
   Quick check: `curl https://<ref>.supabase.co/functions/v1/hub/` returns `{"ok":true,"service":"planner-hub"}`.
7. Free-plan limits: 500 MB database and 1 GB of files. A project with no activity for 7 days is paused; you can resume it from the dashboard.

## Notes

- Calendar feed: `https://<ref>.supabase.co/functions/v1/hub/cal/<CAL_SECRET>.ics`
- Revoke a device by setting its `revoked_at` in the `device` table.
- Tests (no Supabase needed): `npm run test:sb`.
