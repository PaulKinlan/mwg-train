/**
 * Transport-level URL rewriting so a site written to be served at "/" works under
 * "/live/<project>/<version>/". The site on disk is never modified; rewriting happens only on
 * bytes in flight, and only where a URL is syntactically unambiguous:
 *
 *   - HTML attributes whose value is an absolute path (href, src, action, formaction, poster,
 *     srcset entries, meta refresh content)
 *   - CSS url(/...)
 *   - JavaScript fetch('/...') / fetch(`...`) and XMLHttpRequest .open("METHOD", "/...")
 *   - the Location response header
 *   - Set-Cookie: names are namespaced and Path is scoped (see proxy.mjs for the why)
 *
 * This is deliberately conservative: a construct outside these patterns is served unrewritten, and
 * the limitation is stated on the evidence page rather than papered over. `<base>` is NOT used: it
 * would not rewrite absolute-path attributes (the corpus uses them) and it changes relative-link
 * resolution, which would make the served copy differ in behaviour from the site at its own root.
 */

const HTML_ATTRS = ['href', 'src', 'action', 'formaction', 'poster'];

export function rewriteHtml(body, prefix) {
  let out = body;
  for (const attr of HTML_ATTRS) {
    // attr="/path" or attr='/path' - but not attr="//host" (protocol-relative).
    const pattern = new RegExp(`(${attr}\\s*=\\s*)(["'])(\\/(?!\\/)[^"']*)\\2`, 'gi');
    out = out.replace(pattern, (_match, name, quote, path) => `${name}${quote}${prefix}${path}${quote}`);
  }
  // srcset="/a.png 1x, /b.png 2x" - each comma entry may carry an absolute path.
  out = out.replace(/(srcset\s*=\s*)(["'])([^"']*)\2/gi, (_match, name, quote, list) => {
    const rewritten = list
      .split(',')
      .map((entry) => {
        const parts = entry.trim().split(/\s+/);
        if (parts[0]?.startsWith('/') && !parts[0].startsWith('//')) parts[0] = `${prefix}${parts[0]}`;
        return parts.join(' ');
      })
      .join(', ');
    return `${name}${quote}${rewritten}${quote}`;
  });
  // <meta http-equiv="refresh" content="5; url=/path">
  out = out.replace(/(content\s*=\s*)(["'])(\s*\d+\s*;\s*url\s*=\s*)(\/(?!\/)[^"']*)\2/gi, (_match, name, quote, head, path) => `${name}${quote}${head}${prefix}${path}${quote}`);
  return out;
}

export function rewriteCss(body, prefix) {
  return body.replace(/url\(\s*(["']?)(\/(?!\/)[^"')]*)\1\s*\)/gi, (_match, quote, path) => `url(${quote}${prefix}${path}${quote})`);
}

export function rewriteJs(body, prefix) {
  let out = body;
  // fetch('/path'), fetch("/path"), fetch(`/path`)
  out = out.replace(/(\bfetch\s*\(\s*)(['"`])(\/(?!\/)[^'"`]*?)\2/g, (_match, call, quote, path) => `${call}${quote}${prefix}${path}${quote}`);
  // xhr.open('GET', '/path')
  out = out.replace(/(\.open\s*\(\s*['"][A-Z]+['"]\s*,\s*)(['"`])(\/(?!\/)[^'"`]*?)\2/g, (_match, call, quote, path) => `${call}${quote}${prefix}${path}${quote}`);
  // location.assign('/path') / location.replace('/path')
  out = out.replace(/(\blocation\.(?:assign|replace)\s*\(\s*)(['"`])(\/(?!\/)[^'"`]*?)\2/g, (_match, call, quote, path) => `${call}${quote}${prefix}${path}${quote}`);
  return out;
}

/** Location: /booking/XYZ -> Location: /live/<id>/<version>/booking/XYZ. Protocol-relative and absolute URLs are left alone. */
export function rewriteLocation(value, prefix) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return `${prefix}${value}`;
  return value;
}

/**
 * Namespace a Set-Cookie header: the name is prefixed so the cookie can never collide with (or
 * shadow) the viewer origin's or another site's cookies on this shared host, and the Path is
 * scoped under the site's subpath. Domain is dropped (a served site must not set host-wide
 * cookies). The cookie's value and attributes are otherwise untouched - synthetic demo sessions
 * are a wanted feature and keep working.
 */
export function rewriteSetCookie(header, prefix, namespace) {
  if (typeof header !== 'string') return header;
  const parts = header.split(';').map((part) => part.trim());
  const [nameValue, ...attrs] = parts;
  const equals = nameValue.indexOf('=');
  if (equals === -1) return header;
  const name = nameValue.slice(0, equals);
  const value = nameValue.slice(equals + 1);
  const rewritten = [`${namespace}${name}=${value}`];
  let hasPath = false;
  for (const attr of attrs) {
    const [attrName] = attr.split('=');
    const lower = attrName.trim().toLowerCase();
    if (lower === 'domain') continue;
    if (lower === 'path') {
      hasPath = true;
      rewritten.push(`Path=${prefix}/`);
      continue;
    }
    rewritten.push(attr);
  }
  if (!hasPath) rewritten.push(`Path=${prefix}/`);
  return rewritten.join('; ');
}

/** Strip the viewer's cookie namespace back off on the way in; returns the site's own cookie header or null. */
export function restoreCookieNamespace(cookieHeader, namespace) {
  if (typeof cookieHeader !== 'string') return null;
  const restored = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(namespace))
    .map((part) => part.slice(namespace.length));
  return restored.length > 0 ? restored.join('; ') : null;
}
