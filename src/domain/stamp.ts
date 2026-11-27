/** An updatedAt for a write that must beat `previous` under last-write-wins sync. */
export function newerStamp(now: string, previous: string): string {
  const before = Date.parse(previous);
  return before >= Date.parse(now) ? new Date(before + 1).toISOString() : now;
}
