import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { requireCorpusSandbox, startCorpusSandbox } from '../src/corpus/sandbox.mjs';
import { runProjectVersion, startServer, stopServer } from '../src/corpus/harness.mjs';

const available = (() => { try { execFileSync('bwrap', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('generated page egress control connects; contained page denies fetch and WebSocket but serves loopback',
  { timeout: 30_000 }, async (t) => {
    const address = Object.values(networkInterfaces()).flat().find((a) => a.family === 'IPv4' && !a.internal)?.address;
    assert.ok(address, 'control needs a reachable non-loopback host interface');
    const hits = { fetch: 0, websocket: 0 };
    const outbound = createHttpServer((req, res) => {
      hits.fetch++;
      res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }).end('connected');
    });
    outbound.on('upgrade', (req, socket) => {
      hits.websocket++;
      const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    });
    await new Promise((resolve) => outbound.listen(0, address, resolve));
    t.after(() => outbound.close());
    const endpoint = `http://${address}:${outbound.address().port}/probe`;
    const app = createHttpServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>generated page</title><script>
      window.egressProbe = (async () => {
        const endpoint = ${JSON.stringify(endpoint)};
        const fetched = await Promise.race([
          fetch(endpoint).then((res) => res.text()).then((body) => body === 'connected', () => false),
          new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
        ]);
        const websocket = await new Promise((resolve) => {
          const ws = new WebSocket(endpoint.replace('http:', 'ws:'));
          const timer = setTimeout(() => { ws.close(); resolve(false); }, 3000);
          ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(timer); resolve(false); };
        });
        return { fetched, websocket };
      })();
    </script>`));
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    const probe = async (blockEgress) => {
      const chrome = await launchChrome({ blockEgress });
      try {
        const page = await chrome.newPage();
        await page.goto(`http://127.0.0.1:${app.address().port}/`);
        assert.equal(await page.evaluate('return document.title'), 'generated page', 'loopback app must load');
        const result = await page.evaluate('return await window.egressProbe');
        return { ...result, blockedRequests: page.blockedRequests };
      } finally { await chrome.close(); }
    };
    const control = await probe(false);
    assert.equal(control.fetched, true, 'without containment browser fetch must connect');
    assert.equal(control.websocket, true, 'without containment browser WebSocket must connect');
    assert.deepEqual(hits, { fetch: 1, websocket: 1 }, 'outbound listener saw both control requests');
    const contained = await probe(true);
    assert.equal(contained.fetched, false, 'contained browser fetch must fail');
    assert.equal(contained.websocket, false, 'contained browser WebSocket must fail');
    assert.deepEqual(hits, { fetch: 1, websocket: 1 }, 'outbound listener saw no contained requests');
    assert.ok(contained.blockedRequests.some((url) => url.startsWith('http://') && url.includes(address)),
      'CDP explicitly failed the outbound fetch, not merely a proxy connection error');
    console.log(`browser egress control: fetch=true websocket=true; contained: fetch=false websocket=false; CDP failed: ${contained.blockedRequests.join(', ')}; loopback loaded`);
  });

test('unsupported platforms and unavailable bubblewrap refuse without a fallback', () => {
  assert.throws(() => requireCorpusSandbox({ platform: 'darwin', bwrapAvailable: true }), /darwin.*bubblewrap.*unsupported.*refusing/);
  assert.throws(() => requireCorpusSandbox({ platform: 'linux', bwrapAvailable: false }), /linux.*bubblewrap.*unavailable.*refusing/);
});

function hostChildRunning(marker) {
  // The PID reported by a process in a PID namespace is not its host PID. Check host /proc
  // cmdlines instead, excluding zombies; this measures whether the fork survived stop().
  return readdirSync('/proc').filter((name) => /^\d+$/.test(name)).some((name) => {
    try {
      const command = readFileSync(`/proc/${name}/cmdline`).toString();
      const state = readFileSync(`/proc/${name}/stat`, 'utf8').split(') ')[1][0];
      return state !== 'Z' && command.includes(marker);
    } catch { return false; }
  });
}

async function loopbackGet(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json() };
}

