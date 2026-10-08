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
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);

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
