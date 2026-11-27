-- Planner/harness messages. Timestamps stay ISO-8601 TEXT, attachments are jsonb.
-- Only the service role (held by the Edge Function) may access these tables;
-- enabling RLS with no policies denies all anon/authenticated access.

CREATE TABLE message (
  id TEXT PRIMARY KEY,
  subject_id TEXT, topic_id TEXT,
  sender TEXT NOT NULL CHECK (sender IN ('planner','harness')),
  text TEXT NOT NULL DEFAULT '',
  attachments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  delivered_at TEXT, deleted_at TEXT
);
CREATE INDEX idx_message_created_at ON message(created_at);
ALTER TABLE task ADD COLUMN archived_at TEXT;
ALTER TABLE meal ADD COLUMN created_at TEXT;
ALTER TABLE message ENABLE ROW LEVEL SECURITY;
