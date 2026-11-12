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
 *   - document.cookie: an inline shim namespaces what the site's own script writes, and hides every
 *     cookie that is not this instance's (see installCookieNamespace for the why)
 *
 * This is deliberately conservative: a construct outside these patterns is served unrewritten, and
 * the limitation is stated on the evidence page rather than papered over. `<base>` is NOT used: it
 * would not rewrite absolute-path attributes (the corpus uses them) and it changes relative-link
 * resolution, which would make the served copy differ in behaviour from the site at its own root.
 */

import { createHash } from 'node:crypto';

const HTML_ATTRS = ['href', 'src', 'action', 'formaction', 'poster'];

/**
 * A cookie namespace is a cookie-name prefix, so it must be a token: the proxy builds it from
 * route-validated project ids and versions. A namespace outside this shape is refused rather than
 * emitted into a name no browser would store (and rather than inlined into a script unescaped).
 */
const COOKIE_NAMESPACE = /^[A-Za-z0-9_-]+$/;

const requireCookieNamespace = (namespace) => {
  if (typeof namespace !== 'string' || !COOKIE_NAMESPACE.test(namespace)) {
    throw new TypeError(`cookie namespace must be a cookie-name token, got ${JSON.stringify(namespace)}`);
  }
  return namespace;
};

/**
 * @param {string} body
 * @param {string} prefix  the URL prefix this site is served under, e.g. /live/demo/original
 * @param {string} [cookieNamespace] this instance's cookie namespace; its presence is what injects
 *   the document.cookie shim, because a page served under a shared origin needs one and a rewrite
 *   performed for any other purpose does not
 */
export function rewriteHtml(body, prefix, cookieNamespace) {
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
  if (cookieNamespace != null) out = injectCookieNamespaceShim(out, requireCookieNamespace(cookieNamespace));
  return out;
}

/**
 * Install the client-side half of the cookie namespace on a document.
 *
 * rewriteSetCookie namespaces cookies on the response and restoreCookieNamespace strips the
 * namespace on the way in, but neither can see document.cookie: a served site's own script writes
 * straight to the shared viewer origin, where its cookies collide with another instance's and its
 * reads can see the viewer's own cookies (a session cookie is host-scoped, so a different port is
 * not a boundary for them - see README). This closes that gap inside the page: the setter prefixes
 * the name with the instance's namespace - the same one the proxy uses, so a client-set cookie is
 * still restored to the site's server under its own name - and the getter returns only this
 * instance's cookies with the prefix stripped, so another instance's cookies and the viewer's are
 * invisible to site script.
 *
 * The function is serialised into the page with Function#toString (see cookieNamespaceShimSource),
 * so it must not reference anything outside its own body.
 *
 * @returns {boolean} false when the document exposes no cookie accessor to wrap (not a browser, or
 *   a document whose cookie property was already removed)
 */
export function installCookieNamespace(namespace, target = globalThis.document) {
  if (typeof namespace !== 'string' || namespace === '' || !target) return false;
  // The accessor belongs to Document.prototype, not to the document instance, so the wrapper
  // replaces it in whichever object owns it. An own property on the instance would leave the
  // native accessor one prototype step away, and site script can reach it there:
  // Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').get.call(document) reads (and its
  // setter writes) straight past the namespace. Wrapping the owner covers both spellings, because
  // the descriptor site script finds now is this one.
  let holder = target;
  let descriptor = null;
  while (holder && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(holder, 'cookie');
    if (!descriptor) holder = Object.getPrototypeOf(holder);
  }
  if (!descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function') return false;
  const nativeGet = () => descriptor.get.call(target);
  const nativeSet = (value) => descriptor.set.call(target, value);
  try {
    Object.defineProperty(holder, 'cookie', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: () => nativeGet()
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith(namespace))
        .map((part) => part.slice(namespace.length))
        .join('; '),
      set: (value) => {
        const text = String(value ?? '');
        const equals = text.indexOf('=');
        const name = (equals === -1 ? text : text.slice(0, equals)).trim();
        if (!name) return;
        nativeSet(equals === -1 ? `${namespace}${name}=` : `${namespace}${name}${text.slice(equals)}`);
      },
    });
  } catch {
    // A document whose accessor cannot be replaced (a frozen prototype) is left as it was rather
    // than half-wrapped; the caller learns from the result that the shim did not install.
    return false;
  }
  return true;
}

