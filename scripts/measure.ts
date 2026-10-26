// Measures the numbers quoted in the README. Nothing here is estimated.
//
//   npm run build:web && npm run serve          # in one terminal
//   npm run measure                             # in another (BASE_URL defaults to http://localhost:3000)
//   BASE_URL=https://your-app.vercel.app npm run measure   # against a deployment

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { SYNTHETIC_EMPLOYEES, syntheticShifts } from '../src/core/synthetic';
import { addDays } from '../src/core/time';
import { computeTimesheet, Employee, Shift } from '../src/core/timesheet';
import { observedHolidaysBetween } from '../src/core/holidays';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function engineThroughput() {
  // A year of synthetic shifts for 8 copies of the 6-person roster (48 synthetic employees).
  const employees: Employee[] = [];
  const shifts: Shift[] = [];
  for (let copy = 0; copy < 8; copy++) {
    for (const e of SYNTHETIC_EMPLOYEES) employees.push({ ...e, id: `${e.id}-${copy}` });
  }
  for (let w = 0; w < 52; w++) {
    const weekStart = addDays('2027-01-03', w * 7);
    const base = syntheticShifts(weekStart);
    for (let copy = 0; copy < 8; copy++) {
      for (const s of base) shifts.push({ ...s, id: `${s.id}-${copy}`, employeeId: `${s.employeeId}-${copy}` });
    }
  }
  const holidays = new Set(observedHolidaysBetween('2026-12-27', '2028-01-09').map((h) => h.observed));

  for (let i = 0; i < 3; i++) computeTimesheet(employees, shifts, holidays); // warm up the JIT
  const times: number[] = [];
  for (let i = 0; i < 25; i++) {
    const t0 = performance.now();
    const result = computeTimesheet(employees, shifts, holidays);
    times.push(performance.now() - t0);
    if (result.errors.length) throw new Error(`unexpected errors: ${JSON.stringify(result.errors[0])}`);
  }
  times.sort((a, b) => a - b);
  console.log(`engine: ${shifts.length} shifts, ${employees.length} employees, 52 weeks`);
  console.log(`  median ${percentile(times, 50).toFixed(1)} ms, p95 ${percentile(times, 95).toFixed(1)} ms over ${times.length} runs`);
}

async function apiLatency() {
  const N = 200;
  const weekStart = '2026-11-22';
  const week = await (await fetch(`${BASE_URL}/api/week?start=${weekStart}`)).json();
  const body = JSON.stringify({ weekStart, shifts: week.shifts });

  for (const [label, run] of [
    ['GET  /api/week', () => fetch(`${BASE_URL}/api/week?start=${weekStart}`)],
    ['POST /api/timesheet', () => fetch(`${BASE_URL}/api/timesheet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })],
  ] as const) {
    const times: number[] = [];
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      const res = await run();
      await res.arrayBuffer();
      if (!res.ok) throw new Error(`${label} returned ${res.status}`);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    console.log(`${label}: p50 ${percentile(times, 50).toFixed(1)} ms, p95 ${percentile(times, 95).toFixed(1)} ms (${N} sequential requests to ${BASE_URL})`);
  }
}

function bundleSize() {
  const dir = join(__dirname, '..', 'dist', '_expo', 'static', 'js', 'web');
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    console.log('bundle: dist/ not found, run `npm run build:web`');
    return;
  }
  for (const f of files) {
    const raw = readFileSync(join(dir, f));
    console.log(`bundle ${f}: ${(statSync(join(dir, f)).size / 1024).toFixed(0)} KB raw, ${(gzipSync(raw).length / 1024).toFixed(0)} KB gzipped`);
  }
}

(async () => {
  engineThroughput();
  bundleSize();
  try {
    await apiLatency();
  } catch (e) {
    console.log(`api: skipped (${(e as Error).message}). Start the server with \`npm run serve\` or set BASE_URL.`);
  }
})();
