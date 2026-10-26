// Weekly timesheet and overtime calculation.
//
// Rules implemented:
// - Overtime is hours over 40 in a fixed 7-day workweek (FLSA, 29 U.S.C. 207; New Jersey uses the same
//   weekly rule). There is no daily overtime.
// - Hours count in the calendar day and workweek they were actually worked, so a shift that crosses
//   midnight or the workweek boundary is split at those points.
// - The unpaid break is spread across a split shift in proportion to each piece's length.
// - Hours worked on an observed federal holiday earn an extra premium set by the pay policy. That premium
//   stacks with overtime (a simplification, see README).

import { DateKey, MINUTES_PER_DAY, parseLocalDateTime, startOfWeek, toDateKey } from './time';

export interface Employee {
  id: string;
  name: string;
  role: string;
  hourlyRateCents: number;
}

export interface Shift {
  id: string;
  employeeId: string;
  start: string; // LocalDateTime
  end: string; // LocalDateTime
  breakMinutes: number;
}

export interface PayPolicy {
  /** 0 = Sunday. */
  workweekStartsOn: number;
  weeklyOvertimeThresholdMinutes: number;
  overtimeMultiplier: number;
  /** Extra multiple of the base rate for each holiday hour, e.g. 0.5 makes holiday hours time-and-a-half. */
  holidayPremium: number;
}

export const DEFAULT_POLICY: PayPolicy = {
  workweekStartsOn: 0,
  weeklyOvertimeThresholdMinutes: 40 * 60,
  overtimeMultiplier: 1.5,
  holidayPremium: 0.5,
};

export const MAX_SHIFT_MINUTES = 16 * 60;

export interface ShiftError {
  shiftId: string;
  message: string;
}

export interface EmployeeWeekSummary {
  employeeId: string;
  weekStart: DateKey;
  shiftCount: number;
  paidMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  holidayMinutes: number;
  grossPayCents: number;
}

export interface TimesheetResult {
  summaries: EmployeeWeekSummary[];
  errors: ShiftError[];
}

interface ParsedShift {
  shift: Shift;
  startMin: number;
  endMin: number;
}

export function validateShift(shift: Shift, employeeIds: ReadonlySet<string>): string | null {
  if (!employeeIds.has(shift.employeeId)) return `Unknown employee "${shift.employeeId}"`;
  const start = parseLocalDateTime(shift.start);
  const end = parseLocalDateTime(shift.end);
  if (start === null) return `Invalid start time "${shift.start}"`;
  if (end === null) return `Invalid end time "${shift.end}"`;
  if (end <= start) return 'Shift must end after it starts';
  const length = end - start;
  if (length > MAX_SHIFT_MINUTES) return `Shift is longer than ${MAX_SHIFT_MINUTES / 60} hours`;
  if (!Number.isInteger(shift.breakMinutes) || shift.breakMinutes < 0) {
    return 'Break must be a whole number of minutes, zero or more';
  }
  if (shift.breakMinutes >= length) return 'Break is as long as the shift';
  return null;
}

/**
 * Splits [startMin, endMin) at every boundary in `cuts` and spreads `breakMinutes` across the pieces
 * by length. Uses largest-remainder rounding so the paid minutes are whole and add up exactly.
 */
export function splitPaidMinutes(
  startMin: number,
  endMin: number,
  breakMinutes: number,
  cuts: number[],
): { startMin: number; paidMinutes: number }[] {
  const points = [startMin, ...cuts.filter((c) => c > startMin && c < endMin).sort((a, b) => a - b), endMin];
  const total = endMin - startMin;
  const pieces = points.slice(0, -1).map((s, i) => {
    const length = points[i + 1] - s;
    const exactBreak = (breakMinutes * length) / total;
    return { startMin: s, length, breakFloor: Math.floor(exactBreak), remainder: exactBreak - Math.floor(exactBreak) };
  });
  let leftover = breakMinutes - pieces.reduce((sum, p) => sum + p.breakFloor, 0);
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[b].remainder - pieces[a].remainder || a - b);
  for (const i of order) {
    if (leftover <= 0) break;
    pieces[i].breakFloor += 1;
    leftover -= 1;
  }
  return pieces.map((p) => ({ startMin: p.startMin, paidMinutes: p.length - p.breakFloor }));
}

