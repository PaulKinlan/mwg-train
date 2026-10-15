/**
 * account-recovery server, webcomponents arm. Server-rendered pages, an ephemeral SQLite store, and
 * a JSON endpoint the enhancement script reads. Written to be readable rather than clever: the pilot
 * measures behaviour, and a reviewer has to be able to see what the server does.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDocument } from './app/page.mjs';

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
db.exec(`CREATE TABLE IF NOT EXISTS records (
  ref TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, password TEXT NOT NULL, display_name TEXT)`);

const insert = db.prepare('INSERT INTO records (ref, created_at, payload) VALUES (?, ?, ?)');
const select = db.prepare('SELECT ref, created_at, payload FROM records WHERE ref = ?');
db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, ref TEXT NOT NULL, created_at TEXT NOT NULL)');
const insertSession = db.prepare('INSERT INTO sessions (sid, ref, created_at) VALUES (?, ?, ?)');
const selectSession = db.prepare('SELECT ref FROM sessions WHERE sid = ?');
const count = db.prepare('SELECT COUNT(*) AS n FROM records');
const list = db.prepare('SELECT ref, payload FROM records ORDER BY created_at DESC LIMIT 50');


const parseBody = (request) =>
  new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body))));
  });

const html = (response, document, status = 200, headers = {}) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
  response.end(document);
};
const json = (response, value, status = 200, headers = {}) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(value));
};

const REQUIRED = ["email","password","displayName"];

// The cart form has its own fields. Validating it against the search form's required list refused every
// cart POST with 422, which the write journey caught: a second form on one page needs a second rule.
const EXTRA_ACTION = "";
const EXTRA_REQUIRED = [];
const requiredFor = (path) => (EXTRA_ACTION !== '' && path === EXTRA_ACTION ? EXTRA_REQUIRED : REQUIRED);

// Every request this server answered, in order. The browser's own network log never reported the form
// POST, so the POST's status was being taken from the page it redirected to - which is how 'the POST
// succeeded' came to be claimed with no POST observed. The server is the witness for its own writes.
const requestLog = [];

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
  const path = url.pathname;
  if (path !== '/__requests') {
    const writeHead = response.writeHead.bind(response);
    response.writeHead = (status, headers) => {
      requestLog.push({ method: request.method, path, status });
      return writeHead(status, headers);
    };
  }

  if (path === '/__health') return json(response, { ok: true });
  if (path === '/__requests' && request.method === 'GET') return json(response, requestLog);

  if (path.startsWith('/app/')) {
    const file = join(here, path);
    try {
      const body = readFileSync(file);
      const type = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/plain';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
      return response.end(body);
    } catch {
      // Not in the tree, so it may be one of the archetype's boards: served from the store, and only if
      // its bytes still hash to the recorded digest. The provenance header is deliberate - a reader and a
      // test can both tell a board of the target from a file the build itself wrote.
      const asset = readArchetypeAsset(decodeAssetName(path.slice('/app/'.length)));
      if (asset) {
        response.writeHead(200, { 'content-type': asset.type, 'x-asset-source': `${ASSET_STORE}/images`, 'cache-control': 'no-store' });
        return response.end(asset.body);
      }
      response.writeHead(404);
      return response.end('not found');
    }
  }

  if (path === '/' && request.method === 'GET') return html(response, await renderDocument({ title: "Account sign-in and recovery" }));

  if (path === '/signup' && request.method === 'POST') {
    const body = await parseBody(request);
    const missing = requiredFor(path).filter((field) => !String(body[field] ?? '').trim());
    if (missing.length > 0) {
      // The server validates as well as the client: a browser without JS must not be able to post an
      // empty record, and the response has to be a usable page again - an apology with no form strands
      // the user, which is its own defect.
      const document = await renderDocument({ title: 'Please correct the form', data: { errorSummary: `Missing: ${missing.join(', ')}` } });
      return html(response, document.replace('<h1>', `<p role="alert">Missing: ${missing.join(', ')}</p><h1>`), 422);
    }
    const ref = randomUUID().slice(0, 8);
    insert.run(ref, new Date().toISOString(), JSON.stringify(body));
    // The session is what makes the follow-up page show the right record, so it is stored, not guessed.
    const sid = randomUUID();
    insertSession.run(sid, ref, new Date().toISOString());
    const headers = { 'set-cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600` };
    response.writeHead(303, { location: `/account`.replace('${ref}', ref), ...headers });
    return response.end();
  }

  const readRoute = "/reset/:ref";
  const readMatch = path.match(new RegExp('^' + readRoute.replace(':ref', '([^/]+)').replace(/\//g, '\\/') + '$'));
  if (readMatch && request.method === 'GET') {
    const row = select.get(readMatch[1]);
    if (!row) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return response.end('<!doctype html><title>Not found</title><p>We could not find that record.</p>');
    }
    return html(response, await renderDocument({ title: 'Your submission', data: { ref: row.ref } }));
  }

  if (path === '/api/me' && request.method === 'GET') {
    // The session echo: who the server thinks you are, from the cookie it issued.
    const sid = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sid='))
      ?.slice('sid='.length);
    const session = sid ? selectSession.get(sid) : undefined;
    const record = session ? select.get(session.ref) : undefined;
    if (!record) return json(response, { error: 'no session' }, 401);
    return json(response, { ref: record.ref, ...JSON.parse(record.payload) });
  }

  if (path === '/api/records' && request.method === 'GET') {
    // The write journey's read side: what the server actually stored, listed back to the caller.
    return json(response, list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })));
  }

  if (path.startsWith('/api/record/') && request.method === 'GET') {
    const row = select.get(path.split('/').pop());
    if (!row) return json(response, { error: 'not found' }, 404);
    return json(response, { ref: row.ref, ...JSON.parse(row.payload) });
  }

  // A route the archetype declares is a route the server must serve: /account was declared as the
  // account flow's page and never implemented, so the journey landed on a 404.
  if (["/account"].includes(path) && request.method === 'GET') {
    return html(response, await renderDocument({ title: 'Your account' }));
  }

  if (path === '/roster' || path === '/inbox' || path === '/attendees' || path === '/cart') {
    const rows = list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) }));
    return html(response, await renderDocument({ title: 'Records', data: { rows } }));
  }

  if (path === '/search' && request.method === 'GET') {
    const query = url.searchParams.get('q') ?? '';
    const rows = list.all().map((row) => ({ ref: row.ref, ...JSON.parse(row.payload) })).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
    return html(response, await renderDocument({ title: `Search: ${query}`, data: { query, rows } }));
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`listening on ${port} with ${dbPath}`);
});
