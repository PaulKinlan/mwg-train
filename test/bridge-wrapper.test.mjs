/**
 * The sandbox bridge's response-size cap (bead mwg-train-frd9).
 *
 * The bridge used to enforce its 16 MiB cap only after `response.arrayBuffer()` had pulled the whole
 * body into this process's heap, so a site answering with an unbounded stream was a heap-exhaustion
 * primitive and the cap was a report, not a limit. These tests drive bridge-wrapper.mjs as the real
 * child process it is (it is spawned, never imported) against a fixture site that both overshoots
 * the cap and reports how many body bytes it actually managed to write, so "refused early" is
 * measured from the producing side rather than asserted from the code.
 *
 * The suite is named for the module's stem so a change to src/viewer/bridge-wrapper.mjs is selected
 * without relying on an import edge: the wrapper is launched by path, never imported, so the gate's
 * dependency graph has nothing to follow. The edge is also declared in .fleet/coverage-mapping.json,
 * which the fleet oracle reads as well.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WRAPPER = join(ROOT, 'src/viewer/bridge-wrapper.mjs');
const FIXTURE = join(ROOT, 'test-fixtures/sites/response-cap/server.mjs');

const CAP_BYTES = 16 * 1024 * 1024;
const STREAM_TOTAL_BYTES = 64 * 1024 * 1024;
const CHUNKED_OK_BYTES = 2 * 1024 * 1024;

const T_READY = 1;
const T_REQUEST = 2;
const T_RESPONSE = 3;
const T_LOG = 4;
const T_GONE = 5;

// The fixture writes byte i as (offset + i) % 251; the test regenerates it to compare the whole body.
const pattern = (offset, length) => {
  const buffer = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i += 1) buffer[i] = (offset + i) % 251;
  return buffer;
};

const freePort = () =>
  new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? rejectPort(error) : resolvePort(port)));
    });
  });

const deadline = (promise, ms, what) => {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms waiting for ${what}`)), ms);
    }),
  ]);
};

/** A live bridge-wrapper child, framed over its stdio pipes exactly as Sandbox talks to it. */
class Bridge {
  static async start() {
    const port = await freePort();
    const stateDir = mkdtempSync(join(tmpdir(), 'bridge-cap-test-'));
    const child = spawn(process.execPath, [WRAPPER, '--entry', FIXTURE, '--port', String(port), '--db', join(stateDir, 'site.sqlite')], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const bridge = new Bridge(child, port, stateDir);
    await deadline(bridge.ready, 25_000, 'the bridge to report READY');
    return bridge;
  }

  #child;
  #stateDir;
  #buffer = Buffer.alloc(0);
  #nextId = 1;
  #pending = new Map();
  #readyResolve;
  #readyReject;
  #logWaiters = [];

  constructor(child, port, stateDir) {
    this.#child = child;
    this.#stateDir = stateDir;
    this.port = port;
    this.logs = [];
    this.ready = new Promise((readyResolve, readyReject) => {
      this.#readyResolve = readyResolve;
      this.#readyReject = readyReject;
    });
    child.stdout.on('data', (chunk) => this.#onData(chunk));
    child.stderr.on('data', (chunk) => this.#pushLog(`[stderr] ${chunk.toString()}`));
    child.on('error', (error) => this.#readyReject(error));
    child.on('exit', (code, signal) => {
      this.#pushLog(`[exited code=${code} signal=${signal}]`);
      for (const { reject } of this.#pending.values()) reject(new Error('bridge exited'));
      this.#pending.clear();
    });
  }

  #pushLog(line) {
    this.logs.push(line);
    for (const waiter of [...this.#logWaiters]) {
      const match = line.match(waiter.pattern);
      if (!match) continue;
      this.#logWaiters.splice(this.#logWaiters.indexOf(waiter), 1);
      waiter.resolve(match);
    }
  }

  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      if (this.#buffer.length < 9) return;
      const length = this.#buffer.readUInt32BE(0);
      if (this.#buffer.length < 9 + length) return;
      const type = this.#buffer.readUInt8(4);
      const id = this.#buffer.readUInt32BE(5);
      const payload = this.#buffer.subarray(9, 9 + length);
      this.#buffer = this.#buffer.subarray(9 + length);
      if (type === T_READY) this.#readyResolve();
      else if (type === T_LOG) this.#pushLog(payload.toString('utf8'));
      else if (type === T_GONE) this.#pushLog(`[site gone: ${payload.toString('utf8')}]`);
      else if (type === T_RESPONSE) {
        const entry = this.#pending.get(id);
        if (!entry) continue;
        this.#pending.delete(id);
        entry.resolve(JSON.parse(payload.toString('utf8')));
      }
    }
  }

  /** Resolves with the first log line matching `pattern`, present or future; the first group is the number. */
  waitForLog(patternSource, ms = 20_000) {
    const pattern = new RegExp(patternSource);
    // The fixture's report can arrive before this call: the response frame and the log frame are
    // separate writes, so an already-recorded line has to satisfy the wait or the assertion races.
    for (const line of this.logs) {
      const match = line.match(pattern);
      if (match) return Promise.resolve(match);
    }
    return deadline(
      new Promise((resolveMatch) => this.#logWaiters.push({ pattern, resolve: resolveMatch })),
      ms,
      `the fixture to report /${patternSource}/ (log so far: ${JSON.stringify(this.logs)})`,
    );
  }

  request(method, path) {
    const id = this.#nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      this.#pending.set(id, { resolve: resolveResponse, reject: rejectResponse });
    });
    const payload = Buffer.from(JSON.stringify({ method, path, headers: { accept: '*/*' } }), 'utf8');
    const head = Buffer.alloc(9);
    head.writeUInt32BE(payload.length, 0);
    head.writeUInt8(T_REQUEST, 4);
    head.writeUInt32BE(id, 5);
    this.#child.stdin.write(Buffer.concat([head, payload]));
    return deadline(response, 20_000, `${method} ${path} to be answered`);
  }

  stop() {
    this.#child.kill('SIGTERM');
    rmSync(this.#stateDir, { recursive: true, force: true });
  }
}

const bodyOf = (response) => Buffer.from(response.bodyBase64 ?? '', 'base64');

const withBridge = async (t) => {
  const bridge = await Bridge.start();
  t.after(() => bridge.stop());
  return bridge;
};

test('a response that declares more than the cap is refused without its body being read', { timeout: 60_000 }, async (t) => {
  const bridge = await withBridge(t);

  const response = await bridge.request('GET', '/declared-oversize');

  assert.equal(response.status, 502);
  assert.match(bodyOf(response).toString('utf8'), /response too large/);
  // The site never produced the declared body: it wrote its one 1024-byte probe and the bridge
  // refused on the header, so the producer is the witness that nothing was buffered.
  const [, written] = await bridge.waitForLog('declared-oversize wrote (\\d+)');
  assert.equal(Number(written), 1024, 'the bridge must reject on the declared length, not after reading the body');
});

test('a chunked response over the cap is aborted mid-stream and refused', { timeout: 60_000 }, async (t) => {
  const bridge = await withBridge(t);

  const response = await bridge.request('GET', '/streamed-oversize');

  assert.equal(response.status, 502);
  assert.match(bodyOf(response).toString('utf8'), /response too large/);
  const [, written] = await bridge.waitForLog('streamed-oversize wrote (\\d+)');
  const produced = Number(written);
  // The cap is what stopped it: the producer got past 16 MiB (so this rejection came from the byte
  // counter, not from a header) but nowhere near the 64 MiB it would have written had the bridge
  // read the stream to completion before checking the size.
  assert.ok(produced > CAP_BYTES, `the fixture must have streamed past the cap; it reported ${produced} bytes`);
  assert.ok(produced < STREAM_TOTAL_BYTES / 2,
    `the bridge must stop reading at the cap; the fixture wrote ${produced} of ${STREAM_TOTAL_BYTES} bytes`);
});

test('responses within the cap are still delivered whole', { timeout: 60_000 }, async (t) => {
  const bridge = await withBridge(t);

  const small = await bridge.request('GET', '/ok');
  assert.equal(small.status, 200);
  assert.equal(small.headers['content-type'], 'text/plain');
  assert.equal(bodyOf(small).toString('utf8'), 'bridged');

  // Chunked, no content-length, several MiB: the byte counter must pass it through byte for byte.
  const chunked = await bridge.request('GET', '/chunked-ok');
  assert.equal(chunked.status, 200);
  const body = bodyOf(chunked);
  assert.equal(body.length, CHUNKED_OK_BYTES);
  assert.equal(createHash('sha256').update(body).digest('hex'),
    createHash('sha256').update(pattern(0, CHUNKED_OK_BYTES)).digest('hex'),
    'an under-cap chunked response must arrive unmodified');
});
