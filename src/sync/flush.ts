/** Pure helper for the best-effort push sent when a tab hides or the app closes. */

import type { HubOp } from "../storage/hub";

/** Caller limits: at most 40 ops in at most 60 KB of `{ ops }` JSON. */
export const KEEPALIVE_MAX_OPS = 40;
export const KEEPALIVE_MAX_BYTES = 60_000;

/** The longest prefix of `ops` whose `{ ops }` body fits both limits.
 *  An op is never split: the first one that does not fit ends the batch. */
export function keepaliveBatch(ops: HubOp[], maxOps: number, maxBytes: number): HubOp[] {
  const batch: HubOp[] = [];
  for (const op of ops.slice(0, Math.max(0, maxOps))) {
    const candidate = [...batch, op];
    if (JSON.stringify({ ops: candidate }).length > maxBytes) break;
    batch.push(op);
  }
  return batch;
}
