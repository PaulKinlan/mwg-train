import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { requireCorpusSandbox, startCorpusSandbox } from '../src/corpus/sandbox.mjs';
import { startServer, stopServer } from '../src/corpus/harness.mjs';

const available = (() => { try { execFileSync('bwrap', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

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
