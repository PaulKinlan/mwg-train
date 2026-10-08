/**
 * Fixture site for viewer tests. It is deliberately a probe: its routes report what the sandbox
 * lets it see (headers, env, filesystem, network reachability), so tests can assert the boundary
 * rather than assume it. It is only ever run by the test suite, inside the sandbox.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const port = Number(arg('port', process.env.PILOT_PORT ?? 3000));
const dbPath = arg('db', join(here, 'probe.sqlite'));
// The viewer passes --db with a path in a writable mount; touch it so a read-only tree is proven
// not to be the thing being written.
import { writeFileSync } from 'node:fs';
writeFileSync(dbPath, 'probe');

const json = (response, value, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const path = url.pathname;

  if (path === '/__health') return json(response, { ok: true });
  if (path === '/headers') return json(response, { headers: request.headers });
  if (path === '/env') return json(response, { keys: Object.keys(process.env).sort() });
  if (path === '/fs') {
    const target = url.searchParams.get('path') ?? '';
    return json(response, { path: target, exists: existsSync(target) });
  }
  if (path === '/can-reach') {
    const target = url.searchParams.get('url') ?? '';
    try {
      const upstream = await fetch(target, { signal: AbortSignal.timeout(1200) });
      return json(response, { url: target, reachable: true, status: upstream.status });
    } catch (error) {
      return json(response, { url: target, reachable: false, code: error.cause?.code ?? error.message });
    }
  }
  if (path === '/redirect') {
    response.writeHead(303, { location: '/next' });
    return response.end();
  }
  if (path === '/cookie') {
    response.writeHead(200, { 'content-type': 'text/plain', 'set-cookie': ['session=fake-demo-session; Path=/; HttpOnly', 'theme=dark'] });
    return response.end('cookie set');
  }
  if (path === '/next') return json(response, { ok: 'arrived' });
  if (path === '/app/script.js') {
    response.writeHead(200, { 'content-type': 'application/javascript' });
    return response.end("export async function load() { return fetch('/api/data'); }\n");
  }
  if (path === '/app/styles.css') {
    response.writeHead(200, { 'content-type': 'text/css' });
    return response.end('body { background: url(/img/bg.png); }\n');
  }
  if (path === '/api/data') return json(response, { data: [1, 2, 3] });
  if (path === '/' || path === '/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(`<!doctype html><html><head><link rel="stylesheet" href="/app/styles.css"></head>
<body><h1>probe</h1><form method="post" action="/submit"><input name="x"></form>
<a href="/next">next</a><img src="/img/logo.png"><script type="module" src="/app/script.js"></script></body></html>`);
  }
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`probe on ${port}`);
});
