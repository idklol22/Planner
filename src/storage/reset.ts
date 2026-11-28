import { LETCODE_CURSOR_KEY, LETCODE_SEEN_KEY, MIRROR_KEY } from "../sync/controller";
import { CONFLICTS_KEY } from "../sync/conflicts";
import { CURSOR_KEY, LAST_SYNC_KEY } from "../sync/engine";
import { OUTBOX_KEY } from "../sync/queue";
import { DATA_KEY, HANDOFF_PREFIX } from "./local";
import { BACKUP_KEY, QUARANTINE_PREFIX, hasPendingSafetyCopies } from "./recovery";

/** Everything "Reset all data" removes: planner data, the sync outbox, cursor and read-only mirror, the LetCode
 *  processed keys and cursor, and hand-off files. Settings (theme, glass, Hub URL/token, list prefs) are NOT here. */
export const RESET_KEYS: readonly string[] = [
  DATA_KEY,
  OUTBOX_KEY,
  CURSOR_KEY,
  LAST_SYNC_KEY,
  MIRROR_KEY,
  LETCODE_CURSOR_KEY,
  LETCODE_SEEN_KEY,
  BACKUP_KEY,
  CONFLICTS_KEY,
];
export const RESET_PREFIXES: readonly string[] = [HANDOFF_PREFIX, QUARANTINE_PREFIX];

/** Settings keys that must survive a reset (used by the test). */
export const KEPT_KEYS_EXAMPLE: readonly string[] = ["planner.hub.v1", "planner.theme", "planner.fx", "planner.anim", "planner.prefs"];

export function clearPlannerLocalData(storage: Pick<Storage, "length" | "key" | "removeItem">): string[] {
  const doomed = new Set<string>(RESET_KEYS);
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && RESET_PREFIXES.some((p) => k.startsWith(p))) doomed.add(k);
  }
  // A reset is another path that removes the data key. If a safety copy is
  // still missing, the original (and the copies already made) must survive.
  if (hasPendingSafetyCopies(storage)) {
    doomed.delete(DATA_KEY);
    doomed.delete(BACKUP_KEY);
    for (const k of doomed) {
      if (RESET_PREFIXES.some((p) => k.startsWith(p))) doomed.delete(k);
    }
  }
  for (const k of doomed) storage.removeItem(k);
  return [...doomed];
}
