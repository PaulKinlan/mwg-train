import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Sandbox, viewerTmpfsArgs, VIEWER_TMPFS_BYTES } from '../src/viewer/sandbox.mjs';
import { boundedDeviceArgs, DEVICE_TMPFS_BYTES } from '../src/sandbox/devices.mjs';

const hasBwrap = (() => { try { execFileSync('which', ['bwrap'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const MiB = 1024 * 1024;

test('viewer sizes each distinct tmpfs mount explicitly', () => {
  assert.deepEqual(viewerTmpfsArgs(), [
    '--size', String(64 * MiB), '--tmpfs', '/tmp',
    '--size', String(64 * MiB), '--tmpfs', '/data',
  ]);
  assert.equal(VIEWER_TMPFS_BYTES, 64 * MiB);
  const devices = boundedDeviceArgs();
  assert.deepEqual(devices.slice(0, 4), ['--size', String(4 * MiB), '--tmpfs', '/dev']);
  assert.ok(!devices.includes('--dev'), 'the unbounded bubblewrap --dev mount must not return');
  for (let i = 0; i < devices.length; i++) {
    if (devices[i] === '--dev-bind') assert.notEqual(devices[i + 1], '/dev/pts', 'never bind host PTYs');
  }
});

test('viewer root is read-only while /tmp, /data and /dev reject bounded fill at their separate ceilings',
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
        if (dir === 'root') {
          let errorCode = null;
          try { const fd = openSync('/bounded-root-write', 'w'); closeSync(fd); }
          catch (error) { errorCode = error.code; }
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ errorCode })); return;
        }
        if (dir !== 'tmp' && dir !== 'data' && dir !== 'dev') { response.writeHead(404); response.end(); return; }
        const mount = '/' + dir;
        const fs = statfsSync(mount);
        const maxBytes = fs.bsize * fs.blocks;
        let bytes = 0, errorCode = null;
        const fd = openSync(mount + '/bounded-fill', 'w');
        try {
          for (let i = 0; i < (dir === 'dev' ? 8 : 80); i++) {
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
    const root = await sandbox.request({ method: 'GET', path: '/root', headers: {} });
    assert.equal(root.status, 200, sandbox.log);
    assert.equal(JSON.parse(Buffer.from(root.bodyBase64, 'base64').toString('utf8')).errorCode,
      'EROFS', 'implicit unsized root tmpfs must reject any ordinary file write');
    for (const mount of ['tmp', 'data', 'dev']) {
      const result = await sandbox.request({ method: 'GET', path: `/${mount}`, headers: {} });
      assert.equal(result.status, 200, `${mount}: ${sandbox.log}`);
      const report = JSON.parse(Buffer.from(result.bodyBase64, 'base64').toString('utf8'));
      const limit = mount === 'dev' ? DEVICE_TMPFS_BYTES : VIEWER_TMPFS_BYTES;
      assert.equal(report.maxBytes, limit, `${mount} mount has exact bound`);
      assert.equal(report.errorCode, 'ENOSPC', `${mount} refuses additional writes; not just a declared quota`);
      assert.ok(report.bytes >= limit - MiB && report.bytes <= limit,
        `${mount} should fill to ceiling with only one bounded 1MiB Buffer: ${JSON.stringify(report)}`);
    }
  });
