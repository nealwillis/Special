/**
 * @jest-environment node
 */
import { SYNTHETIC_EMPLOYEES, syntheticShiftsTouchingWeek } from '../../core/synthetic';
import { summarizeWeek } from '../../core/week';
import { handleTimesheet, handleWeek, MAX_SHIFTS_PER_REQUEST } from '../handlers';

const BASE = 'http://localhost/api';

function post(body: unknown, raw = false) {
  return handleTimesheet(
    new Request(`${BASE}/timesheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

describe('GET /api/week', () => {
  it('returns a labeled synthetic week with its holidays', async () => {
    const res = await handleWeek(new Request(`${BASE}/week?start=2026-11-22`));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json();
    expect(body.synthetic).toBe(true);
    expect(body.notice).toMatch(/synthetic/i);
    expect(body.weekStart).toBe('2026-11-22');
    expect(body.weekEnd).toBe('2026-11-28');
    expect(body.employees).toHaveLength(6);
    expect(body.holidays.map((h: { name: string }) => h.name)).toEqual(['Thanksgiving Day']);
  });

  it('normalizes a mid-week date to the Sunday that starts the week', async () => {
    const body = await (await handleWeek(new Request(`${BASE}/week?start=2026-11-26`))).json();
    expect(body.weekStart).toBe('2026-11-22');
  });

  it("includes last Saturday's overnight shift that runs into Sunday", async () => {
    const body = await (await handleWeek(new Request(`${BASE}/week?start=2026-11-29`))).json();
    const spill = body.shifts.filter((s: { start: string }) => s.start < '2026-11-29T00:00');
    expect(spill.length).toBeGreaterThan(0);
    spill.forEach((s: { end: string }) => expect(s.end > '2026-11-29T00:00').toBe(true));
  });

  it.each([
    ['', 'Missing week start date (YYYY-MM-DD)'],
    ['?start=2026-02-30', 'Invalid date "2026-02-30", expected YYYY-MM-DD'],
    ['?start=1999-01-03', 'Year must be between 2021 and 2099'],
  ])('rejects %p with 400', async (query, error) => {
    const res = await handleWeek(new Request(`${BASE}/week${query}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });

  it('answers a CORS preflight and refuses other methods', async () => {
    expect((await handleWeek(new Request(`${BASE}/week`, { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handleWeek(new Request(`${BASE}/week`, { method: 'DELETE' }))).status).toBe(405);
  });
});

describe('POST /api/timesheet', () => {
  const weekStart = '2026-11-22';
  const shifts = syntheticShiftsTouchingWeek(weekStart);

  it('returns the same totals the app computes locally', async () => {
    const res = await post({ weekStart, shifts });
    expect(res.status).toBe(200);
    const body = await res.json();
    const local = summarizeWeek(weekStart, SYNTHETIC_EMPLOYEES, shifts);
    expect(body.totals).toEqual(local.totals);
    expect(body.summaries).toEqual(local.summaries);
    expect(body.synthetic).toBe(true);
  });

  it('ignores any rates the client tries to send', async () => {
    const tampered = { weekStart, shifts, employees: SYNTHETIC_EMPLOYEES.map((e) => ({ ...e, hourlyRateCents: 999999 })) };
    const body = await (await post(tampered)).json();
    expect(body.totals.grossPayCents).toBe(summarizeWeek(weekStart, SYNTHETIC_EMPLOYEES, shifts).totals.grossPayCents);
  });

  it('reports bad shifts as errors without failing the request', async () => {
    const bad = { ...shifts[0], end: shifts[0].start };
    const body = await (await post({ weekStart, shifts: [bad, ...shifts.slice(1)] })).json();
    expect(body.errors).toEqual([{ shiftId: bad.id, message: 'Shift must end after it starts' }]);
  });

  it.each([
    ['not json', '{', 400, 'Body must be JSON'],
    ['a non-object', '42', 400, 'Body must be a JSON object'],
    ['missing shifts', JSON.stringify({ weekStart }), 400, '"shifts" must be an array'],
    ['a malformed shift', JSON.stringify({ weekStart, shifts: [{ id: 1 }] }), 400, 'shifts[0] needs id, employeeId, start, end (strings) and breakMinutes (number)'],
  ])('rejects %s', async (_label, raw, status, error) => {
    const res = await post(raw, true);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it('caps the request size', async () => {
    const many = Array.from({ length: MAX_SHIFTS_PER_REQUEST + 1 }, (_, i) => ({ ...shifts[0], id: `x${i}` }));
    expect((await post({ weekStart, shifts: many })).status).toBe(413);
  });
});