/**
 * The inline script text for one instance's namespace. Separate from its markup so the CSP hash
 * below covers exactly the bytes the browser will hash.
 */
export function cookieNamespaceShimSource(namespace) {
  return `(${installCookieNamespace.toString()})(${JSON.stringify(requireCookieNamespace(namespace))});`;
}

/**
 * The shim as a CSP source expression. A policy the site delivered as a RESPONSE HEADER applies to
 * the whole document and would block the injected script; naming its exact hash admits this script
 * and nothing else (never 'unsafe-inline'). A policy the site wrote in a <meta> tag needs no
 * allowance: the shim is parsed before that tag can install the policy.
 */
export function cookieNamespaceShimHash(namespace) {
  return `'sha256-${createHash('sha256').update(cookieNamespaceShimSource(namespace)).digest('base64')}'`;
}

/**
 * Put the shim at the top of the document's head, so it defines document.cookie before any of the
 * page's own scripts run. A page with no <head> gets it straight after the doctype (or after <html>
 * when the page omits a doctype), which the parser places in the head anyway - injecting at </head>
 * would have missed that page entirely. It is never put in front of the document: a byte before the
 * <!doctype> drops the page into quirks mode, where the served copy would lay out differently from
 * the site at its own root.
 */
function injectCookieNamespaceShim(html, namespace) {
  const script = `<script data-viewer-cookie-namespace>${cookieNamespaceShimSource(namespace)}</script>`;
  const anchor = html.match(/<head(\s[^>]*)?>/i) ?? html.match(/<!doctype[^>]*>|<html(\s[^>]*)?>/i);
  if (!anchor) return `${script}${html}`;
  const at = anchor.index + anchor[0].length;
  return `${html.slice(0, at)}${script}${html.slice(at)}`;
}

/**
 * Add a script hash to a Content-Security-Policy value, for the header case above.
 *
 * One header value can carry several policies: the site may send Content-Security-Policy more than
 * once, and HTTP flattens repeated headers into one comma-separated value (which is what
 * Headers#forEach hands back). Each of those policies is enforced independently, so a hash added to
 * only one of them is still blocked by another policy's "script-src 'none'" - every policy has to
 * name the hash. Commas separate policies in CSP's own grammar, so splitting on a comma is the same
 * reading a browser gives the header.
 *
 * Within a policy: script-src-elem wins over script-src for a <script> element and default-src is
 * the fallback when neither is written; a policy naming none of the three does not restrict script
 * elements, so it is returned untouched. Idempotent, so a repeated call cannot grow the header.
 */
export function allowInlineScriptHash(value, hash) {
  if (typeof value !== 'string' || typeof hash !== 'string') return value;
  let changed = false;
  const policies = value.split(',').map((part) => {
    const policy = part.trim();
    const rewritten = addScriptHashToPolicy(policy, hash);
    if (rewritten !== policy) changed = true;
    return rewritten;
  });
  // Untouched when no policy needed the hash, so a value the site wrote keeps its exact spelling.
  return changed ? policies.join(', ') : value;
}

/** One policy out of a Content-Security-Policy value; see allowInlineScriptHash for the multi-policy case. */
function addScriptHashToPolicy(policy, hash) {
  const directives = policy.split(';').map((directive) => directive.trim()).filter(Boolean);
  const index = ['script-src-elem', 'script-src', 'default-src']
    .map((name) => directives.findIndex((directive) => directive.toLowerCase().split(/\s+/)[0] === name))
    .find((found) => found !== -1);
  if (index === undefined) return policy;
  const [name, ...sources] = directives[index].split(/\s+/);
  if (!sources.includes(hash)) directives[index] = [name, ...sources, hash].join(' ');
  return `${directives.join('; ')};`;
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
