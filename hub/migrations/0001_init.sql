-- Planner hub schema. Columns are the snake_case forms of the app's row shapes.

CREATE TABLE category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  linked_subject_id TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE task (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  category_id TEXT,
  parent_id TEXT,
  series_id TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  time TEXT,
  duration_min INTEGER,
  rrule TEXT,
  deadline INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'general',
  note_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_task_date ON task(date);

CREATE TABLE goal (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL CHECK (period IN ('day', 'week')),
  metric TEXT NOT NULL,
  target REAL NOT NULL,
  scope_category_id TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE meal (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  label TEXT NOT NULL,
  kcal REAL NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE event (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT,
  origin TEXT,
  payload_json TEXT,
  ts TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_event_ts ON event(ts);

CREATE TABLE command (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'done', 'failed')),
  claimed_by TEXT,
  lease_until TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_command_status ON command(status, created_at);

CREATE TABLE device (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE change_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_change_log_table_row ON change_log(table_name, row_id);
