-- Harness mirror tables (synced through change_log like the 0001 tables) and
-- device roles. Only devices with role = 'harness' may write the h_* tables.

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
