import assert from 'node:assert/strict';
import test from 'node:test';

import { REDACTED, looksLikeCredentialParam, redactSecretsInText, sanitizeUrlForLog } from '../src/capture/log.mjs';

test('a logged URL keeps its origin, path and parameter names, and loses every value', () => {
  // mwg-train-s7iu, revised for mwg-train-34ms. The rule is fail-closed: the enumeration of credential-shaped names
  // this test used to assert on missed camelCase spellings, and any such list can only hold what its author thought
  // of. Every value is redacted now, and names survive because they are what tells an operator which parameters the
  // URL carried.
  assert.equal(sanitizeUrlForLog('https://user:s3cret@example.com/a/b?q=hello'),
    `https://example.com/a/b?q=${REDACTED}`);
  assert.ok(!sanitizeUrlForLog('https://user:s3cret@example.com/a').includes('s3cret'));

  // The three spellings the finding named, which the previous rule let through.
  assert.equal(sanitizeUrlForLog('https://example.com/a?apiKey=abc123'), `https://example.com/a?apiKey=${REDACTED}`);
  assert.equal(sanitizeUrlForLog('https://example.com/a?accessToken=abc123'), `https://example.com/a?accessToken=${REDACTED}`);
  assert.equal(sanitizeUrlForLog('https://example.com/a?AWSAccessKeyId=abc123'), `https://example.com/a?AWSAccessKeyId=${REDACTED}`);
  assert.ok(!sanitizeUrlForLog('https://example.com/a?apiKey=abc123').includes('abc123'));

  // And a name nobody thought of is redacted too, because the rule no longer depends on recognising it. This is the
  // assertion that makes the earlier failure impossible to repeat rather than merely fixed.
  assert.equal(sanitizeUrlForLog('https://example.com/a?myOwnThing=abc123&sessionId=xyz'),
    `https://example.com/a?myOwnThing=${REDACTED}&sessionId=${REDACTED}`);
  assert.equal(sanitizeUrlForLog('https://example.com/a?page=2&lang=en'),
    `https://example.com/a?page=${REDACTED}&lang=${REDACTED}`);
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
  assert.equal(sanitizeUrlForLog('/reset?token=abc'), `/reset?token=${REDACTED}`);
  // Prose that is not a URL is left alone.
  assert.equal(redactSecretsInText("got 'http://example.com/a b'"), "got 'http://example.com/a b'");
  // Nothing in, nothing out, and nothing thrown.
  assert.equal(sanitizeUrlForLog(''), '');
  assert.equal(sanitizeUrlForLog(undefined), '');
  assert.equal(redactSecretsInText(null), '');
});

test('the credential-name test over-redacts on purpose, and is not what protects URLs', () => {
  // This helper survives only for a loose `?name=value` in prose. It matches substrings case-insensitively, so
  // `keyword` counts as credential-shaped here - which is the safe direction for text and irrelevant for URLs, where
  // every value is redacted regardless. Asserted so nobody narrows it back into a URL rule unnoticed.
  assert.equal(looksLikeCredentialParam('keyword'), true);
  assert.equal(looksLikeCredentialParam('apiKey'), true);
  assert.equal(looksLikeCredentialParam('AWSAccessKeyId'), true);
  assert.equal(looksLikeCredentialParam('page'), false);
});
