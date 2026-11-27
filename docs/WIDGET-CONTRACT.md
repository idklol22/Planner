# Widgets and Health: shared contract

iPhone Home Screen widgets cannot share files with the app when it is sideloaded with a free Apple ID, so the widgets
talk to the Supabase hub. All timestamps are ISO-8601 UTC strings; `date` is a local calendar day `YYYY-MM-DD`.

## Hub tables (migration `20261127000004_widget_health.sql`, RLS enabled like the others)
- `health`: sync table named `health`. `id TEXT PRIMARY KEY` (always `health_<date>`), `date TEXT NOT NULL`,
  `active_kcal double precision`, `steps integer`, `exercise_min double precision`, `distance_km double precision`,
  `sleep_hours double precision`, `resting_hr double precision`, `workouts_json jsonb`, `source TEXT`,
  `updated_at TEXT NOT NULL`, `deleted_at TEXT`.
- `widget_profile`: `id TEXT PRIMARY KEY` (single row `default`), `data_json jsonb NOT NULL`, `updated_at TEXT NOT NULL`.

## Health row (JSON, POST /ops and GET /sync)
`{ id, date, activeKcal: number|null, steps: number|null, exerciseMin: number|null, distanceKm: number|null,
sleepHours: number|null, restingHr: number|null, workouts: [{type: string, minutes: number, kcal: number|null}],
source: "healthkit"|"shortcut", updatedAt, deletedAt: string|null }`
Validation (400 otherwise): id equals `health_` + date; date matches YYYY-MM-DD; every number is null or finite and
>= 0 (steps integer <= 1000000, activeKcal <= 50000, exerciseMin <= 1440, distanceKm <= 1000, sleepHours <= 24,
restingHr <= 400); workouts has at most 50 entries.

## Device roles
`widget` is a new device role. A `widget` token may ONLY call `GET /widget` and `POST /widget/action`; every other
authenticated route answers 403.

## POST /widget/token   (role `user` only, others 403)
No body needed. Revokes every earlier `widget` device, creates a new one and returns `201 {"token": "<64 hex>"}`.
Only the SHA-256 of the token is stored.

## PUT /widget/profile   (roles `user`)
Body (max 100 KB):
`{ calorieGoal: number (0..100000),
   theme: { bg, surface, text, muted, faint, accent, accentContrast: string, dark: boolean },
   goals: [{ id: string, categoryId: string, title: string, done: boolean, order: number }]  (max 500) }`
Stored as is in `widget_profile`. Answers `{"ok": true}`.

## GET /widget?date=YYYY-MM-DD   (roles `widget` and `user`; 400 without a valid date)
Built live from the database:
```
{ "date": "2026-11-27",
  "generatedAt": "<iso>",
  "theme": <profile theme> | null,
  "calories": { "eaten": 920, "goal": 2000 | null,
                "lastWidgetEntry": {"id": "wcal_...", "kcal": 250, "at": "<iso>"} | null,
                "burned": 410 | null, "steps": 8000 | null },
  "categories": [{ "id", "name", "color", "order",
                   "goals": [{ "title", "done" }] }],
  "tasks": [{ "id", "title", "date", "done": bool, "categoryId": string|null, "seriesId": string|null,
              "time": string|null, "deadline": bool, "order": number, "subtasksDone": n, "subtasksTotal": n }] }
```
- eaten = sum of kcal of meals with that date and no deletedAt. lastWidgetEntry = newest (createdAt) such meal whose id
  starts with `wcal_`. burned/steps come from health row `health_<date>` (null when absent).
- categories: not deleted and not archived, sorted by order. Goals come from the profile, filtered by categoryId,
  sorted by order.
- task rows considered: not deleted, not archived, and (not done OR date >= the requested date). `tasks` lists only
  top-level ones (parentId null), sorted by date, order, id. subtasks counts come from the considered rows whose
  parentId is that task. A recurring template (rrule set, seriesId null) reports seriesId = its own id.
- At most 1000 task rows; page through the database if needed rather than relying on its default limit.

## POST /widget/action   (roles `widget` and `user`)
One of:
- `{ "type": "task.set_done", "taskId": string, "done": boolean, "at": iso }`
  404 if the task is missing or deleted. If the row's updatedAt is newer than `at` AND `at` is more than 5 minutes old,
  ignore it (answer `{"ok": true, "ignored": true}`). Otherwise upsert the FULL existing row with done, completedAt
  (= at when done, else null) and updatedAt = `at`, or 1 ms after the row's updatedAt if that is later.
- `{ "type": "calories.add", "id": "wcal_<8..64 of [A-Za-z0-9-]>", "kcal": integer 1..10000, "date", "at" }`
  Upserts meal `{id, date, slot: "", label: "", kcal, createdAt: at, updatedAt: at, deletedAt: null}`. Repeating the
  same action is harmless (an older updatedAt never overwrites).
- `{ "type": "calories.remove", "id": "wcal_...", "at": iso }`
  404 if missing; sets deletedAt = at with updatedAt newer than the row's. Only ids starting `wcal_`.
Answers `{"ok": true}`. Writes go through the same path as POST /ops so they appear in GET /sync.

## Widget code (pasted into the widget settings)
`"PLW1." + base64url(UTF-8 JSON {"u": "<hub base url, no trailing slash>", "t": "<widget token>"})`, no padding.

## App side (TypeScript)
Native plugin registered as `PlannerNative` (iOS only; every call must be skipped elsewhere):
- `reloadWidgets(): Promise<void>`
- `readHealth({ days: number }): Promise<{ days: Array<Omit<HealthRow, "id"|"updatedAt"|"deletedAt"|"source">> }>`
  asks permission when needed; rejects with a readable message when Health is unavailable.

## Deep links (URL scheme `planner`)
- `planner://today` opens the day view on today.
- `planner://calories` opens today with the calorie input open.
- `planner://health?date=YYYY-MM-DD&active=420&steps=8000&exercise=30&distance=5.2&sleep=7.5&hr=58`
  records one day of health data from an Apple Shortcut. All values optional except at least one; `date` defaults to
  today; numbers may contain thousands separators or a unit suffix ("8,000", "420 kcal") and are validated with the
  limits above; invalid values are ignored.
