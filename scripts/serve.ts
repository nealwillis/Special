// Local stand-in for Vercel: serves the web export from dist/ and routes /api/* to the same handlers
// the serverless functions use. Run `npm run build:web` first, then `npm run serve`.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { handleTimesheet, handleWeek } from '../src/server/handlers';

const PORT = Number(process.env.PORT ?? 3000);
const DIST = join(__dirname, '..', 'dist');
const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  '/api/week': handleWeek,
  '/api/timesheet': handleTimesheet,
};
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.css': 'text/css',
};

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function sendWebResponse(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function serveStatic(pathname: string, res: ServerResponse) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const handler = ROUTES[pathname];
  try {
    if (handler) await sendWebResponse(res, await handler(await toWebRequest(req)));
    else serveStatic(pathname, res);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Internal error');
  }
}).listen(PORT, () => {
  if (!existsSync(DIST)) console.warn('dist/ not found: run `npm run build:web` first. The API still works.');
  console.log(`ShiftCheck on http://localhost:${PORT}`);
});
