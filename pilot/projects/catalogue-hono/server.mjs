/**
 * catalogue server, hono arm: routing in Hono, pages as hono/html templates, records in SQLite.
 *
 * Hono runs on the server, so this arm keeps the same journey contract as the others (a POST that
 * writes, a GET that reads the record back, a JSON endpoint the enhancement script reads) while the
 * markup stays plain HTML strings rather than a virtual DOM.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { renderDocument, renderPage } from './app/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const port = Number(arg('port', process.env.PILOT_PORT ?? 3000));
const dbPath = arg('db', join(here, 'pilot.sqlite'));

const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS records (ref TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)`);
const insert = db.prepare('INSERT INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
const select = db.prepare('SELECT ref, created_at, payload FROM records WHERE ref = ?');
const list = db.prepare('SELECT ref, payload FROM records ORDER BY created_at DESC LIMIT 50');

const REQUIRED = ["q"];
db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, ref TEXT NOT NULL, created_at TEXT NOT NULL)');
const insertSession = db.prepare('INSERT INTO sessions (sid, ref, created_at) VALUES (?, ?, ?)');
const selectSession = db.prepare('SELECT ref FROM sessions WHERE sid = ?');
const app = new Hono();

app.get('/__health', (c) => c.json({ ok: true }));

app.get('/app/:file', (c) => {
  const name = c.req.param('file');
  try {
    const body = readFileSync(join(here, 'app', name));
    const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/plain';
    return c.body(body, 200, { 'content-type': `${type}; charset=utf-8` });
  } catch {
    return c.text('not found', 404);
  }
});

app.get('/', (c) => c.html(renderDocument({ title: "Searchable reference catalogue" })));

app.post('/cart', async (c) => {
  const body = await c.req.parseBody();
  const missing = REQUIRED.filter((field) => !String(body[field] ?? '').trim());
  if (missing.length > 0) {
    const document = await renderDocument({ title: 'Please correct the form' });
    // The rejected submission returns a usable page with the form, plus the reason.
    return c.html(document.replace('<h1>', `<p role="alert">Missing: ${missing.join(', ')}</p><h1>`), 422);
  }
  const ref = randomUUID().slice(0, 8);
  insert.run(ref, new Date().toISOString(), JSON.stringify(body));
  const sid = randomUUID();
  insertSession.run(sid, ref, new Date().toISOString());
  c.header('set-cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`);
  return c.redirect(`/cart`.replace('${ref}', ref), 303);
});

const readPath = "/record/:ref";
app.get(readPath, (c) => {
  const row = select.get(c.req.param('ref'));
  if (!row) return c.text('We could not find that record.', 404);
  return c.html(renderDocument({ title: 'Your submission' }));
});

app.get('/api/me', (c) => {
  const sid = (c.req.header('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sid='))
    ?.slice('sid='.length);
  const session = sid ? selectSession.get(sid) : undefined;
  const record = session ? select.get(session.ref) : undefined;
  if (!record) return c.json({ error: 'no session' }, 401);
  return c.json({ ref: record.ref, ...JSON.parse(record.payload) });
});

app.get('/api/record/:ref', (c) => {
  const row = select.get(c.req.param('ref'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ ref: row.ref, ...JSON.parse(row.payload) });
});

for (const sessionPage of ["/cart"]) {
  app.get(sessionPage, (c) => c.html(renderDocument({ title: 'Your account' })));
}

for (const listing of ['/roster', '/inbox', '/attendees', '/cart']) {
  app.get(listing, (c) => c.html(renderDocument({ title: 'Records' })));
}

app.get('/search', (c) => c.html(renderDocument({ title: `Search: ${c.req.query('q') ?? ''}` })));

app.get('/page', async (c) => c.text(await renderPage()));

// Bridge node:http onto Hono's fetch handler: the request and response objects are translated and
// nothing else is shared, so this arm really does route through Hono.
const server = createServer(async (request, response) => {
  const url = `http://${request.headers.host ?? '127.0.0.1'}${request.url}`;
  const chunks = [];
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    for await (const chunk of request) chunks.push(chunk);
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(key, value);
  const fetchRequest = new Request(url, {
    method: request.method,
    headers,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
  const fetchResponse = await app.fetch(fetchRequest);
  const outgoing = {};
  fetchResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    outgoing[key] = value;
  });
  const cookies = fetchResponse.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) outgoing['set-cookie'] = cookies;
  response.writeHead(fetchResponse.status, outgoing);
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`listening on ${port} with ${dbPath}`);
});