export function computeTimesheet(
  employees: Employee[],
  shifts: Shift[],
  holidayDates: ReadonlySet<DateKey>,
  policy: PayPolicy = DEFAULT_POLICY,
): TimesheetResult {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const employeeIds = new Set(employeeById.keys());
  const errors: ShiftError[] = [];
  const valid: ParsedShift[] = [];

  for (const shift of shifts) {
    const message = validateShift(shift, employeeIds);
    if (message) {
      errors.push({ shiftId: shift.id, message });
      continue;
    }
    valid.push({ shift, startMin: parseLocalDateTime(shift.start)!, endMin: parseLocalDateTime(shift.end)! });
  }

  // Overlapping shifts for the same person would double-count hours. Keep the earlier one, reject the later.
  const byEmployee = new Map<string, ParsedShift[]>();
  for (const p of valid) {
    const list = byEmployee.get(p.shift.employeeId) ?? [];
    list.push(p);
    byEmployee.set(p.shift.employeeId, list);
  }

  type Bucket = { shiftIds: Set<string>; paid: number; holiday: number };
  const buckets = new Map<string, Bucket>();

  for (const [employeeId, list] of byEmployee) {
    list.sort((a, b) => a.startMin - b.startMin);
    let lastEnd = -Infinity;
    let lastId = '';
    for (const p of list) {
      if (p.startMin < lastEnd) {
        errors.push({ shiftId: p.shift.id, message: `Overlaps shift ${lastId}` });
        continue;
      }
      lastEnd = p.endMin;
      lastId = p.shift.id;

      const midnights: number[] = [];
      const firstMidnight = Math.floor(p.startMin / MINUTES_PER_DAY) * MINUTES_PER_DAY + MINUTES_PER_DAY;
      for (let m = firstMidnight; m < p.endMin; m += MINUTES_PER_DAY) midnights.push(m);

      // Workweek boundaries are always at midnight, so splitting at midnights covers both.
      for (const piece of splitPaidMinutes(p.startMin, p.endMin, p.shift.breakMinutes, midnights)) {
        const day = toDateKey(piece.startMin);
        const weekStart = startOfWeek(day, policy.workweekStartsOn);
        const key = `${employeeId}|${weekStart}`;
        const bucket = buckets.get(key) ?? { shiftIds: new Set<string>(), paid: 0, holiday: 0 };
        bucket.shiftIds.add(p.shift.id);
        bucket.paid += piece.paidMinutes;
        if (holidayDates.has(day)) bucket.holiday += piece.paidMinutes;
        buckets.set(key, bucket);
      }
    }
  }

  const summaries: EmployeeWeekSummary[] = [];
  for (const [key, bucket] of buckets) {
    const [employeeId, weekStart] = key.split('|');
    const rate = employeeById.get(employeeId)!.hourlyRateCents;
    const regularMinutes = Math.min(bucket.paid, policy.weeklyOvertimeThresholdMinutes);
    const overtimeMinutes = bucket.paid - regularMinutes;
    // Round once per employee-week, not per shift, so cents don't drift.
    const grossPayCents = Math.round(
      (rate *
        (regularMinutes + overtimeMinutes * policy.overtimeMultiplier + bucket.holiday * policy.holidayPremium)) /
        60,
    );
    summaries.push({
      employeeId,
      weekStart,
      shiftCount: bucket.shiftIds.size,
      paidMinutes: bucket.paid,
      regularMinutes,
      overtimeMinutes,
      holidayMinutes: bucket.holiday,
      grossPayCents,
    });
  }

  summaries.sort((a, b) => (a.weekStart === b.weekStart ? a.employeeId.localeCompare(b.employeeId) : a.weekStart < b.weekStart ? -1 : 1));
  return { summaries, errors };
}
