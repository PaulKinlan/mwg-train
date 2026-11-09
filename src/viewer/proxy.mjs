/**
 * The proxy between the owner and a sandboxed site - the security boundary in code.
 *
 * Two guarantees are enforced here, not merely described:
 *
 * 1. NO OWNER AUTH REACHES A SITE. Outbound request headers are built from an ALLOWLIST, not a
 *    denylist: only the headers a demo site legitimately needs are forwarded. Cookie material is
 *    forwarded only when it carries this instance's own namespace prefix (which the proxy itself
 *    put there on the way out) - so the exe.dev proxy's session cookie, an Authorization header,
 *    or any x-auth/x-forwarded header from the fronting proxy can never reach the site. The
 *    fail-closed assertion just before sending re-scans the outgoing header set and refuses the
 *    request if any forbidden name slipped through: a bug in the allowlist becomes a 500, not a
 *    leak. This is the mechanism behind the corpus invariant "each site runs with no auth headers
 *    present".
 *
 * 2. The site is reachable only through this proxy. The sandbox gives the site no other network
 *    and no filesystem bridge (see sandbox.mjs); requests cross the namespace boundary only over
 *    the child process's own stdio pipes, which carry no path authority a site could substitute.
 *
 * 3. NO REQUEST BODY EXHAUSTS THIS PROCESS. A body is buffered here before it is handed to the
 *    sandbox, so the buffer is bounded by MAX_PROXY_BODY_BYTES: the declared content-length is
 *    checked first and the running total is checked as chunks arrive, because a length header is
 *    only a claim and a chunked body need not make one at all. A body past the cap is refused with
 *    413 rather than buffered, so an oversized payload costs this process a header comparison, not
 *    its heap.
 */
import { rewriteCss, rewriteHtml, rewriteJs, rewriteLocation, rewriteSetCookie, restoreCookieNamespace } from './rewrite.mjs';

/** Request headers a demo site may legitimately need. Everything else is dropped. */
const REQUEST_ALLOWLIST = new Set([
  'accept',
  'accept-charset',
  'accept-encoding',
  'accept-language',
  'content-type',
  'content-length',
  'if-modified-since',
  'if-none-match',
  'range',
  'user-agent',
]);

/** Names that must never appear in an outbound request. Presence after filtering is a bug -> 500. */
const FORBIDDEN_OUTBOUND = new Set(['cookie', 'authorization', 'proxy-authorization', 'www-authenticate']);

const FORBIDDEN_PREFIXES = ['x-auth', 'x-exe', 'x-forwarded', 'x-real-ip', 'proxy-'];

const REWRITE_BODY_TYPES = [
  [/text\/html/i, rewriteHtml],
  [/text\/css/i, rewriteCss],
  [/(?:application|text)\/(?:javascript|ecmascript)|text\/js|module/i, rewriteJs],
];

export class ForbiddenHeaderError extends Error {}

/** Thrown when a request body would exceed MAX_PROXY_BODY_BYTES. Carried out as a 413, never a 500. */
class PayloadTooLargeError extends Error {}

/**
 * The largest request body this proxy will buffer before forwarding to a sandbox.
 *
 * A demo site's form posts kilobytes; 1 MiB is far above any legitimate one and far below what a
 * request that means to exhaust this process's heap would need. The sandbox bridge has its own,
 * much larger cap (16 MiB, bridge-wrapper.mjs), so the proxy must refuse here or the bytes would
 * already have crossed the stdio boundary by the time the bridge said no.
 */
export const MAX_PROXY_BODY_BYTES = 1024 * 1024;

/** Stop reading an oversized body without aborting the socket, so the 413 can still be delivered. */
function stopReading(request) {
  request.pause();
  // The socket may abort once we stop draining it; the refusal is already decided.
  request.on('error', () => {});
}

/**
 * Buffer the request body under a hard byte cap, bounded BEFORE it is buffered.
 *
 * `content-length` is a claim: it is honoured as an early refusal, but never trusted as the only
 * bound - the running total is checked on every chunk, so a chunked body that declares no length
 * gets the same cap as one that declares it.
 */