test('CPU limit kills a spinner only when enabled; wall-clock limit closes the listener',
  { skip: process.platform !== 'linux' || !available, timeout: 30_000 }, async (t) => {
    const temp = mkdtempSync(join(tmpdir(), 'corpus-cpu-test-'));
    t.after(() => rmSync(temp, { recursive: true, force: true }));
    writeFileSync(join(temp, 'server.mjs'), `
import { createServer } from 'node:http';
createServer((req, res) => {
  if (req.url === '/spin') {
    res.writeHead(200).end('spinning');
    setImmediate(() => { for (;;) {} });
    return;
  }
  res.writeHead(200).end('ok');
}).listen(Number(process.env.PILOT_PORT), '127.0.0.1');
`);
    const control = await startCorpusSandbox(temp, { port: 0, cpuSeconds: null, wallMs: 10_000 });
    t.after(() => control.stop());
    assert.equal((await fetch(`http://127.0.0.1:${control.port}/spin`)).status, 200, 'control entered spinner');
    await delay(2200);
    assert.equal(control.sandbox.alive, true, 'identical spinner survives without CPU limit');
    assert.doesNotMatch(control.log(), /site gone/, 'unlimited site has not exited');
    await control.stop();

    const limited = await startCorpusSandbox(temp, { port: 0, cpuSeconds: 2, wallMs: 10_000 });
    t.after(() => limited.stop());
    assert.equal((await fetch(`http://127.0.0.1:${limited.port}/spin`)).status, 200, 'limited run entered spinner');
    for (let i = 0; i < 60 && limited.sandbox.alive; i++) await delay(100);
    assert.equal(limited.sandbox.alive, false, 'RLIMIT_CPU kills the spinning site and its bridge');
    await limited.stop();

    const wall = await startCorpusSandbox(temp, { port: 0, wallMs: 300 });
    t.after(() => wall.stop());
    await delay(600);
    assert.equal(wall.sandbox.alive, false, 'wall deadline stops the sandbox even without requests');
    await assert.rejects(fetch(`http://127.0.0.1:${wall.port}/__health`), 'wall deadline closes listener');
  });

test('failed browser run records sandbox mechanism and platform and stops its listener',
  { skip: process.platform !== 'linux' || !available, timeout: 15_000 }, async (t) => {
    const temp = mkdtempSync(join(tmpdir(), 'corpus-record-sandbox-'));
    t.after(() => rmSync(temp, { recursive: true, force: true }));
    writeFileSync(join(temp, 'server.mjs'), `
import { createServer } from 'node:http';
createServer((_req, res) => res.writeHead(200).end('ok')).listen(Number(process.env.PILOT_PORT), '127.0.0.1');
`);
    const reservation = createServer();
    const port = await new Promise((done) => reservation.listen(0, '127.0.0.1', () => {
      const number = reservation.address().port;
      reservation.close(() => done(number));
    }));
    const record = await runProjectVersion({
      chrome: { newPage: async () => { throw new Error('browser probe ended'); } },
      projectDir: temp, spec: { project_id: 'probe', archetype: 'probe', framework: { name: 'probe', version: '1', dialect: 'js' } },
      label: 'probe', port, runDir: temp, dbPath: join(temp, 'db.sqlite'),
    });
    assert.deepEqual(record.errors, ['browser probe ended']);
    assert.equal(record.sandbox, 'bubblewrap');
    assert.equal(record.platform, 'linux');
    await assert.rejects(fetch(`http://127.0.0.1:${port}/__health`), 'run finally closed listener');
  });

