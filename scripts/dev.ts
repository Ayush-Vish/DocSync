import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { handle } from '../src/worker.ts';
import { sqliteDatabase } from './sqlite.ts';

if (!existsSync('.local/config.json')) throw new Error('Run npm run setup first.');
if (!existsSync('dist/public/app.js')) throw new Error('Run npm run build first.');
const config = JSON.parse(readFileSync('.local/config.json', 'utf8'));
const database = sqliteDatabase('.local/docsync.sqlite'); database.migrate();
const port = Number(process.env.PORT || 8787);
const assets = {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const file = path === '/app.js' ? 'app.js' : path === '/app.css' ? 'app.css' : path === '/' || path.startsWith('/share/') ? 'index.html' : null;
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : readFileSync(resolve('dist/public', file)), { headers: { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' } });
  },
};
const server = createServer(async (incoming, outgoing) => {
  try {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(incoming.headers.host || '')) { outgoing.writeHead(403); outgoing.end('Invalid host'); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of incoming) { size += chunk.length; if (size > 550_000) { outgoing.writeHead(413); outgoing.end('Request too large'); return; } chunks.push(chunk); }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    const method = incoming.method || 'GET';
    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, { method, headers, ...(['GET', 'HEAD'].includes(method) ? {} : { body: Buffer.concat(chunks) }) });
    const response = await handle(request, { ...config, DB: database.db, ASSETS: assets });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Local server error'); }
});
server.on('error', error => {
  console.error(`Cannot start local server: ${error.message}`);
  database.close(); process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`DocSync running at http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { database.close(); process.exit(0); }));
