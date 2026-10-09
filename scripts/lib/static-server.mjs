/**
 * A tiny read-only static server, used to serve images to the page that measures them.
 *
 * Why it exists at all: the image metrics in this instrument are measured by the browser, because the
 * browser is the only image decoder available here (there is no pngjs, pixelmatch, sharp or jimp in this
 * repository, and one is not being added). Drawing an image to a canvas and reading it back with
 * `getImageData` only works if the image is same-origin with the page - a `file://` image taints the
 * canvas and `getImageData` throws. So the page and the images are served from one origin, by this.
 *
 * Deliberately small and deliberately strict: prefix matching to a fixed set of directories, no
 * directory listing, no writes, and a resolved path that must stay inside the directory it was mapped
 * to. A test server that can be talked into reading arbitrary files is a bad habit to leave in a repo,
 * even when the only caller is our own instrument.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});

/**
 * Serve `mounts` (a map of URL prefix to absolute directory) plus any inline `documents` (a map of URL
 * path to a string body, used for the measuring page itself so it needs no file on disk).
 *
 * Resolves with `{ origin, close }`; the port is chosen by the OS unless one is given, so two runs
 * cannot collide.
 */
export async function startStaticServer({ mounts = {}, documents = {}, port = 0 }) {
  const resolved = Object.fromEntries(
    Object.entries(mounts).map(([prefix, dir]) => [prefix, resolve(dir)]),
  );

  const server = createServer((request, response) => {
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('bad request');
      return;
    }

    if (Object.hasOwn(documents, path)) {
      response.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] }).end(documents[path]);
      return;
    }

    for (const [prefix, dir] of Object.entries(resolved)) {
      if (!path.startsWith(prefix)) continue;
      // The guard: the resolved path must still be inside the directory this prefix maps to, so
      // `..` in a URL cannot walk out of it.
      const candidate = resolve(join(dir, normalize(path.slice(prefix.length))));
      if (candidate !== dir && !candidate.startsWith(dir + sep)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      try {
        if (!statSync(candidate).isFile()) throw new Error('not a file');
        const body = readFileSync(candidate);
        response
          .writeHead(200, { 'content-type': CONTENT_TYPES[extname(candidate).toLowerCase()] ?? 'application/octet-stream' })
          .end(body);
      } catch {
        response.writeHead(404).end('not found');
      }
      return;
    }

    response.writeHead(404).end('not found');
  });

  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', done);
  });

  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}
