// SYNTHETIC DATA. These are not real people, customers or payroll records.
// A seeded generator makes a plausible week of shifts for a fictional six-person shop,
// so the same week always returns the same data (the client preview and server check can be compared).

import { addDays, DateKey } from './time';
import type { Employee, Shift } from './timesheet';

export const SYNTHETIC_NOTICE =
  'Synthetic demo data: the employees and shifts are generated, not real people or payroll records.';

export const SYNTHETIC_EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Jordan Rivera', role: 'Shift Lead', hourlyRateCents: 2400 },
  { id: 'e2', name: 'Sam Patel', role: 'Cashier', hourlyRateCents: 1750 },
  { id: 'e3', name: 'Alex Chen', role: 'Barista', hourlyRateCents: 1825 },
  { id: 'e4', name: 'Morgan Lee', role: 'Overnight Stock', hourlyRateCents: 1900 },
  { id: 'e5', name: 'Taylor Brooks', role: 'Cashier (part-time)', hourlyRateCents: 1750 },
  { id: 'e6', name: 'Casey Nguyen', role: 'Assistant Manager', hourlyRateCents: 2600 },
];

interface Pattern {
  employeeId: string;
  /** Day offsets from the workweek start (0 = Sunday) the person usually works. */
  days: number[];
  /** Usual start, in minutes after midnight. */
  startMin: number;
  lengthMin: number;
  breakMinutes: number;
}

const PATTERNS: Pattern[] = [
  { employeeId: 'e1', days: [1, 2, 3, 4, 5], startMin: 7 * 60, lengthMin: 9 * 60, breakMinutes: 30 },
  { employeeId: 'e2', days: [0, 2, 4, 6], startMin: 10 * 60, lengthMin: 8 * 60, breakMinutes: 30 },
  { employeeId: 'e3', days: [1, 2, 3, 4, 6], startMin: 6 * 60, lengthMin: 7 * 60, breakMinutes: 30 },
  // Overnight: Wednesday night crosses into Thursday, Saturday night crosses into the next workweek.
  { employeeId: 'e4', days: [0, 2, 3, 6], startMin: 22 * 60, lengthMin: 8 * 60, breakMinutes: 30 },
  { employeeId: 'e5', days: [3, 5, 6], startMin: 16 * 60, lengthMin: 6 * 60, breakMinutes: 0 },
  { employeeId: 'e6', days: [1, 2, 3, 4, 5], startMin: 8 * 60, lengthMin: 10 * 60, breakMinutes: 60 },
];

/** mulberry32: small, fast, deterministic PRNG. Not for anything security related. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hhmm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function at(day: DateKey, minutesAfterMidnight: number): string {
  const extraDays = Math.floor(minutesAfterMidnight / (24 * 60));
  return `${addDays(day, extraDays)}T${hhmm(minutesAfterMidnight % (24 * 60))}`;
}

/** A deterministic synthetic week of shifts starting on `weekStart`. */
export function syntheticShifts(weekStart: DateKey): Shift[] {
  const rand = mulberry32(hashString(weekStart));
  const shifts: Shift[] = [];
  for (const p of PATTERNS) {
    for (const offset of p.days) {
      // About one in ten usual shifts is skipped (sick day, swap) so weeks differ.
      if (rand() < 0.1) continue;
      const startJitter = Math.round((rand() - 0.5) * 4) * 15; // -30..+30 minutes in 15-minute steps
      const lengthJitter = Math.round(rand() * 4) * 15; // 0..+60 minutes
      const day = addDays(weekStart, offset);
      const start = p.startMin + startJitter;
      shifts.push({
        id: `${p.employeeId}-${day}`,
        employeeId: p.employeeId,
        start: at(day, start),
        end: at(day, start + p.lengthMin + lengthJitter),
        breakMinutes: p.breakMinutes,
      });
    }
  }
  return shifts.sort(byStart);
}

function byStart(a: Shift, b: Shift): number {
  return a.start < b.start ? -1 : a.start > b.start ? 1 : a.id.localeCompare(b.id);
}

/**
 * Every shift with time inside the week: this week's schedule plus last week's overnight shifts that
 * run past midnight into this week's first day. Those early-Sunday hours belong to this workweek.
 */
export function syntheticShiftsTouchingWeek(weekStart: DateKey): Shift[] {
  const boundary = `${weekStart}T00:00`;
  const spill = syntheticShifts(addDays(weekStart, -7)).filter((s) => s.end > boundary);
  return [...spill, ...syntheticShifts(weekStart)].sort(byStart);
}
