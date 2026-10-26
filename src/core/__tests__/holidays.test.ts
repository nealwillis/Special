import { OPM_OBSERVED } from '../__fixtures__/opmObserved';
import { federalHolidays, observedHolidaysBetween } from '../holidays';

describe('federalHolidays', () => {
  it.each(Object.keys(OPM_OBSERVED).map(Number))('matches the OPM observed dates for %i', (year) => {
    expect(federalHolidays(year).map((h) => h.observed)).toEqual(OPM_OBSERVED[year]);
  });

  it('moves a Saturday holiday to Friday and a Sunday holiday to Monday', () => {
    const y2026 = federalHolidays(2026);
    expect(y2026.find((h) => h.name === 'Independence Day')).toEqual({
      name: 'Independence Day',
      date: '2026-07-04', // Saturday
      observed: '2026-07-03',
    });
    const y2027 = federalHolidays(2027);
    expect(y2027.find((h) => h.name === 'Independence Day')?.observed).toBe('2027-07-05'); // Sunday -> Monday
  });

  it('rejects years outside the supported range', () => {
    expect(() => federalHolidays(2020)).toThrow(RangeError);
    expect(() => federalHolidays(2100)).toThrow(RangeError);
  });
});

describe('observedHolidaysBetween', () => {
  it('finds Thanksgiving week 2026', () => {
    expect(observedHolidaysBetween('2026-11-22', '2026-11-29').map((h) => h.name)).toEqual(['Thanksgiving Day']);
  });

  it("includes New Year's Day 2028 observed on Friday Dec 31, 2027", () => {
    const found = observedHolidaysBetween('2027-12-26', '2028-01-02');
    expect(found.map((h) => [h.date, h.observed])).toEqual([['2028-01-01', '2027-12-31']]);
  });

  it('returns nothing for a week with no holiday', () => {
    expect(observedHolidaysBetween('2026-03-01', '2026-03-08')).toEqual([]);
  });
});
