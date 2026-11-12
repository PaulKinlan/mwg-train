/** Unit tests for the in-flight rewriting that lets a root-written site live under a subpath. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

import {
  allowInlineScriptHash,
  cookieNamespaceShimHash,
  cookieNamespaceShimSource,
  installCookieNamespace,
  rewriteCss,
  rewriteHtml,
  rewriteJs,
  rewriteLocation,
  rewriteSetCookie,
  restoreCookieNamespace,
} from '../src/viewer/rewrite.mjs';

const PREFIX = '/live/demo/original';
const NS = '__vw_demo_original_';

/** The inline script text a served page carries, so the shim can be executed rather than pattern-matched. */
const injectedShim = (html) => {
  const match = /<script data-viewer-cookie-namespace>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, 'the served page carries no document.cookie shim');
  return match[1];
};

/**
 * A document shaped like a browser's: the cookie accessor lives on the prototype, not on the
 * instance, and the native setter parses "name=value; attributes" into a flat store the way a
 * browser does. Every entry is a UTF-8 cookie header line, which is what the browser would send.
 */
function fakeDocument(initial = []) {
  const store = [...initial];
  const prototype = {
    get cookie() {
      return store.join('; ');
    },
    set cookie(value) {
      const [pair] = String(value).split(';');
      const equals = pair.indexOf('=');
      const name = (equals === -1 ? pair : pair.slice(0, equals)).trim();
      if (!name) return;
      const entry = equals === -1 ? `${name}=` : `${name}=${pair.slice(equals + 1).trim()}`;
      const existing = store.findIndex((line) => line.startsWith(`${name}=`));
      if (existing === -1) store.push(entry);
      else store[existing] = entry;
    },
  };
  // `prototype` is exposed because that is where the native accessor lives: a test that reaches for
  // the descriptor there is asking the same question site script would ask.
  return { document: Object.create(prototype), store, prototype };
}

test('html: absolute-path attributes are prefixed', () => {
  const input = '<form action="/book"><link href="/app/styles.css"><img src="/img/logo.png"><a href="/next">x</a>';
  const out = rewriteHtml(input, PREFIX);
  assert.match(out, /action="\/live\/demo\/original\/book"/);
  assert.match(out, /href="\/live\/demo\/original\/app\/styles\.css"/);
  assert.match(out, /src="\/live\/demo\/original\/img\/logo\.png"/);
  assert.match(out, /href="\/live\/demo\/original\/next"/);
});

test('html: protocol-relative, absolute-url, fragment and relative values are untouched', () => {
  const input = '<a href="//cdn.example.com/x">c</a><a href="https://example.com/y">d</a><a href="#frag">e</a><a href="relative/page">f</a>';
  assert.equal(rewriteHtml(input, PREFIX), input);
});

test('html: srcset entries are prefixed per candidate', () => {
  const input = '<img srcset="/img/a.png 1x, /img/b.png 2x">';
  const out = rewriteHtml(input, PREFIX);
  assert.match(out, /\/live\/demo\/original\/img\/a\.png 1x, \/live\/demo\/original\/img\/b\.png 2x/);
});

test('html: meta refresh url is prefixed', () => {
  const input = '<meta http-equiv="refresh" content="5; url=/done">';
  assert.match(rewriteHtml(input, PREFIX), /url=\/live\/demo\/original\/done/);
});

test('js: fetch with absolute path is prefixed in all quote styles', () => {
  assert.match(rewriteJs("fetch('/api/data')", PREFIX), /fetch\('\/live\/demo\/original\/api\/data'\)/);
  assert.match(rewriteJs('fetch("/api/data")', PREFIX), /fetch\("\/live\/demo\/original\/api\/data"\)/);
  assert.match(rewriteJs('fetch(`/api/record/${ref}`)', PREFIX), /fetch\(`\/live\/demo\/original\/api\/record\/\$\{ref\}`\)/);
});

