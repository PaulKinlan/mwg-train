/**
 * The static server exists to make the measuring page and the images it reads same-origin. Its one
 * security-relevant behaviour is that a URL cannot walk out of the directory it is mounted to, so that
 * is tested with the attack rather than with a description of the defence.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { startStaticServer } from '../scripts/lib/static-server.mjs';

// The content the traversal attacks are trying to read. Named once so the fixture and the leak assertion
// cannot drift apart, which is how the original version of the traversal test became vacuous.
const SENTINEL = 'not for the browser';

async function withServer(run) {
  const dir = mkdtempSync(join(tmpdir(), 'static-server-'));
  writeFileSync(join(dir, 'board.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  writeFileSync(join(dir, 'demo.css'), 'body { color: #fff; }');
  writeFileSync(join(dir, 'demo.js'), 'document.title = "demo";');
  const secret = join(tmpdir(), `static-server-secret-${Date.now()}.txt`);
  writeFileSync(secret, SENTINEL);
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

    const css = await fetch(`${server.origin}/b/demo.css`);
    const js = await fetch(`${server.origin}/b/demo.js`);
    assert.match(css.headers.get('content-type'), /^text\/css\b/, 'the browser must parse demo styles');
    assert.match(js.headers.get('content-type'), /^text\/javascript\b/, 'strict browsers require a script MIME type');

    const page = await fetch(`${server.origin}/page.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /analyse/);

    const missing = await fetch(`${server.origin}/b/nope.jpg`);
    assert.equal(missing.status, 404);
  });
});

test('a URL cannot walk out of the directory it is mounted to', async () => {
  await withServer(async ({ server, secret }) => {
    // THE CONTROL IS A READ, NOT A REGEX ON A PATH. The first version of this test ended with
    // `assert.match(secret, /static-server-secret/)`, which matches the fixture's path STRING, so it
    // passes whether or not the file exists. Meanwhile every attack URL asked for
    // `static-server-secret.txt` while the fixture is `static-server-secret-<timestamp>.txt`: each
    // request 404'd on a file that was never there, so the containment guard was never reached. Deleting
    // the guard left this suite green - it could not see the defence disappear (mwg-train-cmk). Reading
    // the file proves there is something real outside the mount that a traversal could actually leak.
    assert.equal(readFileSync(secret, 'utf8'), SENTINEL, 'premise: a readable file exists outside the mount');

    const name = basename(secret);
    assert.notEqual(
      name,
      'static-server-secret.txt',
      'premise: the fixture basename is timestamped, which is exactly why the old attack named a missing file',
    );

    for (const attempt of [`/b/../${name}`, `/b/%2e%2e/${name}`, `/b/..%2f${name}`]) {
      const response = await fetch(`${server.origin}${attempt}`);
      assert.notEqual(response.status, 200, `${attempt} must not be served`);
      assert.equal((await response.text()).includes(SENTINEL), false, `${attempt} must not leak the file`);
    }

    // Only the `%2f` form reaches the handler with the traversal intact; the other two are refused with
    // 404 even when the guard is removed, so they never tested it. This one must be refused BY THE GUARD
    // - 403, not 404 - because the premise above has established the file is really there, so a 404
    // could only mean the lookup missed rather than the guard held.
    const decoded = await fetch(`${server.origin}/b/..%2f${name}`);
    assert.equal(
      decoded.status,
      403,
      'the encoded traversal must be refused by the containment guard (403), not by a lookup miss',
    );
  });
});

test('a stylesheet is served as text/css, because a browser refuses to apply it otherwise', () => {
  // The defect this exists for (mwg-train-ea9): the CONTENT_TYPES map had no `.css` entry, so a stylesheet
  // was served as `application/octet-stream`. Chrome loaded the file - `link.sheet` was truthy - and then
  // applied ZERO of its rules, because a stylesheet with a non-CSS MIME type is refused under strict MIME
  // checking. The demo therefore rendered with no CSS while every functional check passed, and through this
  // server a broken stylesheet could not be told apart from a working one.
  //
  // Asserting the exact type rather than the absence of octet-stream: a wrong-but-plausible type would be
  // just as invisible, and this is one of the few places where the exact string IS the behaviour.
  return withServer(async ({ server, dir }) => {
    writeFileSync(join(dir, 'sheet.css'), ':root { --bg: #0f172a; }\n');
    writeFileSync(join(dir, 'page.html'), '<!doctype html><title>t</title>\n');
    writeFileSync(join(dir, 'app.js'), 'export const x = 1;\n');
    const expected = [
      ['sheet.css', 'text/css; charset=utf-8'],
      ['page.html', 'text/html; charset=utf-8'],
      ['app.js', 'text/javascript; charset=utf-8'],
    ];
    for (const [name, type] of expected) {
      const response = await fetch(`${server.origin}/b/${name}`);
      assert.equal(response.status, 200, `${name} must be served`);
      assert.equal(
        response.headers.get('content-type'),
        type,
        `${name} must be served as ${type}; a stylesheet served as application/octet-stream is silently not applied`,
      );
    }
  });
});
