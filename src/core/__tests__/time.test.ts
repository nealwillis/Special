import { addDays, dayOfWeek, formatLocalDateTime, parseLocalDateTime, startOfWeek } from '../time';

describe('time helpers', () => {
  it('round-trips a wall-clock time', () => {
    const m = parseLocalDateTime('2026-11-26T22:15');
    expect(m).not.toBeNull();
    expect(formatLocalDateTime(m!)).toBe('2026-11-26T22:15');
  });

  it.each(['2026-02-30T09:00', '2026-13-01T09:00', '2026-11-26T24:00', '2026-11-26 09:00', '2026-11-26T9:00', ''])(
    'rejects %p',
    (value) => {
      expect(parseLocalDateTime(value)).toBeNull();
    },
  );

  it('knows weekdays and week starts', () => {
    expect(dayOfWeek('2026-11-26')).toBe(4); // Thursday
    expect(startOfWeek('2026-11-26', 0)).toBe('2026-11-22');
    expect(startOfWeek('2026-11-22', 0)).toBe('2026-11-22');
    expect(startOfWeek('2026-11-22', 1)).toBe('2026-11-16'); // Monday-start week
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
