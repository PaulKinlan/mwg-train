import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Sandbox, viewerTmpfsArgs, VIEWER_TMPFS_BYTES } from '../src/viewer/sandbox.mjs';

const hasBwrap = (() => { try { execFileSync('which', ['bwrap'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const MiB = 1024 * 1024;

test('viewer sizes each distinct tmpfs mount explicitly', () => {
  assert.deepEqual(viewerTmpfsArgs(), [
    '--size', String(64 * MiB), '--tmpfs', '/tmp',
    '--size', String(64 * MiB), '--tmpfs', '/data',
  ]);
  assert.equal(VIEWER_TMPFS_BYTES, 64 * MiB);
});

test('viewer /tmp and /data each reject bounded fill at the 64MiB ceiling, while site starts normally',
  { skip: !hasBwrap, timeout: 60_000 }, async (t) => {
    const siteDir = mkdtempSync(join(tmpdir(), 'viewer-memory-site-'));
    // The fixture keeps exactly one 1MiB Buffer and makes at most 80 writes per mount.
    // Never use an unbounded allocation loop: V8 old-space limits do not constrain Buffers.
    writeFileSync(join(siteDir, 'server.mjs'), `
      import { createServer } from 'node:http';
      import { statfsSync, openSync, closeSync, writeSync } from 'node:fs';
      const chunk = Buffer.alloc(1024 * 1024);
      createServer((request, response) => {
        const dir = new URL(request.url, 'http://localhost').pathname.slice(1);
        if (dir === '__health') { response.end('ok'); return; }
        if (dir !== 'tmp' && dir !== 'data') { response.writeHead(404); response.end(); return; }
        const mount = '/' + dir;
        const fs = statfsSync(mount);
        const maxBytes = fs.bsize * fs.blocks;
        let bytes = 0, errorCode = null;
        const fd = openSync(mount + '/bounded-fill', 'w');
        try {
          for (let i = 0; i < 80; i++) {
            try { bytes += writeSync(fd, chunk); }
            catch (error) { errorCode = error.code; break; }
          }
        } finally { closeSync(fd); }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ maxBytes, bytes, errorCode }));
      }).listen(Number(process.env.PILOT_PORT), '127.0.0.1');
    `);
    const sandbox = new Sandbox({ id: 'test:bounded-tmpfs', siteDir });
    t.after(() => { sandbox.stop(); rmSync(siteDir, { recursive: true, force: true }); });
    await sandbox.start();
    for (const mount of ['tmp', 'data']) {
      const result = await sandbox.request({ method: 'GET', path: `/${mount}`, headers: {} });
      assert.equal(result.status, 200, `${mount}: ${sandbox.log}`);
      const report = JSON.parse(Buffer.from(result.bodyBase64, 'base64').toString('utf8'));
      assert.equal(report.maxBytes, VIEWER_TMPFS_BYTES, `${mount} mount has exact bound`);
      assert.equal(report.errorCode, 'ENOSPC', `${mount} refuses additional writes; not just a declared quota`);
      assert.ok(report.bytes >= 60 * MiB && report.bytes <= VIEWER_TMPFS_BYTES,
        `${mount} should fill to ceiling with only one bounded 1MiB Buffer: ${JSON.stringify(report)}`);
    }
  });
