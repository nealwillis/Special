// The one entry point both the app and the API call, so the phone's preview and the server's
// authoritative total come from the same code.

import { observedHolidaysBetween, Holiday } from './holidays';
import { addDays, DateKey, parseDateKey, startOfWeek } from './time';
import { computeTimesheet, DEFAULT_POLICY, Employee, PayPolicy, Shift, ShiftError, EmployeeWeekSummary } from './timesheet';

export interface WeekSummary {
  weekStart: DateKey;
  holidays: Holiday[];
  summaries: EmployeeWeekSummary[];
  errors: ShiftError[];
  totals: { paidMinutes: number; overtimeMinutes: number; holidayMinutes: number; grossPayCents: number };
}

/** Normalizes any date to the start of its workweek. Returns null for a malformed date. */
export function normalizeWeekStart(date: string, policy: PayPolicy = DEFAULT_POLICY): DateKey | null {
  if (parseDateKey(date) === null) return null;
  return startOfWeek(date, policy.workweekStartsOn);
}

export function holidaysInWeek(weekStart: DateKey): Holiday[] {
  return observedHolidaysBetween(weekStart, addDays(weekStart, 7));
}

export function summarizeWeek(
  weekStart: DateKey,
  employees: Employee[],
  shifts: Shift[],
  policy: PayPolicy = DEFAULT_POLICY,
): WeekSummary {
  // Shifts may spill a few hours into the neighbouring weeks, so look up holidays a week either side.
  const holidayDates = new Set(observedHolidaysBetween(addDays(weekStart, -7), addDays(weekStart, 14)).map((h) => h.observed));
  const result = computeTimesheet(employees, shifts, holidayDates, policy);
  const summaries = result.summaries.filter((s) => s.weekStart === weekStart);
  const totals = summaries.reduce(
    (t, s) => ({
      paidMinutes: t.paidMinutes + s.paidMinutes,
      overtimeMinutes: t.overtimeMinutes + s.overtimeMinutes,
      holidayMinutes: t.holidayMinutes + s.holidayMinutes,
      grossPayCents: t.grossPayCents + s.grossPayCents,
    }),
    { paidMinutes: 0, overtimeMinutes: 0, holidayMinutes: 0, grossPayCents: 0 },
  );
  return { weekStart, holidays: holidaysInWeek(weekStart), summaries, errors: result.errors, totals };
}
