| D1 (SQLite) table | Postgres (Supabase) table |
| --- | --- |
| category, task, goal, meal | same names (`task.note_json` → `jsonb`) |
| event, command, device, change_log | same names (`payload_json`/`result_json` → `jsonb`, `change_log.seq` → `bigserial`, +`device.role`) |
| h_subject, h_topic, h_material, h_deadline | same names |
