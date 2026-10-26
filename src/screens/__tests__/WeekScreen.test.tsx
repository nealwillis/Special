import { fireEvent, render, screen } from '@testing-library/react-native';

import { SYNTHETIC_EMPLOYEES, SYNTHETIC_NOTICE, syntheticShiftsTouchingWeek } from '../../core/synthetic';
import { addDays } from '../../core/time';
import { DEFAULT_POLICY, Shift } from '../../core/timesheet';
import { holidaysInWeek, summarizeWeek } from '../../core/week';
import * as api from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { WeekScreen } from '../WeekScreen';

jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  fetchWeek: jest.fn(),
  verifyTimesheet: jest.fn(),
}));

const fetchWeek = api.fetchWeek as jest.MockedFunction<typeof api.fetchWeek>;
const verifyTimesheet = api.verifyTimesheet as jest.MockedFunction<typeof api.verifyTimesheet>;

const WEEK = '2026-11-22';

function weekResponse(weekStart: string): api.WeekResponse {
  return {
    synthetic: true,
    notice: SYNTHETIC_NOTICE,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    policy: DEFAULT_POLICY,
    employees: SYNTHETIC_EMPLOYEES,
    shifts: syntheticShiftsTouchingWeek(weekStart),
    holidays: holidaysInWeek(weekStart),
  };
}

beforeEach(() => {
  fetchWeek.mockReset().mockImplementation(async (w) => weekResponse(w));
  verifyTimesheet
    .mockReset()
    .mockImplementation(async (w: string, shifts: Shift[]) => ({ synthetic: true, ...summarizeWeek(w, SYNTHETIC_EMPLOYEES, shifts) }));
});

it('loads the week and shows totals, the holiday and the synthetic label', async () => {
  await render(<WeekScreen initialWeek={WEEK} />);
  expect(await screen.findByText('Jordan Rivera')).toBeOnTheScreen();
  expect(screen.getByText(/Synthetic demo data/)).toBeOnTheScreen();
  expect(screen.getByText(/Federal holiday: Thanksgiving Day, Thu Nov 26/)).toBeOnTheScreen();

  const expected = summarizeWeek(WEEK, SYNTHETIC_EMPLOYEES, syntheticShiftsTouchingWeek(WEEK));
  expect(screen.getByLabelText(`Gross pay: ${formatMoney(expected.totals.grossPayCents)}`)).toBeOnTheScreen();
  expect(fetchWeek).toHaveBeenCalledWith(WEEK);
});

it('recalculates overtime when a shift is extended, then confirms with the server', async () => {
  await render(<WeekScreen initialWeek={WEEK} />);
  await fireEvent.press(await screen.findByLabelText(/^Jordan Rivera/));
  const overtimeTotal = () => parseFloat(screen.getByLabelText(/^Overtime: /).props.accessibilityLabel.split(': ')[1]);
  const before = overtimeTotal();

  await fireEvent.press(screen.getAllByLabelText('End shift 15 minutes later')[0]);
  // Jordan is already over 40 hours, so 15 more minutes is all overtime
  expect(overtimeTotal() - before).toBeCloseTo(0.25);

  await fireEvent.press(screen.getByText('Check totals with server'));
  expect(await screen.findByText(/Server agrees to the cent/)).toBeOnTheScreen();
  // the server was sent the edited shifts, not the originals
  const sent = verifyTimesheet.mock.calls[0][1];
  expect(sent).not.toEqual(syntheticShiftsTouchingWeek(WEEK));
});

it('shows an inline error when an edit makes a shift invalid', async () => {
  fetchWeek.mockImplementation(async (w) => ({
    ...weekResponse(w),
    shifts: [{ id: 'x', employeeId: 'e2', start: `${w}T10:00`, end: `${w}T10:15`, breakMinutes: 0 }],
  }));
  await render(<WeekScreen initialWeek={WEEK} />);
  await fireEvent.press(await screen.findByLabelText(/^Sam Patel/));
  await fireEvent.press(screen.getByLabelText('End shift 15 minutes earlier'));
  expect(screen.getByText('Shift must end after it starts')).toBeOnTheScreen();
  expect(screen.getByText('needs fixing')).toBeOnTheScreen();
});

it('shows the API error and retries', async () => {
  fetchWeek.mockRejectedValueOnce(new api.ApiError("Can't reach the server. Check your connection."));
  await render(<WeekScreen initialWeek={WEEK} />);
  expect(await screen.findByText("Can't reach the server. Check your connection.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Try again'));
  expect(await screen.findByText('Jordan Rivera')).toBeOnTheScreen();
});

it('moves between weeks', async () => {
  await render(<WeekScreen initialWeek={WEEK} />);
  await screen.findByText('Jordan Rivera');
  await fireEvent.press(screen.getByLabelText('Next week'));
  expect(await screen.findByText('Nov 29 to Dec 5, 2026')).toBeOnTheScreen();
  expect(fetchWeek).toHaveBeenLastCalledWith('2026-11-29');
});

it('explains overnight shifts that cross the workweek boundary', async () => {
  await render(<WeekScreen initialWeek={WEEK} />);
  await fireEvent.press(await screen.findByLabelText(/^Morgan Lee/));
  expect(screen.getByText('Started last week. Only the hours after midnight count in this week.')).toBeOnTheScreen();
  expect(screen.getByText('Runs past Saturday midnight. Those hours count in next week.')).toBeOnTheScreen();
});
