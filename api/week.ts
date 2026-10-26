// Vercel serverless function: GET /api/week. Logic lives in src/server/handlers.ts.
import { handleWeek } from '../src/server/handlers';

export const GET = handleWeek;
export const OPTIONS = handleWeek;
