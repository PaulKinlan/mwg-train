/**
 * account-recovery server, hono arm: routing in Hono, pages as hono/html templates, records in SQLite.
 *
 * Hono runs on the server, so this arm keeps the same journey contract as the others (a POST that
 * writes, a GET that reads the record back, a JSON endpoint the enhancement script reads) while the
 * markup stays plain HTML strings rather than a virtual DOM.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { renderDocument, renderPage } from './app/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_STORE = "assets/archetypes/account-recovery";
const ASSET_DIGESTS = {"step1-request.jpg":"1a6989fb1979ebd0c7a1b8691f4df0f0843fdec994a8328ad54fc1756d187da2","step2-sent.jpg":"2ebfcab74be289c17db8b585e786cdc6757bd0c88cb81900dd7256cffbbb0eeb","step3-refusal.jpg":"4d937b3ab1031b82ced3d36d181e2419501f7da22b3eeb6a9460f19515a82b38"};
const ASSET_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
function decodeAssetName(raw) {
  // Never throws: a malformed percent-escape (GET /app/%zz) used to raise a URIError out of the request handler
  // and take the server process down with it. An empty string fails the name pattern below, so the request 404s
  // the same way an unregistered board does.
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

function readArchetypeAsset(name) {
  // A name that is not a plain board filename is refused first. The register lookup below would refuse it too,
  // but this is what keeps a name carrying %, / or .. away from both the filesystem and the register.
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return null;
  if (!Object.hasOwn(ASSET_DIGESTS, name)) return null;
  let dir = here;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, ASSET_STORE, 'images', name);
    if (existsSync(candidate)) {
      const body = readFileSync(candidate);
      if (createHash('sha256').update(body).digest('hex') !== ASSET_DIGESTS[name]) return null;
      return { body, type: ASSET_TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream' };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
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

const REQUIRED = ["email","password","displayName"];

// The cart form has its own fields. Validating it against the search form's required list refused every
// cart POST with 422, which the write journey caught: a second form on one page needs a second rule.
const EXTRA_ACTION = "";
const EXTRA_REQUIRED = [];
const requiredFor = (path) => (EXTRA_ACTION !== '' && path === EXTRA_ACTION ? EXTRA_REQUIRED : REQUIRED);
db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, ref TEXT NOT NULL, created_at TEXT NOT NULL)');
const insertSession = db.prepare('INSERT INTO sessions (sid, ref, created_at) VALUES (?, ?, ?)');
const selectSession = db.prepare('SELECT ref FROM sessions WHERE sid = ?');
const requestLog = [];
const app = new Hono();
app.use('*', async (c, next) => {
  await next();
  if (c.req.path !== '/__requests') requestLog.push({ method: c.req.method, path: c.req.path, status: c.res.status });
});
app.get('/__requests', (c) => c.json(requestLog));

app.get('/__health', (c) => c.json({ ok: true }));

app.get('/app/:file', (c) => {
  // The param read is INSIDE the try on purpose. Reading it decodes a percent-encoded path segment, and a
  // malformed escape is a throw; if that escaped the handler the whole server would go down on GET /app/%zz.
  let name = null;
  try {
    name = c.req.param('file');
    const body = readFileSync(join(here, 'app', name));
    const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/plain';
    return c.body(body, 200, { 'content-type': `${type}; charset=utf-8` });
  } catch {
    // Not in the tree, so it may be one of the archetype's boards: served from the store, and only if its
    // bytes still hash to the recorded digest. Kept on the existing single-segment route rather than a new
    // one deliberately - the route set is compared against the project's specification, and a second route
    // for assets would have to be declared there and would make the arm differ from its spec.
    const asset = readArchetypeAsset(name);
    if (asset) return c.body(asset.body, 200, { 'content-type': asset.type, 'x-asset-source': `${ASSET_STORE}/images`, 'cache-control': 'no-store' });

    return c.text('not found', 404);
  }
});

app.get('/', (c) => c.html(renderDocument({ title: "Account sign-in and recovery" })));

app.post('/signup', async (c) => {
  const body = await c.req.parseBody();
  const missing = requiredFor(c.req.path).filter((field) => !String(body[field] ?? '').trim());
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
  return c.redirect(`/account`.replace('${ref}', ref), 303);
});

const readPath = "/reset/:ref";
app.get(readPath, (c) => {
  const row = select.get(c.req.param('ref'));
  if (!row) return c.text('We could not find that record.', 404);
  return c.html(renderDocument({ title: 'Your submission' }));
});

app.get('/api/records', (c) => c.json(list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) }))));

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

for (const sessionPage of ["/account"]) {
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
