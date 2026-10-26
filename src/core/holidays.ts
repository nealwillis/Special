// US federal holidays, computed from the rules in 5 U.S.C. 6103.
// Observance follows OPM's rule for a Monday-Friday schedule:
// a holiday on Saturday is observed the Friday before, on Sunday the Monday after.
// Inauguration Day (DC area only, every four years) is not included.

import { addDays, dateKeyFromParts, dayOfWeek, DateKey } from './time';

export const MIN_SUPPORTED_YEAR = 2021; // Juneteenth became a federal holiday in June 2021
export const MAX_SUPPORTED_YEAR = 2099;

export interface Holiday {
  name: string;
  /** The date named in the statute. */
  date: DateKey;
  /** The day off. Can fall in the previous year: Sat Jan 1, 2028 is observed Fri Dec 31, 2027. */
  observed: DateKey;
}

function nthWeekday(year: number, month: number, weekday: number, n: number): DateKey {
  const first = dateKeyFromParts(year, month, 1);
  const offset = (weekday - dayOfWeek(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): DateKey {
  const nextMonthFirst = month === 12 ? dateKeyFromParts(year + 1, 1, 1) : dateKeyFromParts(year, month + 1, 1);
  const last = addDays(nextMonthFirst, -1);
  const offset = (dayOfWeek(last) - weekday + 7) % 7;
  return addDays(last, -offset);
}

function observedDate(date: DateKey): DateKey {
  const dow = dayOfWeek(date);
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return date;
}

export function isSupportedYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_SUPPORTED_YEAR && year <= MAX_SUPPORTED_YEAR;
}

export function federalHolidays(year: number): Holiday[] {
  if (!isSupportedYear(year)) {
    throw new RangeError(`Year must be between ${MIN_SUPPORTED_YEAR} and ${MAX_SUPPORTED_YEAR}`);
  }
  const MON = 1;
  const THU = 4;
  const fixed = (name: string, month: number, day: number) => {
    const date = dateKeyFromParts(year, month, day);
    return { name, date, observed: observedDate(date) };
  };
  const floating = (name: string, date: DateKey) => ({ name, date, observed: date });

  return [
    fixed("New Year's Day", 1, 1),
    floating('Birthday of Martin Luther King, Jr.', nthWeekday(year, 1, MON, 3)),
    floating("Washington's Birthday", nthWeekday(year, 2, MON, 3)),
    floating('Memorial Day', lastWeekday(year, 5, MON)),
    fixed('Juneteenth National Independence Day', 6, 19),
    fixed('Independence Day', 7, 4),
    floating('Labor Day', nthWeekday(year, 9, MON, 1)),
    floating('Columbus Day', nthWeekday(year, 10, MON, 2)),
    fixed('Veterans Day', 11, 11),
    floating('Thanksgiving Day', nthWeekday(year, 11, THU, 4)),
    fixed('Christmas Day', 12, 25),
  ];
}

/**
 * Holidays whose observed date falls in [from, toExclusive).
 * Looks at the following year too, so a New Year's Day observed on Dec 31 is not missed.
 */
export function observedHolidaysBetween(from: DateKey, toExclusive: DateKey): Holiday[] {
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(toExclusive.slice(0, 4));
  const result: Holiday[] = [];
  for (let y = startYear; y <= endYear + 1; y++) {
    if (!isSupportedYear(y)) continue;
    for (const h of federalHolidays(y)) {
      if (h.observed >= from && h.observed < toExclusive) result.push(h);
    }
  }
  return result.sort((a, b) => (a.observed < b.observed ? -1 : 1));
}
