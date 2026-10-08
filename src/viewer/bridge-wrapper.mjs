/**
 * The in-sandbox bridge wrapper. Runs INSIDE the bubblewrap sandbox, replacing socat: it spawns the
 * site server, health-checks it over the namespace's loopback, and then bridges HTTP requests from
 * the viewer (host) to the site over the process's own stdio pipes.
 *
 * Why stdio and not a unix socket in a shared directory: the bridge directory was the one
 * filesystem object both the host and the untrusted site could see, and a unix socket's authority
 * is its path - a site that can write the directory can substitute the endpoint (independent
 * review, 2026-10-08). stdio is a pipe pair owned by the two processes; there is no path, no
 * filesystem object, and nothing to replace.
 *
 * Protocol: length-prefixed frames on stdin/stdout.
 *   frame = u32be length | u8 type | u32be stream id | payload
 *   types: 1 READY (payload: empty)   wrapper -> viewer, sent once the site is healthy
 *          2 REQUEST (payload: JSON {method, path, headers, bodyBase64})  viewer -> wrapper
 *          3 RESPONSE (payload: JSON {status, headers, bodyBase64})       wrapper -> viewer
 *          4 LOG (payload: utf8 line)  wrapper -> viewer (site stderr/stdout lines)
 *          5 GONE (payload: reason)    wrapper -> viewer, the site process exited
 *
 * Request and response bodies travel whole (the sites are small; the viewer buffers anyway), with
 * a hard cap so a runaway site cannot flood the viewer.
 */

const CAP_BYTES = 16 * 1024 * 1024;

const T_READY = 1;
const T_REQUEST = 2;
const T_RESPONSE = 3;
const T_LOG = 4;
const T_GONE = 5;

function writeFrame(type, id, payload) {
  const body = payload ?? Buffer.alloc(0);
  const head = Buffer.alloc(9);
  head.writeUInt32BE(body.length, 0);
  head.writeUInt8(type, 4);
  head.writeUInt32BE(id, 5);
  process.stdout.write(Buffer.concat([head, body]));
}

const log = (line) => writeFrame(T_LOG, 0, Buffer.from(String(line), 'utf8'));

async function main() {
  const arg = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  const entry = arg('entry', '/site/server.mjs');
  const port = Number(arg('port', '18080'));

  const { spawn } = await import('node:child_process');
  const site = spawn('/node/bin/node', [entry, '--port', String(port), '--db', '/data/site.sqlite'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  site.stdout.on('data', (chunk) => log(chunk.toString().trimEnd()));
  site.stderr.on('data', (chunk) => log(chunk.toString().trimEnd()));
  site.on('exit', (code, signal) => {
    writeFrame(T_GONE, 0, Buffer.from(`site exited code=${code} signal=${signal}`, 'utf8'));
    process.exit(0);
  });

  // Health over the namespace loopback: the site must answer before the bridge opens.
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__health`, { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - started > 20_000) {
      log('site did not become healthy in 20000ms');
      process.exit(3);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  writeFrame(T_READY, 0, Buffer.alloc(0));

  // Frame reader on stdin.
  let buffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 9) return;
      const length = buffer.readUInt32BE(0);
      if (buffer.length < 9 + length) return;
      const type = buffer.readUInt8(4);
      const id = buffer.readUInt32BE(5);
      const payload = buffer.subarray(9, 9 + length);
      buffer = buffer.subarray(9 + length);
      if (type === T_REQUEST) void handleRequest(id, payload);
    }
  });
  process.stdin.on('end', () => process.exit(0));

  async function handleRequest(id, payload) {
    let message;
    try {
      message = JSON.parse(payload.toString('utf8'));
    } catch {
      return send(id, 400, { 'content-type': 'text/plain' }, 'bad frame');
    }
    const body = message.bodyBase64 ? Buffer.from(message.bodyBase64, 'base64') : undefined;
    if (body && body.length > CAP_BYTES) return send(id, 413, { 'content-type': 'text/plain' }, 'request too large');
    // fetch manages these itself; forwarding them breaks or confuses undici.
    const headers = { ...message.headers };
    for (const name of ['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive']) delete headers[name];
    try {
      const response = await fetch(`http://127.0.0.1:${port}${message.path}`, {
        method: message.method,
        headers,
        body: ['GET', 'HEAD'].includes(message.method) ? undefined : body,
        redirect: 'manual',
      });
      const responseBody = Buffer.from(await response.arrayBuffer());
      if (responseBody.length > CAP_BYTES) return send(id, 502, { 'content-type': 'text/plain' }, 'response too large');
      const responseHeaders = {};
      response.headers.forEach((value, name) => {
        // set-cookie is handled via getSetCookie below: Headers.forEach would fold multiple
        // cookies into one comma-joined value, which is not parseable back into cookies.
        if (name === 'set-cookie') return;
        if (responseHeaders[name] === undefined) responseHeaders[name] = value;
        else if (Array.isArray(responseHeaders[name])) responseHeaders[name].push(value);
        else responseHeaders[name] = [responseHeaders[name], value];
      });
      const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
      if (setCookies.length > 0) responseHeaders['set-cookie'] = setCookies;
      send(id, response.status, responseHeaders, responseBody);
    } catch (error) {
      send(id, 502, { 'content-type': 'text/plain' }, `site unreachable: ${error.message}`);
    }
  }

  function send(id, status, headers, body) {
    const payload = Buffer.from(
      JSON.stringify({ status, headers, bodyBase64: Buffer.isBuffer(body) ? body.toString('base64') : Buffer.from(String(body)).toString('base64') }),
      'utf8',
    );
    writeFrame(T_RESPONSE, id, payload);
  }
}

main().catch((error) => {
  log(`wrapper failed: ${error.message}`);
  process.exit(1);
});
