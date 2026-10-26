// Vercel serverless function: POST /api/timesheet. Logic lives in src/server/handlers.ts.
import { handleTimesheet } from '../src/server/handlers';

export const POST = handleTimesheet;
export const OPTIONS = handleTimesheet;
