import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { generatedServerMemoryMb, sandboxArgs, sandboxAvailable, startGeneratedServer } from '../src/eval/generated-server.mjs';
const TMPFS_BYTES = 64 * 1024 * 1024;
const DEADLINE = 20_000;
const killTree = (child) => { if (!child?.pid) return; try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} } };

test('tmpfs and V8 old-space flags are scoped to the sandbox and invalid config is rejected', () => {
  assert.equal(generatedServerMemoryMb(undefined), 512);
  for (const invalid of ['', '0', '63', '4097', '-1', '512.5', 'Infinity']) {
    assert.throws(() => generatedServerMemoryMb(invalid), /MWG_GENERATED_SERVER_MEMORY_MB/);
  }
  const args = sandboxArgs({ projectDir: '/tmp/p', port: 1, memoryMb: 256 });
  const size = args.indexOf('--size');
  assert.deepEqual(args.slice(size, size + 4), ['--size', String(TMPFS_BYTES), '--tmpfs', '/tmp']);
  assert.equal(args[args.indexOf('NODE_OPTIONS') + 1], '--max-old-space-size=256');
  assert.deepEqual(args.slice(args.lastIndexOf('--')), ['--', '/node/bin/node', 'server.mjs', '--port', '1']);
  assert.ok(!args.includes('--unshare-net'), 'the existing localhost probes keep network sharing');
});

/** Run untrusted fixture only in bubblewrap; kill its entire group even on timeout or assertion failure. */
async function runSandboxed(source, memoryMb) {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-server-memory-'));
  const reportPath = join(dir, 'report.json');
  writeFileSync(join(dir, 'server.mjs'), source.replaceAll('__REPORT__', JSON.stringify(reportPath)));
  const previous = process.env.MWG_GENERATED_SERVER_MEMORY_MB;
  process.env.MWG_GENERATED_SERVER_MEMORY_MB = String(memoryMb);
  let child;
  try {
    child = startGeneratedServer({ projectDir: dir });
    const output = [];
    child.stderr?.on('data', (chunk) => { if (output.join('').length < 65536) output.push(String(chunk)); });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, DEADLINE);
    try {
      const [code, signal] = await once(child, 'exit');
      return { code, signal, timedOut, stderr: output.join(''),
        report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null,
        memory: child.memoryContainment };
    } finally { clearTimeout(timer); }
  } finally {
    killTree(child);
    if (previous === undefined) delete process.env.MWG_GENERATED_SERVER_MEMORY_MB;
    else process.env.MWG_GENERATED_SERVER_MEMORY_MB = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('normal Node server starts with a bounded old-space and private /tmp, not an RSS claim', { timeout: DEADLINE + 5000 }, async (t) => {
  if (!sandboxAvailable()) { t.skip('bubblewrap unavailable; no generated code run without it'); return; }
  const result = await runSandboxed(`import { writeFileSync, statfsSync } from 'node:fs';
    import { getHeapStatistics } from 'node:v8';
    writeFileSync(__REPORT__, JSON.stringify({ options: process.env.NODE_OPTIONS,
      heapLimit: getHeapStatistics().heap_size_limit,
      tmpBytes: statfsSync('/tmp').bsize * statfsSync('/tmp').blocks }));`, 64);
  assert.equal(result.timedOut, false, result.stderr);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.report.options, '--max-old-space-size=64');
  assert.ok(result.report.heapLimit > 64 * 1024 * 1024, 'old-space is only part of Node heap');
  assert.equal(result.report.tmpBytes, TMPFS_BYTES);
  assert.equal(result.memory.mode, 'heap-only');
  assert.equal(result.memory.rssContained, false);
  assert.match(result.memory.reason, /no host cgroup attachment/);
});

test('JS-old-space runaway is reaped before the independent 20s bound', { timeout: DEADLINE + 5000 }, async (t) => {
  if (!sandboxAvailable()) { t.skip('bubblewrap unavailable; no generated code run without it'); return; }
  // JS arrays populate V8 old-space. Buffers use native memory and MUST NOT be used as a proof of RSS containment.
  const result = await runSandboxed(`const held = []; function grow() {
    held.push(new Array(400_000).fill(Math.random())); setImmediate(grow);
  } grow();`, 64);
  assert.equal(result.timedOut, false, 'V8 heap, not our timeout, should stop this fixture');
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /heap out of memory|allocation failed|Reached heap limit|Memory limit/);
  assert.equal(result.memory.rssContained, false, 'do not claim hard memory containment from a heap-only test');
});
