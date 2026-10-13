import assert from 'node:assert/strict';
import test from 'node:test';

import { REDACTED, redactSecretsInText, sanitizeUrlForLog } from '../src/capture/log.mjs';

test('a logged URL keeps its origin, path and parameter names, and loses every value', () => {
  // mwg-train-s7iu, revised for mwg-train-34ms. The rule is fail-closed: the enumeration of credential-shaped names
  // this test used to assert on missed camelCase spellings, and any such list can only hold what its author thought
  // of. Every value is redacted now, and names survive because they are what tells an operator which parameters the
  // URL carried.
  // The query is dropped entirely now, so nothing in it can leak by any spelling - including a secret used as a
  // parameter NAME, which keeping names had printed.
  assert.equal(sanitizeUrlForLog('https://user:s3cret@example.com/a/b?q=hello'), 'https://example.com/a/b');
  assert.ok(!sanitizeUrlForLog('https://user:s3cret@example.com/a').includes('s3cret'));

  // Every spelling is gone at once, rather than one rule covering the three the first finding named.
  for (const query of ['?apiKey=abc123', '?accessToken=abc123', '?AWSAccessKeyId=abc123', '?myOwnThing=abc123&sessionId=xyz', '?page=2&lang=en', '?SK_live_SECRET=1', '?SK_live_SECRET']) {
    const logged = sanitizeUrlForLog(`https://example.com/a${query}`);
    assert.equal(logged, 'https://example.com/a', `${query} must leave nothing behind`);
    assert.ok(!logged.includes('abc123') && !logged.includes('xyz') && !logged.includes('SK_live_SECRET'));
  }
});

test('a fragment is dropped whole, because a fragment is not a query string', () => {
  // The OAuth implicit flow puts the token in the fragment, and a fragment can also be a route, so its grammar is not
  // predictable enough to edit one part of it.
  assert.equal(sanitizeUrlForLog('https://example.com/cb#access_token=abc&state=x'), `https://example.com/cb#${REDACTED}`);
  assert.ok(!sanitizeUrlForLog('https://example.com/cb#access_token=abc').includes('abc'));
  assert.equal(sanitizeUrlForLog('https://example.com/docs#installation'), `https://example.com/docs#${REDACTED}`);
});

test('text that contains a URL is redacted, because error messages quote the URL they refused', () => {
  // The browser layer's navigation errors and this project's own target refusals both interpolate the URL at issue.
  assert.equal(
    redactSecretsInText('navigation to https://user:pw@example.com/a did not complete'),
    `navigation to https://${REDACTED}@example.com/a did not complete`,
  );
  assert.equal(redactSecretsInText('did not complete (now at http://127.0.0.1:8080/private?apiKey=abc)'),
    `did not complete (now at http://127.0.0.1:8080/private?${REDACTED})`);
  assert.ok(!redactSecretsInText('Error: refused http://example.com/x?token=abc123').includes('abc123'));
  // A relative path is not a parseable URL on its own, and a credential-shaped pair in it still loses its value.
  assert.equal(sanitizeUrlForLog('/reset?token=abc'), `/reset?${REDACTED}`);
  // Prose that is not a URL is left alone.
  assert.equal(redactSecretsInText("got 'http://example.com/a b'"), "got 'http://example.com/a b'");
  // Nothing in, nothing out, and nothing thrown.
  assert.equal(sanitizeUrlForLog(''), '');
  assert.equal(sanitizeUrlForLog(undefined), '');
  assert.equal(redactSecretsInText(null), '');
});

test('text that does not parse as a URL still loses every parameter value, whatever the name is', () => {
  // mwg-train-6rvi. This is the case that made the name list untenable: a rejected input with whitespace in its host
  // does not parse, so it takes the text path, and there the old rule consulted a list of credential-looking names.
  // `myOwnThing` was not on it, so the value was printed intact. Two shapes are covered - a string that fails to
  // parse, and one where the query sits outside what the scheme-URL rule can reach.
  assert.equal(sanitizeUrlForLog('http://exa mple.com/a?myOwnThing=SK_live_SECRET'), `http://exa mple.com/a?${REDACTED}`);
  assert.equal(sanitizeUrlForLog('not a url?myOwnThing=SK_live_SECRET'), `not a url?${REDACTED}`);
  assert.ok(!sanitizeUrlForLog('http://exa mple.com/a?f9a2b=SK_live_SECRET').includes('SK_live_SECRET'));
  // A relative path with a query, which is what a page path or a form action looks like inside the warnings.
  // Names go too, because a name can be the secret: `?SK_live_...` printed it whether or not it had a value.
  assert.equal(redactSecretsInText('Dropped control at /checkout?step=2'), `Dropped control at /checkout?${REDACTED}`);
  assert.equal(redactSecretsInText('action: /submit?f9a2b=opaque'), `action: /submit?${REDACTED}`);
  assert.equal(redactSecretsInText('page?x=1'), `page?${REDACTED}`);
  assert.equal(redactSecretsInText('a?SK_live_SECRET'), `a?${REDACTED}`);
});

test('no value survives in any of the shapes that carry one, whatever its name', () => {
  // The adversarial list, as a regression test rather than a one-off run: every shape here carried the sentinel in a
  // spelling the two earlier name lists missed, and in this form none of them can. The path is excluded because it is
  // the module's single stated residual, and asserting a leak as expected behaviour would freeze it rather than
  // record it.
  const sentinel = 'SK_live_PROBE123';
  const shapes = [
    `https://user:${sentinel}@h.test/p`,
    `https://h.test/p?k=${sentinel}`,
    `https://h.test/p?apiKey=${sentinel}`,
    `https://h.test/p?AWSAccessKeyId=${sentinel}`,
    `https://h.test/p?${sentinel}`,
    `https://h.test/p?${sentinel}=1`,
    `https://h.test/p?a=1;b=${sentinel}`,
    `https://h.test/p?a=${sentinel}=x`,
    `https://h.test/p?a=${sentinel}&a=${sentinel}`,
    `https://h.test/p#${sentinel}`,
    `https://h.test/p#tok=${sentinel}`,
  ];
  for (const url of shapes) {
    const logged = sanitizeUrlForLog(url);
    assert.ok(!logged.includes(sentinel), `${url} leaked: ${logged}`);
  }
  const prose = [
    `did not complete (now at https://h.test/p?k=${sentinel})`,
    `got 'http://exa mple.test/a?k=${sentinel}'`,
    `Dropped control at /checkout?k=${sentinel}`,
    `something ?k=${sentinel} here`,
  ];
  for (const message of prose) {
    assert.ok(!redactSecretsInText(message).includes(sentinel), `${message} leaked`);
  }
  // The path is the one residual, asserted here so the limit is visible in the suite rather than only in the module
  // comment: if a future change redacts paths too, this assertion should be deleted deliberately, not discovered.
  assert.ok(sanitizeUrlForLog(`https://h.test/${sentinel}/p`).includes(sentinel));
});
