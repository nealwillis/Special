// Framework-free request handlers (Web Request in, Web Response out).
// The Vercel functions in /api and the local dev server both call these, and the tests call them directly.

import { isSupportedYear } from '../core/holidays';
import { SYNTHETIC_EMPLOYEES, SYNTHETIC_NOTICE, syntheticShiftsTouchingWeek } from '../core/synthetic';
import { addDays } from '../core/time';
import { DEFAULT_POLICY, Shift } from '../core/timesheet';
import { normalizeWeekStart, summarizeWeek } from '../core/week';

export const MAX_SHIFTS_PER_REQUEST = 500;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extraHeaders },
  });
}

function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function parseWeek(value: unknown): { weekStart: string } | { error: string } {
  if (typeof value !== 'string') return { error: 'Missing week start date (YYYY-MM-DD)' };
  const weekStart = normalizeWeekStart(value);
  if (!weekStart) return { error: `Invalid date "${value}", expected YYYY-MM-DD` };
  if (!isSupportedYear(Number(weekStart.slice(0, 4)))) return { error: 'Year must be between 2021 and 2099' };
  return { weekStart };
}

/** GET /api/week?start=YYYY-MM-DD: the synthetic roster, shifts and federal holidays for that workweek. */
export async function handleWeek(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' }, { Allow: 'GET, OPTIONS' });

  const parsed = parseWeek(new URL(request.url).searchParams.get('start') ?? undefined);
  if ('error' in parsed) return json(400, { error: parsed.error });

  const { weekStart } = parsed;
  const shifts = syntheticShiftsTouchingWeek(weekStart);
  const { holidays } = summarizeWeek(weekStart, SYNTHETIC_EMPLOYEES, shifts);
  return json(
    200,
    {
      synthetic: true,
      notice: SYNTHETIC_NOTICE,
      weekStart,
      weekEnd: addDays(weekStart, 6),
      policy: DEFAULT_POLICY,
      employees: SYNTHETIC_EMPLOYEES,
      shifts,
      holidays,
    },
    // Same input always gives the same output, so the CDN can cache it.
    { 'Cache-Control': 'public, max-age=300, s-maxage=86400' },
  );
}

function isShift(value: unknown): value is Shift {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.employeeId === 'string' &&
    typeof s.start === 'string' &&
    typeof s.end === 'string' &&
    typeof s.breakMinutes === 'number'
  );
}

/**
 * POST /api/timesheet { weekStart, shifts }: the authoritative weekly totals.
 * Rates and policy come from the server's roster, never from the request body.
 */
export async function handleTimesheet(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, { Allow: 'POST, OPTIONS' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }
  if (typeof body !== 'object' || body === null) return json(400, { error: 'Body must be a JSON object' });
  const { weekStart: rawWeek, shifts } = body as Record<string, unknown>;

  const parsed = parseWeek(rawWeek);
  if ('error' in parsed) return json(400, { error: parsed.error });
  if (!Array.isArray(shifts)) return json(400, { error: '"shifts" must be an array' });
  if (shifts.length > MAX_SHIFTS_PER_REQUEST) {
    return json(413, { error: `At most ${MAX_SHIFTS_PER_REQUEST} shifts per request` });
  }
  const badIndex = shifts.findIndex((s) => !isShift(s));
  if (badIndex !== -1) {
    return json(400, { error: `shifts[${badIndex}] needs id, employeeId, start, end (strings) and breakMinutes (number)` });
  }

  const summary = summarizeWeek(parsed.weekStart, SYNTHETIC_EMPLOYEES, shifts as Shift[]);
  return json(200, { synthetic: true, ...summary }, { 'Cache-Control': 'no-store' });
}