test('js: fetch with full url or relative path is untouched', () => {
  assert.equal(rewriteJs("fetch('https://api.example.com/x')", PREFIX), "fetch('https://api.example.com/x')");
  assert.equal(rewriteJs("fetch('api/relative')", PREFIX), "fetch('api/relative')");
  assert.equal(rewriteJs("fetch('//cdn.example.com/x')", PREFIX), "fetch('//cdn.example.com/x')");
});

test('js: xhr open and location.assign are prefixed', () => {
  assert.match(rewriteJs('x.open("POST", "/submit")', PREFIX), /x\.open\("POST", "\/live\/demo\/original\/submit"\)/);
  assert.match(rewriteJs("location.assign('/next')", PREFIX), /location\.assign\('\/live\/demo\/original\/next'\)/);
});

test('css: url() with absolute path is prefixed', () => {
  assert.match(rewriteCss('body { background: url(/img/bg.png); }', PREFIX), /url\(\/live\/demo\/original\/img\/bg\.png\)/);
  assert.match(rewriteCss("a { background: url('/i/x.png'); }", PREFIX), /url\('\/live\/demo\/original\/i\/x\.png'\)/);
  assert.equal(rewriteCss('b { background: url(https://cdn.example.com/x.png); }', PREFIX), 'b { background: url(https://cdn.example.com/x.png); }');
});

test('location header: absolute path prefixed, absolute url untouched', () => {
  assert.equal(rewriteLocation('/booking/ABC', PREFIX), '/live/demo/original/booking/ABC');
  assert.equal(rewriteLocation('https://example.com/x', PREFIX), 'https://example.com/x');
  assert.equal(rewriteLocation('//cdn.example.com/x', PREFIX), '//cdn.example.com/x');
});