test('adversarial control escapes; sandbox denies env, host write, network and fork lifetime while returning a verdict',
  { skip: process.platform !== 'linux' || !available, timeout: 60_000 }, async (t) => {
    const address = Object.values(networkInterfaces()).flat().find((a) => a.family === 'IPv4' && !a.internal)?.address;
    assert.ok(address, 'control requires a reachable non-loopback host interface');
    const temp = mkdtempSync(join(tmpdir(), 'corpus-sandbox-test-'));
    const project = join(temp, 'site');
    mkdirSync(project);
    const outside = join(temp, 'outside-write');
    const forkMarkerFile = join(temp, 'fork-write');
    const marker = `corpus-fork-${process.pid}-${Date.now()}`;
    const sentinel = `sentinel-${marker}`;
    const forkScript = `setTimeout(() => { try { require('fs').writeFileSync(${JSON.stringify(forkMarkerFile)}, 'probe'); } catch {} }, 900); setInterval(() => {}, 1000);`;
    process.env.CORPUS_SENTINEL = sentinel;
    t.after(() => {
      delete process.env.CORPUS_SENTINEL;
      for (const name of readdirSync('/proc').filter((entry) => /^\d+$/.test(entry))) {
        try {
          if (readFileSync(`/proc/${name}/cmdline`).toString().includes(marker)) process.kill(Number(name), 'SIGKILL');
        } catch {}
      }
      rmSync(temp, { recursive: true, force: true });
    });
    let accepted = 0;
    const outbound = createServer((socket) => { accepted++; socket.end(); });
    await new Promise((done) => outbound.listen(0, address, done));
    t.after(() => outbound.close());
    writeFileSync(join(project, 'server.mjs'), `
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
const server = createServer(async (req, res) => {
  if (req.url === '/__health') { res.writeHead(200).end('ok'); return; }
  if (req.url !== '/probe') { res.writeHead(404).end(); return; }
  const verdict = { sentinel: process.env.CORPUS_SENTINEL ?? null };
  try { writeFileSync(${JSON.stringify(outside)}, 'escaped'); verdict.write = true; } catch { verdict.write = false; }
  verdict.network = await new Promise((done) => {
    const socket = createConnection({host: ${JSON.stringify(address)}, port: ${outbound.address().port}});
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.end(); done(true); });
    socket.on('error', () => done(false));
    socket.on('timeout', () => { socket.destroy(); done(false); });
  });
  // The child schedules its host write after the parent has been stopped. Keep it alive so
  // /proc can distinguish a reaped process from an orphan; the control cleans it explicitly.
  const child = spawn(process.execPath, ['-e',
    ${JSON.stringify(forkScript)}, ${JSON.stringify(marker)}], { stdio: 'ignore' });
  verdict.forkPid = child.pid;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(verdict));
});
server.listen(Number(process.env.PILOT_PORT || process.argv[process.argv.indexOf('--port') + 1]), '127.0.0.1');
`);

    // Positive control: deliberately reproduce the OLD unsandboxed spawn. If it cannot escape,
    // none of the sandbox denials proves anything.
    const controlPort = await new Promise((done) => {
      const reservation = createServer();
      reservation.listen(0, '127.0.0.1', () => { const port = reservation.address().port; reservation.close(() => done(port)); });
    });
    const control = spawn(process.execPath, [join(project, 'server.mjs'), '--port', String(controlPort), '--db', join(temp, 'control.sqlite')],
      { cwd: project, stdio: 'ignore', env: { ...process.env, NODE_ENV: 'test', PILOT_PORT: String(controlPort) } });
    t.after(() => control.kill('SIGKILL'));
    let controlProbe;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { controlProbe = await loopbackGet(controlPort, '/probe'); break; } catch { await delay(100); }
    }
    assert.ok(controlProbe, 'control server must answer');
    assert.equal(controlProbe.status, 200);
    assert.equal(controlProbe.body.sentinel, sentinel, 'control must leak parent env');
    assert.equal(controlProbe.body.write, true, 'control must write outside project');
    assert.equal(existsSync(outside), true);
    assert.equal(controlProbe.body.network, true, 'control must reach non-loopback listener');
    assert.ok(accepted > 0, 'host must observe outbound connection');
    assert.ok(hostChildRunning(marker), 'control fork must really be running');
    control.kill('SIGKILL');
    await delay(1100);
    assert.equal(existsSync(forkMarkerFile), true, 'control fork must outlive its server and write');
    try { process.kill(controlProbe.body.forkPid, 'SIGKILL'); } catch {}
    rmSync(outside);
    rmSync(forkMarkerFile);

    // Exercise the real harness entry point. The requested port is the HOST listener, not 18080.
    const runPort = await new Promise((done) => {
      const reservation = createServer();
      reservation.listen(0, '127.0.0.1', () => { const port = reservation.address().port; reservation.close(() => done(port)); });
    });
    const run = await startServer(project, { port: runPort, dbPath: join(temp, 'run.sqlite') });
    t.after(() => stopServer(run));
    assert.equal(run.port, runPort);
    assert.equal((await fetch(`http://127.0.0.1:${runPort}/__health`)).status, 200, 'loopback listener forwards to bridge');
    const denied = await loopbackGet(runPort, '/probe');
    assert.equal(denied.status, 200, 'the isolated run still returns a verdict');
    assert.equal(denied.body.sentinel, null);
    assert.equal(denied.body.write, false);
    assert.equal(existsSync(outside), false);
    assert.equal(denied.body.network, false);
    assert.equal(accepted, 1, 'sandbox may not reach non-loopback host listener');
    assert.ok(denied.body.forkPid > 0, 'fork attempt ran');
    await stopServer(run);
    await delay(1150);
    assert.equal(existsSync(forkMarkerFile), false, 'fork did not write after sandbox stop');
    assert.equal(hostChildRunning(marker), false, 'fork was reaped with namespace');
    await assert.rejects(fetch(`http://127.0.0.1:${runPort}/__health`), 'host listener closed');
  });