function readBoundedBody(request, maxBytes) {
  return new Promise((resolvePromise, rejectPromise) => {
    const declared = Number(request.headers?.['content-length'] ?? NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
      stopReading(request);
      return rejectPromise(new PayloadTooLargeError(`declared content-length ${declared} exceeds the ${maxBytes}-byte cap`));
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      stopReading(request);
      rejectPromise(error);
    };
    request.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) return fail(new PayloadTooLargeError(`request body exceeded the ${maxBytes}-byte cap`));
      chunks.push(chunk);
    });
    request.on('error', (error) => fail(error));
    request.on('end', () => {
      if (settled) return;
      settled = true;
      resolvePromise(Buffer.concat(chunks));
    });
  });
}

/** Build the outbound header set from the inbound request. Exported for tests. */
export function outboundHeaders(inbound, { cookieNamespace }) {
  const out = {};
  for (const [name, value] of Object.entries(inbound)) {
    const lower = name.toLowerCase();
    if (REQUEST_ALLOWLIST.has(lower)) out[lower] = value;
  }
  // Only this instance's own cookies, with the namespace stripped back off, ever reach the site.
  const siteCookies = restoreCookieNamespace(inbound.cookie, cookieNamespace);
  if (siteCookies) out.cookie = siteCookies;
  // The site must see a self-contained request: identity encoding keeps the rewriting legible.
  if (out['accept-encoding']) out['accept-encoding'] = 'identity';
  return out;
}

/** The fail-closed assertion: scan the outbound set and throw if anything forbidden survived. */
export function assertNoAuthHeaders(headers) {
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (FORBIDDEN_OUTBOUND.has(lower) && lower !== 'cookie') throw new ForbiddenHeaderError(`forbidden outbound header: ${lower}`);
    if (lower === 'cookie') continue; // cookies reach a site only via the namespace, handled above
    if (FORBIDDEN_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      throw new ForbiddenHeaderError(`forbidden outbound header: ${lower}`);
    }
  }
}

/**
 * Proxy one request to a sandbox instance.
 *
 * @param {object} args
 * @param {http.IncomingMessage} args.request
 * @param {http.ServerResponse} args.response
 * @param {Sandbox} args.sandbox    the running sandbox; requests travel over its stdio bridge
 * @param {string} args.prefix      the URL prefix this site is served under, e.g. /live/booking-raw/original
 * @param {string} args.sitePath    the request path with the prefix stripped, including query
 */
export async function proxyRequest({ request, response, sandbox, prefix, sitePath, cookieNamespace }) {
  let body;
  try {
    body = await readBoundedBody(request, MAX_PROXY_BODY_BYTES);
  } catch (error) {
    if (!(error instanceof PayloadTooLargeError)) throw error;
    // The refused body may be unread, so the connection ends with this response: a keep-alive
    // response would leave the socket waiting for bytes nobody is going to drain.
    response.writeHead(413, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'close',
    });
    response.end(`request body too large: the cap is ${MAX_PROXY_BODY_BYTES} bytes\n`);
    return;
  }

  const headers = outboundHeaders(request.headers, { cookieNamespace });
  try {
    assertNoAuthHeaders(headers);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`refused: ${error.message}`);
    return;
  }

  let upstream;
  try {
    upstream = await sandbox.request({ method: request.method, path: sitePath, headers, body });
  } catch (error) {
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`sandbox unreachable: ${error.message}`);
    return;
  }

  const responseHeaders = {};
  for (const [name, value] of Object.entries(upstream.headers)) {
    const lower = name.toLowerCase();
    if (['connection', 'keep-alive', 'transfer-encoding', 'content-length'].includes(lower)) continue;
    if (lower === 'location') {
      responseHeaders.location = rewriteLocation(value, prefix);
      continue;
    }
    if (lower === 'set-cookie') {
      const values = Array.isArray(value) ? value : [value];
      responseHeaders['set-cookie'] = values.map((header) => rewriteSetCookie(header, prefix, cookieNamespace));
      continue;
    }
    responseHeaders[lower] = value;
  }

  const upstreamBody = Buffer.from(upstream.bodyBase64 ?? '', 'base64');
  const contentType = String(upstream.headers['content-type'] ?? '');
  const rewriter = REWRITE_BODY_TYPES.find(([pattern]) => pattern.test(contentType))?.[1] ?? null;
  response.writeHead(upstream.status, responseHeaders);
  if (!rewriter) {
    response.end(upstreamBody);
    return;
  }
  response.end(rewriter(upstreamBody.toString('utf8'), prefix));
}
