import { computeTimesheet, DEFAULT_POLICY, Employee, Shift, splitPaidMinutes } from '../timesheet';

const ana: Employee = { id: 'a', name: 'Test A', role: 'Tester', hourlyRateCents: 2000 };
const ben: Employee = { id: 'b', name: 'Test B', role: 'Tester', hourlyRateCents: 1500 };
const NO_HOLIDAYS = new Set<string>();
const THANKSGIVING_2026 = new Set(['2026-11-26']);

let n = 0;
function shift(employeeId: string, start: string, end: string, breakMinutes = 0): Shift {
  n += 1;
  return { id: `s${n}`, employeeId, start, end, breakMinutes };
}

describe('computeTimesheet', () => {
  it('pays a simple shift minus its unpaid break', () => {
    const { summaries, errors } = computeTimesheet([ana], [shift('a', '2026-11-23T09:00', '2026-11-23T17:30', 30)], NO_HOLIDAYS);
    expect(errors).toEqual([]);
    expect(summaries).toEqual([
      expect.objectContaining({ weekStart: '2026-11-22', paidMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, grossPayCents: 16000 }),
    ]);
  });

  it('puts hours over 40 in the week into overtime at 1.5x', () => {
    // 5 x 9h = 45h
    const shifts = [23, 24, 25, 26, 27].map((d) => shift('a', `2026-11-${d}T08:00`, `2026-11-${d}T17:00`));
    const [s] = computeTimesheet([ana], shifts, NO_HOLIDAYS).summaries;
    expect(s.regularMinutes).toBe(40 * 60);
    expect(s.overtimeMinutes).toBe(5 * 60);
    expect(s.grossPayCents).toBe(40 * 2000 + 5 * 3000);
  });

  it('has no daily overtime: one 12h shift is all regular', () => {
    const [s] = computeTimesheet([ana], [shift('a', '2026-11-23T06:00', '2026-11-23T18:00')], NO_HOLIDAYS).summaries;
    expect(s.overtimeMinutes).toBe(0);
  });

  it('counts only the part of an overnight shift that falls on the holiday', () => {
    // Wed 22:00 -> Thu (Thanksgiving) 06:00, 30 min break spread 2h:6h -> 7.5 + 22.5 min
    const [s] = computeTimesheet([ana], [shift('a', '2026-11-25T22:00', '2026-11-26T06:00', 30)], THANKSGIVING_2026).summaries;
    expect(s.paidMinutes).toBe(450);
    // largest remainder gives the 0.5-minute tie to the earlier piece: 2h-8m = 112, 6h-22m = 338
    expect(s.holidayMinutes).toBe(338);
    // 450 min at $20 + 338 min at an extra $10 = 15000 + 5633.33
    expect(s.grossPayCents).toBe(Math.round((2000 * 450 + 1000 * 338) / 60));
  });

  it('splits a shift that crosses into the next workweek', () => {
    // Saturday 20:00 -> Sunday 04:00 crosses the Sunday workweek boundary
    const shifts = [shift('a', '2026-11-28T20:00', '2026-11-29T04:00')];
    const { summaries } = computeTimesheet([ana], shifts, NO_HOLIDAYS);
    expect(summaries.map((s) => [s.weekStart, s.paidMinutes])).toEqual([
      ['2026-11-22', 240],
      ['2026-11-29', 240],
    ]);
  });

  it('pushes a boundary-crossing shift into overtime only for the hours in the full week', () => {
    // 38h Mon-Fri, then Sat 20:00 -> Sun 04:00: 4h on Saturday makes 42h, Sunday's 4h start the next week
    const weekday = [23, 24, 25, 26].map((d) => shift('a', `2026-11-${d}T08:00`, `2026-11-${d}T17:30`)); // 4 x 9.5 = 38h
    const { summaries } = computeTimesheet([ana], [...weekday, shift('a', '2026-11-28T20:00', '2026-11-29T04:00')], NO_HOLIDAYS);
    const thisWeek = summaries.find((s) => s.weekStart === '2026-11-22')!;
    const nextWeek = summaries.find((s) => s.weekStart === '2026-11-29')!;
    expect(thisWeek.overtimeMinutes).toBe(120);
    expect(nextWeek.overtimeMinutes).toBe(0);
  });

  it('respects a Monday workweek when the policy says so', () => {
    const shifts = [shift('a', '2026-11-22T09:00', '2026-11-22T17:00')]; // a Sunday
    const [s] = computeTimesheet([ana], shifts, NO_HOLIDAYS, { ...DEFAULT_POLICY, workweekStartsOn: 1 }).summaries;
    expect(s.weekStart).toBe('2026-11-16');
  });

  it('keeps employees separate', () => {
    const { summaries } = computeTimesheet(
      [ana, ben],
      [shift('a', '2026-11-23T09:00', '2026-11-23T17:00'), shift('b', '2026-11-23T09:00', '2026-11-23T13:00')],
      NO_HOLIDAYS,
    );
    expect(summaries.map((s) => [s.employeeId, s.paidMinutes, s.grossPayCents])).toEqual([
      ['a', 480, 16000],
      ['b', 240, 6000],
    ]);
  });

  it('rejects an overlapping shift instead of double counting it', () => {
    const first = shift('a', '2026-11-23T09:00', '2026-11-23T17:00');
    const overlap = shift('a', '2026-11-23T16:00', '2026-11-23T20:00');
    const { summaries, errors } = computeTimesheet([ana], [overlap, first], NO_HOLIDAYS);
    expect(errors).toEqual([{ shiftId: overlap.id, message: `Overlaps shift ${first.id}` }]);
    expect(summaries[0].paidMinutes).toBe(480);
  });

  it('allows back-to-back shifts', () => {
    const { errors } = computeTimesheet(
      [ana],
      [shift('a', '2026-11-23T09:00', '2026-11-23T13:00'), shift('a', '2026-11-23T13:00', '2026-11-23T17:00')],
      NO_HOLIDAYS,
    );
    expect(errors).toEqual([]);
  });

  it.each([
    [shift('a', '2026-11-23T17:00', '2026-11-23T09:00'), 'Shift must end after it starts'],
    [shift('a', '2026-11-23T09:00', '2026-11-23T09:00'), 'Shift must end after it starts'],
    [shift('a', '2026-02-30T09:00', '2026-02-30T17:00'), 'Invalid start time "2026-02-30T09:00"'],
    [shift('a', '2026-11-23T00:00', '2026-11-23T17:00'), 'Shift is longer than 16 hours'],
    [shift('a', '2026-11-23T09:00', '2026-11-23T10:00', 60), 'Break is as long as the shift'],
    [shift('a', '2026-11-23T09:00', '2026-11-23T10:00', -5), 'Break must be a whole number of minutes, zero or more'],
    [shift('zz', '2026-11-23T09:00', '2026-11-23T10:00'), 'Unknown employee "zz"'],
  ])('reports an invalid shift: %#', (bad, message) => {
    const { summaries, errors } = computeTimesheet([ana], [bad], NO_HOLIDAYS);
    expect(errors).toEqual([{ shiftId: bad.id, message }]);
    expect(summaries).toEqual([]);
  });
});

describe('splitPaidMinutes', () => {
  it('spreads the break so whole minutes add up exactly', () => {
    // 7 minute break over three uneven pieces
    const pieces = splitPaidMinutes(0, 600, 7, [100, 350]);
    expect(pieces.reduce((sum, p) => sum + p.paidMinutes, 0)).toBe(593);
    pieces.forEach((p) => expect(Number.isInteger(p.paidMinutes)).toBe(true));
  });

  it('ignores cut points outside the shift', () => {
    expect(splitPaidMinutes(100, 200, 10, [0, 100, 200, 300])).toEqual([{ startMin: 100, paidMinutes: 90 }]);
  });
});
