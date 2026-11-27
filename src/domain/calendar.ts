/** Task-load shade for a calendar day, mirroring LearnHarness Today's `levelOf`. */
export function calendarHeatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}
