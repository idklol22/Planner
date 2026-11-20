-- The router pages events by a numeric cursor (D1 used rowid); give Postgres an equivalent.
ALTER TABLE event ADD COLUMN seq bigserial;
CREATE UNIQUE INDEX idx_event_seq ON event(seq);
