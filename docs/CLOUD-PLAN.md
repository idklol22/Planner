# Cloud plan: Hub in the cloud, Harness mirrored, Planner on iPhone, LetCode linked

Owner decisions (2026-11-20): native iPhone app now (cloud build + AltStore); the Harness's files and notes are
mirrored to the cloud and readable on the phone; AI chats stay on the laptop (queued when it's off); LetCode reports
progress.

```
iPhone Planner (Capacitor app) ─┐                         ┌─ Laptop: Learn Harness (Next.js, AI via Claude Code)
Desktop/web Planner (Pages)    ─┼─► HUB (Cloudflare) ◄───┼─ Laptop: cloud-agent (in the Harness): mirror + commands
                                │   Workers + D1 + R2     └─ Laptop: LetCode (Python) → practice.solved events
```

## Hub additions (planner/hub). Contract shared by all agents.
Auth: same device bearer tokens. All JSON uses camelCase.

### Files (R2 bucket binding `FILES`)
- `PUT  /files/:sha256` (body = bytes, header `Content-Type`). Stores `files/<sha256>` if missing. Idempotent. Returns `{ sha256, bytes }`.
- `GET  /files/:sha256` streams it (range requests supported, for PDFs).
- `HEAD /files/:sha256` returns 200 or 404 (so the agent skips uploads).

### Harness mirror (D1 tables, synced through the existing `/ops` + `/sync` change log)
- `h_subject`  { id, name, color, order, updatedAt, deletedAt? }
- `h_topic`    { id, subjectId, name, order, updatedAt, deletedAt? }
- `h_material` { id, subjectId, topicId|null, fileName, title, kind: "pdf"|"text", sha256, pageCount, lecture|null, date|null, addedAt, updatedAt, deletedAt? }
- `h_deadline` { id, subjectId, topicId|null, title, due, kind, done, updatedAt, deletedAt? }
Only the laptop agent writes these (devices flagged `role: "harness"`); other devices read them.

### Commands used now
- `harness.note` payload `{ externalId, subjectId, topicId?, title, date, markdown, finished }`. The Planner enqueues
  it; the laptop agent runs it against the local `/api/planner/notes` and completes it with `{ materialId }`.
- `harness.capture` payload `{ subjectId, topicId?, text?, fileShas: string[] }`. A phone capture: images uploaded to
  `/files` first, then the agent feeds them to the local `/api/study/inbox`.

### Events
- `practice.solved` { source: "letcode", problemId, title, difficulty, language, timeMs, attempts, solvedAt }
  (idempotencyKey = `letcode:<problemId>:<solvedAt>`).
- `harness.mirrored` { at, materials, bytes } after each mirror pass.

## Learn Harness: cloud-agent
A module started with the Harness server (and a CLI `npm run cloud-agent -- --once`), configured in Settings or
env: `HUB_URL`, `HUB_TOKEN`. Every 60s and on `sources-changed`:
1. Diff the library against the last mirrored state, upload new material files (`HEAD` then `PUT /files`), and push
   changed `h_*` rows via `/ops`.
2. Claim commands (`/commands/claim`, device = machine name) and run `harness.note` / `harness.capture` locally.
3. Post `harness.mirrored`.
Offline-safe: no hub → retry with backoff; nothing breaks locally.

## Planner app
- Wire `src/sync/engine.ts` into the store (tables category, task, goal, meal + read-only h_*). Settings holds the
  Hub URL + device token (pasted once; later a QR code).
- The Harness link uses the HUB, not localhost: the subject dropdown reads `h_subject`/`h_topic`, and the note
  hand-off enqueues `harness.note` (status queued → done from command results). It falls back to direct localhost if
  no hub is configured.
- New **Library** module: subjects → files (from `h_material`) → open the PDF from `/files/:sha256` in an in-app pdf.js
  viewer; deadlines (h_deadline) appear in the Day page as read-only rows.
- LetCode: a `practice.solved` event ticks today's matching task (title contains the problem id or a "LeetCode" task in
  a category) or adds a done task under the "Daily" (or a chosen) category.

## iPhone app (no Mac needed)
- Capacitor 7 wraps the Planner build (`planner/ios`, app id `dev.planner.app`). Native widget later.
- GitHub Actions workflow `ios.yml` on a macOS runner: `npm ci && npm run build && npx cap sync ios`, then
  `xcodebuild` with signing disabled → `Planner.ipa` uploaded as a build artifact.
- The owner installs `Planner.ipa` with AltStore/SideStore (AltServer on Windows, free Apple ID). It refreshes every
  7 days on the same Wi-Fi as the laptop.

## LetCode
A small reporter in LetCode's Python server: when a submission is Accepted, POST a `practice.solved` event to the hub
(queued in `user/outbox.json` if offline). Progress summary mirrored as an event on each solve.

## Things only the owner can do (one-time)
1. Create a free Cloudflare account, then run `cd planner/hub && npx wrangler login` (opens a browser).
2. Create the D1 database and the R2 bucket, then deploy: `npm run deploy` (script provided). Note the Worker URL.
3. Make device tokens (`npm run new-device -- laptop|iphone|desktop`), paste them into the Harness settings and the
   Planner settings.
4. Create a GitHub repo for the Planner (private is fine) so the iOS build workflow can run. Push.
5. Install AltServer on Windows and AltStore on the iPhone, then install the IPA from the workflow artifact.
