/**
 * Fixture site for the sandbox bridge's response-size cap (bead mwg-train-frd9). It serves bodies
 * that are deliberately over the cap and reports on stdout how many body bytes it actually managed
 * to write, so a test can prove the bridge stopped reading rather than buffering the payload and
 * then throwing it away. Only ever run by the test suite, through bridge-wrapper.mjs.
 */
import { createServer } from 'node:http';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const port = Number(arg('port', process.env.PILOT_PORT ?? 3000));

const CAP_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
// Four times the cap: a bridge that buffers the whole body before checking has to hold all of it.
const STREAM_TOTAL_BYTES = 64 * 1024 * 1024;
// Just under the cap, delivered without a content-length so the bridge's byte counter is the reader.
const CHUNKED_OK_BYTES = 2 * 1024 * 1024;

const pattern = (offset, length) => {
  const buffer = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i += 1) buffer[i] = (offset + i) % 251;
  return buffer;
};

const json = (response, value, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};

const report = (line) => console.log(line);

/** Writes up to STREAM_TOTAL_BYTES, waiting for drain, and reports what the peer accepted. */
async function streamOversize(response) {
  let written = 0;
  let closed = false;
  const stop = () => { closed = true; };
  response.on('close', stop);
  response.on('error', stop);
  while (!closed && written < STREAM_TOTAL_BYTES) {
    const length = Math.min(CHUNK_BYTES, STREAM_TOTAL_BYTES - written);
    written += length;
    try {
      if (!response.write(pattern(written - length, length))) {
        await new Promise((resume) => {
          const finish = () => {
            response.off('drain', finish);
            response.off('close', finish);
            resume();
          };
          response.once('drain', finish);
          response.once('close', finish);
        });
      }
    } catch {
      closed = true;
    }
  }
  report(`streamed-oversize wrote ${written}`);
  if (!closed) response.end();
}

const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/__health') return json(response, { ok: true });

  if (path === '/ok') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    return response.end('bridged');
  }

  if (path === '/chunked-ok') {
    // No content-length: node sends this chunked, so the bridge cannot pre-judge its size.
    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    for (let offset = 0; offset < CHUNKED_OK_BYTES; offset += CHUNK_BYTES) {
      response.write(pattern(offset, Math.min(CHUNK_BYTES, CHUNKED_OK_BYTES - offset)));
    }
    return response.end();
  }

  if (path === '/declared-oversize') {
    // Declares more than the cap but sends a one-chunk probe: a bridge that reads the body first
    // has nothing to read here, so a rejection that arrives at all came from the header.
    let written = 0;
    let reported = false;
    const stop = () => {
      if (reported) return;
      reported = true;
      report(`declared-oversize wrote ${written}`);
    };
    response.on('close', stop);
    response.on('error', stop);
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(CAP_BYTES + 1024),
    });
    response.write(pattern(0, 1024));
    written = 1024;
    return undefined;
  }

  if (path === '/streamed-oversize') {
    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    void streamOversize(response);
    return undefined;
  }

  response.writeHead(404, { 'content-type': 'text/plain' });
  return response.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`response-cap fixture on ${port}`);
});