test('set-cookie: name is namespaced, path scoped, domain dropped', () => {
  const out = rewriteSetCookie('session=abc; Path=/; Domain=.example.com; HttpOnly', PREFIX, '__vw_demo_original_');
  assert.match(out, /^__vw_demo_original_session=abc/);
  assert.match(out, /Path=\/live\/demo\/original\//);
  assert.doesNotMatch(out, /Domain=/i);
  assert.match(out, /HttpOnly/);
});

test('cookie namespace round-trips: only namespaced cookies are restored for the site', () => {
  const inbound = '__vw_demo_original_session=abc; exe_auth=OWNER-SECRET; __vw_demo_original_theme=dark';
  const restored = restoreCookieNamespace(inbound, '__vw_demo_original_');
  assert.equal(restored, 'session=abc; theme=dark');
  assert.equal(restoreCookieNamespace('exe_auth=OWNER-SECRET', '__vw_demo_original_'), null);
  assert.equal(restoreCookieNamespace(undefined, '__vw_demo_original_'), null);
});

test('html: a served page carries the document.cookie shim before the page\'s own scripts', () => {
  const page = '<!doctype html><html><head><link rel="stylesheet" href="/app/styles.css"><script src="/app.js"></script></head><body></body></html>';
  const out = rewriteHtml(page, PREFIX, NS);
  const shimAt = out.indexOf('data-viewer-cookie-namespace');
  assert.ok(shimAt !== -1, 'the shim must be injected into served HTML');
  assert.ok(shimAt < out.indexOf('<link rel="stylesheet"'), 'the shim must be the first thing the parser meets in the head');
  assert.ok(out.includes(JSON.stringify(NS)), 'the shim must carry this instance\'s namespace');
  // The URL rewriting the same pass performs is unaffected by the injection.
  assert.match(out, /href="\/live\/demo\/original\/app\/styles\.css"/);
});

test('html: a page with no head still gets the shim, and no namespace means no shim', () => {
  assert.ok(rewriteHtml('<p>no head</p>', PREFIX, NS).startsWith('<script data-viewer-cookie-namespace>'));
  assert.equal(rewriteHtml('<p>no head</p>', PREFIX).includes('data-viewer-cookie-namespace'), false);
});

test('html: a doctype page with no head keeps the doctype first and the shim ahead of its scripts', () => {
  const page = '<!doctype html><title>Booking</title><script src="/app.js"></script><p>hello</p>';
  const out = rewriteHtml(page, PREFIX, NS);
  // A byte before the doctype is what drops the browser into quirks mode, so the served copy would
  // lay out differently from the site at its own root.
  assert.ok(out.startsWith('<!doctype html>'), `the doctype must stay the document's first token, got ${JSON.stringify(out.slice(0, 40))}`);
  const shimAt = out.indexOf('<script data-viewer-cookie-namespace>');
  assert.equal(shimAt, '<!doctype html>'.length, 'the shim goes straight after the doctype, never in front of it');
  assert.ok(shimAt < out.indexOf('<script src='), 'the shim still runs before the page\'s own scripts');
});

test('html: a page with <html> but no doctype gets the shim just inside <html>', () => {
  const out = rewriteHtml('<html lang="en"><p>no head</p></html>', PREFIX, NS);
  assert.ok(out.startsWith('<html lang="en"><script data-viewer-cookie-namespace>'), 'the shim must not be placed before <html>');
  assert.ok(out.endsWith('</html>'));
});

test('html: a namespace that is not a cookie-name token is refused rather than emitted', () => {
  assert.throws(() => rewriteHtml('<head></head>', PREFIX, 'bad;namespace'), TypeError);
  assert.throws(() => rewriteHtml('<head></head>', PREFIX, '__vw__</script>'), TypeError);
});

test('the injected shim prefixes writes and hides every foreign cookie from site script', () => {
  const { document, store } = fakeDocument(['exe_auth=OWNER-SECRET', '__vw_other_original_theme=dark']);
  runInNewContext(injectedShim(rewriteHtml('<html><head></head></html>', PREFIX, NS)), { document });

  // A write reaches the browser's store namespaced, so it cannot collide with another instance's.
  document.cookie = 'session=abc; Path=/; SameSite=Lax';
  assert.deepEqual(store.slice(2), [`${NS}session=abc`]);

  // A read returns this instance's cookies under their own names, and nothing else.
  assert.equal(document.cookie, 'session=abc');

  // A second instance's shim on the same origin sees only its own cookie too.
  const other = fakeDocument([...store, `${NS}theme=light`]);
  runInNewContext(injectedShim(rewriteHtml('<head></head>', PREFIX, '__vw_other_original_')), { document: other.document });
  assert.equal(other.document.cookie, 'theme=dark');

  // The round trip a request performs: what the browser sends back is what the site's own server
  // sees, under the site's own cookie name.
  assert.equal(restoreCookieNamespace(store.join('; '), NS), 'session=abc');
});

test('the injected shim keeps cookie attributes and handles a bare name', () => {
  const { document, store } = fakeDocument();
  runInNewContext(injectedShim(rewriteHtml('<head></head>', PREFIX, NS)), { document });
  document.cookie = 'flag';
  document.cookie = 'session=second';
  assert.deepEqual(store, [`${NS}flag=`, `${NS}session=second`]);
  assert.equal(document.cookie, 'flag=; session=second');
});

test('installCookieNamespace reports a document with no cookie accessor instead of throwing', () => {
  assert.equal(installCookieNamespace(NS, {}), false);
  assert.equal(installCookieNamespace(NS, null), false);
  assert.equal(installCookieNamespace('', {}), false);
});

test('the prototype accessor cannot be called directly to bypass the namespace', () => {
  const { document, store, prototype } = fakeDocument(['exe_auth=OWNER-SECRET', '__vw_other_original_theme=dark', `${NS}session=abc`]);
  runInNewContext(injectedShim(rewriteHtml('<html><head></head></html>', PREFIX, NS)), { document });

  // The wrapper replaces the accessor where it lives, so the document itself owns no cookie
  // property and there is no deeper descriptor left for site script to call instead.
  assert.equal(Object.getOwnPropertyDescriptor(document, 'cookie'), undefined);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'cookie');
  assert.equal(typeof descriptor.get, 'function');
  assert.equal(typeof descriptor.set, 'function');

  // get.call(document) is the exact bypass: it invokes the accessor the prototype exposes. It now
  // reads through the namespace, so the owner's cookie and another instance's stay hidden.
  assert.equal(descriptor.get.call(document), 'session=abc');

  // The same for the setter: a write through it is namespaced, not written to the shared origin.
  descriptor.set.call(document, 'injected=1; Path=/');
  assert.deepEqual(store, ['exe_auth=OWNER-SECRET', '__vw_other_original_theme=dark', `${NS}session=abc`, `${NS}injected=1`]);
  assert.equal(document.cookie, 'session=abc; injected=1');
});

