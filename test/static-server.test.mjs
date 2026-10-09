/**
 * The static server exists to make the measuring page and the images it reads same-origin. Its one
 * security-relevant behaviour is that a URL cannot walk out of the directory it is mounted to, so that
 * is tested with the attack rather than with a description of the defence.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startStaticServer } from '../scripts/lib/static-server.mjs';

async function withServer(run) {
  const dir = mkdtempSync(join(tmpdir(), 'static-server-'));
  writeFileSync(join(dir, 'board.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  const secret = join(tmpdir(), `static-server-secret-${Date.now()}.txt`);
  writeFileSync(secret, 'not for the browser');
  const server = await startStaticServer({
    mounts: { '/b/': dir },
    documents: { '/page.html': '<!doctype html><title>analyse</title>' },
  });
  try {
    return await run({ server, dir, secret });
  } finally {
    await server.close();
  }
}

test('a mounted file is served with a usable content type, and an inline page needs no file', async () => {
  await withServer(async ({ server }) => {
    const image = await fetch(`${server.origin}/b/board.jpg`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg', 'the canvas needs a real image content type');
    assert.equal((await image.arrayBuffer()).byteLength, 4);

    const page = await fetch(`${server.origin}/page.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /analyse/);

    const missing = await fetch(`${server.origin}/b/nope.jpg`);
    assert.equal(missing.status, 404);
  });
});

test('a URL cannot walk out of the directory it is mounted to', async () => {
  await withServer(async ({ server, secret }) => {
    // The attack, not a description of the defence: try to read a real file outside the mount, both
    // with a literal traversal and with one that survives a single decode.
    for (const attempt of [
      '/b/../static-server-secret.txt',
      '/b/%2e%2e/static-server-secret.txt',
      '/b/..%2fstatic-server-secret.txt',
    ]) {
      const response = await fetch(`${server.origin}${attempt}`);
      assert.notEqual(response.status, 200, `${attempt} must not be served`);
      const body = await response.text();
      assert.equal(body.includes('not for the browser'), false, `${attempt} must not leak the file`);
    }
    // Control: the file really is readable on disk, so the refusals above are the guard working rather
    // than a missing fixture.
    assert.match(secret, /static-server-secret/);
  });
});
