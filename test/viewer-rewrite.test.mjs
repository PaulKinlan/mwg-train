/** Unit tests for the in-flight rewriting that lets a root-written site live under a subpath. */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rewriteCss,
  rewriteHtml,
  rewriteJs,
  rewriteLocation,
  rewriteSetCookie,
  restoreCookieNamespace,
} from '../src/viewer/rewrite.mjs';

const PREFIX = '/live/demo/original';

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
