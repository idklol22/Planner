/** Calendar helpers. Dates are always local `YYYY-MM-DD` strings — no time zones. */
export type ISODate = string;

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function addDays(iso: ISODate, days: number): ISODate {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function startOfMonth(iso: ISODate): ISODate {
  const date = fromISODate(iso);
  return toISODate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function daysInMonth(iso: ISODate): number {
  const date = fromISODate(iso);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** 42 cells (6 weeks) so the grid never changes height between months. */
export function monthGrid(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate[] {
  const first = fromISODate(startOfMonth(iso));
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(first);
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return toISODate(date);
  });
}

export function weekdayLabels(weekStartsOn: 0 | 1 = 1): string[] {
  const sunday = new Date(2024, 0, 7); // a Sunday
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + i + weekStartsOn);
    return formatter.format(date);
  });
}

export function sameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function formatMonth(iso: ISODate): string {
  return fromISODate(startOfMonth(iso)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function formatDay(iso: ISODate): string {
  return fromISODate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
