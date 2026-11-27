-- Widget preferences and Health sync rows. As with the other hub tables,
-- timestamps stay ISO-8601 TEXT and only the service role accesses the tables.

CREATE TABLE health (
  id TEXT PRIMARY KEY,              -- always health_<date>
  date TEXT NOT NULL,
  active_kcal double precision,
  steps integer,
  exercise_min double precision,
  distance_km double precision,
  sleep_hours double precision,
  resting_hr double precision,
  workouts_json jsonb,
  source TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_health_date ON health(date);

CREATE TABLE widget_profile (
  id TEXT PRIMARY KEY,              -- single row: 'default'
  data_json jsonb NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE health ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_profile ENABLE ROW LEVEL SECURITY;