test('the CSP hash covers the exact injected script text', () => {
  const hash = cookieNamespaceShimHash(NS);
  const expected = `'sha256-${createHash('sha256').update(cookieNamespaceShimSource(NS)).digest('base64')}'`;
  assert.equal(hash, expected);
  assert.match(hash, /^'sha256-[A-Za-z0-9+/]{43}='$/);
  assert.ok(cookieNamespaceShimSource(NS).includes(JSON.stringify(NS)));
});

test('a response-header CSP admits the shim by hash, never by unsafe-inline', () => {
  const hash = cookieNamespaceShimHash(NS);
  assert.equal(
    allowInlineScriptHash("default-src 'none'; script-src 'self'; img-src 'self'", hash),
    `default-src 'none'; script-src 'self' ${hash}; img-src 'self';`,
  );
  // No script-src: the hash goes on default-src, which is what governs script elements then.
  assert.equal(allowInlineScriptHash("default-src 'self'", hash), `default-src 'self' ${hash};`);
  // script-src-elem overrides script-src for a <script> element.
  assert.equal(
    allowInlineScriptHash("script-src 'none'; script-src-elem 'self'", hash),
    `script-src 'none'; script-src-elem 'self' ${hash};`,
  );
  // A policy that does not restrict script elements is left exactly as the site wrote it.
  assert.equal(allowInlineScriptHash("img-src 'self'", hash), "img-src 'self'");
  assert.equal(allowInlineScriptHash(undefined, hash), undefined);
  // Idempotent: a repeated pass cannot grow the header.
  const once = allowInlineScriptHash("script-src 'self'", hash);
  assert.equal(allowInlineScriptHash(once, hash), once);
});

test('every policy in a comma-joined CSP value receives the hash', () => {
  const hash = cookieNamespaceShimHash(NS);
  // Two Content-Security-Policy headers arrive from HTTP as one comma-joined value; the second
  // policy's "script-src 'none'" still applies, so a hash on only the first would still block the
  // shim. Each policy is rewritten on its own.
  assert.equal(
    allowInlineScriptHash("script-src 'none', script-src 'none'", hash),
    `script-src 'none' ${hash};, script-src 'none' ${hash};`,
  );
  // Mixed shapes: a default-src fallback policy next to one that names script-src, and a policy
  // that does not restrict script elements at all is left exactly as the site wrote it.
  assert.equal(
    allowInlineScriptHash("default-src 'self', script-src 'self' 'nonce-abc', img-src 'self'", hash),
    `default-src 'self' ${hash};, script-src 'self' 'nonce-abc' ${hash};, img-src 'self'`,
  );
  // Nothing to admit: no policy names a script directive, so the value is returned unchanged.
  assert.equal(allowInlineScriptHash("img-src 'self', img-src 'none'", hash), "img-src 'self', img-src 'none'");
  // Idempotent across policies: a repeated pass adds nothing.
  const once = allowInlineScriptHash("script-src 'none', script-src 'none'", hash);
  assert.equal(allowInlineScriptHash(once, hash), once);
});
