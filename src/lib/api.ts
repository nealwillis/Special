// Client for the ShiftCheck REST API (see src/server/handlers.ts for the server side).

import { Platform } from 'react-native';

import type { Holiday } from '../core/holidays';
import type { Employee, PayPolicy, Shift } from '../core/timesheet';
import type { WeekSummary } from '../core/week';

export interface WeekResponse {
  synthetic: true;
  notice: string;
  weekStart: string;
  weekEnd: string;
  policy: PayPolicy;
  employees: Employee[];
  shifts: Shift[];
  holidays: Holiday[];
}

export type TimesheetResponse = WeekSummary & { synthetic: true };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TIMEOUT_MS = 10_000;

/**
 * On web the app and API share an origin, so a relative path works. A phone has no origin,
 * so native builds read the deployed URL from EXPO_PUBLIC_API_URL (inlined at build time).
 */
export function apiBase(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return Platform.OS === 'web' ? '' : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase();
  if (base === null) {
    throw new ApiError('No API URL configured. Set EXPO_PUBLIC_API_URL to the deployed site, e.g. https://your-app.vercel.app');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(aborted ? 'The server took too long to answer.' : "Can't reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through: non-JSON error pages are handled below
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Server error (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export function fetchWeek(weekStart: string): Promise<WeekResponse> {
  return request<WeekResponse>(`/api/week?start=${encodeURIComponent(weekStart)}`);
}

export function verifyTimesheet(weekStart: string, shifts: Shift[]): Promise<TimesheetResponse> {
  return request<TimesheetResponse>('/api/timesheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekStart, shifts }),
  });
}
