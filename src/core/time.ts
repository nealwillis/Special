// Wall-clock date/time helpers.
//
// Shifts are stored as local wall-clock strings with no time zone ("2026-11-26T22:00").
// Every conversion goes through Date.UTC so the result never depends on the time zone of
// the phone, the CI runner or the server. The cost: a shift that crosses a DST change is
// off by one hour (see Known limitations in the README).

export type LocalDateTime = string; // YYYY-MM-DDTHH:mm
export type DateKey = string; // YYYY-MM-DD

export const MINUTES_PER_DAY = 24 * 60;

const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function utcMinutes(y: number, mo: number, d: number, h: number, mi: number): number | null {
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(ms);
  // Date.UTC silently rolls Feb 30 over to Mar 2; the round trip catches that.
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    back.getUTCHours() !== h ||
    back.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return ms / 60000;
}

/** Minutes since 1970-01-01T00:00 wall clock, or null if the string is not a real date/time. */
export function parseLocalDateTime(value: string): number | null {
  const m = DATE_TIME_RE.exec(value);
  if (!m) return null;
  return utcMinutes(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

/** Minutes since epoch at 00:00 on the given date, or null if invalid. */
export function parseDateKey(value: string): number | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  return utcMinutes(+m[1], +m[2], +m[3], 0, 0);
}

export function formatLocalDateTime(minutes: number): LocalDateTime {
  const d = new Date(minutes * 60000);
  return `${toDateKey(minutes)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function toDateKey(minutes: number): DateKey {
  const d = new Date(minutes * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function dateKeyFromParts(year: number, month: number, day: number): DateKey {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(key: DateKey): number {
  const min = parseDateKey(key);
  if (min === null) throw new Error(`Invalid date: ${key}`);
  return new Date(min * 60000).getUTCDay();
}

export function addDays(key: DateKey, days: number): DateKey {
  const min = parseDateKey(key);
  if (min === null) throw new Error(`Invalid date: ${key}`);
  return toDateKey(min + days * MINUTES_PER_DAY);
}

/** The first day of the workweek that contains `key`. */
export function startOfWeek(key: DateKey, weekStartsOn: number): DateKey {
  const offset = (dayOfWeek(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}
