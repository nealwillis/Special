// Display formatting. Written by hand instead of Intl so output is identical on Hermes, web and Node (tests).

import { DateKey, addDays, dayOfWeek, parseLocalDateTime } from '../core/time';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** Decimal hours, the way payroll reports show them: 2685 min -> "44.75". */
export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

export function formatDay(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${DAYS[dayOfWeek(key)]} ${MONTHS[m - 1]} ${d}`;
}

export function formatWeekRange(weekStart: DateKey): string {
  const end = addDays(weekStart, 6);
  const [y1, m1, d1] = weekStart.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  if (y1 !== y2) return `${MONTHS[m1 - 1]} ${d1}, ${y1} to ${MONTHS[m2 - 1]} ${d2}, ${y2}`;
  if (m1 !== m2) return `${MONTHS[m1 - 1]} ${d1} to ${MONTHS[m2 - 1]} ${d2}, ${y1}`;
  return `${MONTHS[m1 - 1]} ${d1} to ${d2}, ${y1}`;
}

function clock(localDateTime: string): string {
  const [h, m] = localDateTime.slice(11).split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Wed Nov 25, 10:15 PM to Thu 7:00 AM" */
export function formatShift(start: string, end: string): string {
  const startDay = start.slice(0, 10);
  const endDay = end.slice(0, 10);
  const endPart = startDay === endDay ? clock(end) : `${DAYS[dayOfWeek(endDay)]} ${clock(end)}`;
  return `${formatDay(startDay)}, ${clock(start)} to ${endPart}`;
}

export function shiftLengthMinutes(start: string, end: string, breakMinutes: number): number | null {
  const s = parseLocalDateTime(start);
  const e = parseLocalDateTime(end);
  if (s === null || e === null) return null;
  return e - s - breakMinutes;
}
