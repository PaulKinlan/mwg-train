// CORS is a browser permission for the separate live origin, never an isolation boundary.
// Do not reflect arbitrary *.exe.xyz origins: credentialed CORS would let another tenant read
// live-site cookies and responses. The public viewer host must be explicitly configured here.
const REQUEST_HEADERS = new Set(['content-type', 'accept', 'accept-language', 'if-modified-since', 'if-none-match', 'range']);
const REQUEST_METHODS = new Set(['GET', 'POST']);

export function viewerOrigins({ viewerPort = 7700, publicViewerOrigin = 'https://mwg-train.exe.xyz:7700' } = {}) {
  const configured = new URL(publicViewerOrigin);
  if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password ||
      configured.pathname !== '/' || configured.search || configured.hash) throw new Error('invalid public viewer origin');
  return new Set([
    `http://127.0.0.1:${viewerPort}`,
    `http://localhost:${viewerPort}`,
    configured.origin,
    // The same explicitly configured hostname may be reached through exe.dev's default TLS port.
    ...(configured.protocol === 'https:' ? [`https://${configured.hostname}`] : []),
  ]);
}

/** Apply only to /live; reject unauthorized preflight before it can spawn a sandbox. */
export function liveCors(request, response, origins) {
  const origin = request.headers.origin;
  response.setHeader('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  response.setHeader('cache-control', 'private, no-store');
  const allowed = typeof origin === 'string' && origins.has(origin);
  if (allowed) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-credentials', 'true');
  }
  if (request.method !== 'OPTIONS') return false;
  const method = request.headers['access-control-request-method'];
  const rawHeaders = request.headers['access-control-request-headers'] ?? '';
  const headers = typeof rawHeaders === 'string' && rawHeaders.trim()
    ? rawHeaders.split(',').map((name) => name.trim().toLowerCase())
    : [];
  if (!allowed || !REQUEST_METHODS.has(method) ||
      headers.some((name) => !REQUEST_HEADERS.has(name))) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('preflight denied');
    return true;
  }
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'Content-Type, Accept, Accept-Language, If-Modified-Since, If-None-Match, Range');
  response.writeHead(204);
  response.end();
  return true;
}
