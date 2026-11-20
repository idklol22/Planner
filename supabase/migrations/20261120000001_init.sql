-- Planner hub schema, translated from hub/migrations/0001 + 0002 to Postgres (Supabase).
-- Timestamps stay ISO-8601 TEXT to match the API; JSON payloads become jsonb.

-- 0001_init ------------------------------------------------------------------

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
  note_json jsonb,
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
  payload_json jsonb,
  ts TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_event_ts ON event(ts);

CREATE TABLE command (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'done', 'failed')),
  claimed_by TEXT,
  lease_until TEXT,
  result_json jsonb,
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
  seq bigserial PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_change_log_table_row ON change_log(table_name, row_id);

-- 0002_harness_mirror --------------------------------------------------------

ALTER TABLE device ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

CREATE TABLE h_subject (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE h_topic (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE h_material (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  topic_id TEXT,
  file_name TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'text')),
  sha256 TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  lecture TEXT,
  date TEXT,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE h_deadline (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  topic_id TEXT,
  title TEXT NOT NULL,
  due TEXT NOT NULL,
  kind TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Only the service role (held by the Edge Function) may access these tables.
-- Enabling RLS with no policies denies all anon/authenticated access.

ALTER TABLE category ENABLE ROW LEVEL SECURITY;
ALTER TABLE task ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal ENABLE ROW LEVEL SECURITY;
ALTER TABLE event ENABLE ROW LEVEL SECURITY;
ALTER TABLE command ENABLE ROW LEVEL SECURITY;
ALTER TABLE device ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE h_subject ENABLE ROW LEVEL SECURITY;
ALTER TABLE h_topic ENABLE ROW LEVEL SECURITY;
ALTER TABLE h_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE h_deadline ENABLE ROW LEVEL SECURITY;

-- Atomically claim the oldest queued or lease-expired command.
CREATE OR REPLACE FUNCTION claim_command(p_device text, p_lease_seconds int)
RETURNS command
LANGUAGE plpgsql
AS $$
DECLARE
  v_now text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_lease_until text := to_char(
    (now() + make_interval(secs => p_lease_seconds)) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  v_command command;
BEGIN
  SELECT * INTO v_command
  FROM command
  WHERE status = 'queued'
     OR (status = 'claimed' AND lease_until IS NOT NULL AND lease_until <= v_now)
  ORDER BY created_at ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE command
  SET status = 'claimed',
      claimed_by = p_device,
      lease_until = v_lease_until,
      updated_at = v_now
  WHERE id = v_command.id
  RETURNING * INTO v_command;

  RETURN v_command;
END;
$$;

insert into storage.buckets (id, name, public) values ('files','files',false) on conflict do nothing;
