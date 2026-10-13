import assert from 'node:assert/strict';
import test from 'node:test';

import { REDACTED, isSensitiveParamName, redactSecretsInText, sanitizeUrlForLog } from '../src/capture/log.mjs';

test('a logged URL keeps its origin and path and loses its credentials', () => {
  // mwg-train-s7iu. What a reader needs is what was captured, which is the origin and the path; what must not survive
  // into a CI log is everything a URL can carry a secret in.
  assert.equal(sanitizeUrlForLog('https://user:s3cret@example.com/a/b?q=hello'), 'https://example.com/a/b?q=hello');
  assert.ok(!sanitizeUrlForLog('https://user:s3cret@example.com/a').includes('s3cret'));
  assert.equal(sanitizeUrlForLog('https://user:s3cret@example.com/'), 'https://example.com/');

  assert.equal(sanitizeUrlForLog('https://example.com/a?token=abc123'), `https://example.com/a?token=${REDACTED}`);
  assert.equal(sanitizeUrlForLog('https://example.com/a?api_key=abc&X-Amz-Signature=deadbeef'), `https://example.com/a?api_key=${REDACTED}&X-Amz-Signature=${REDACTED}`);
  assert.equal(sanitizeUrlForLog('https://example.com/a?access_token=abc'),
    `https://example.com/a?access_token=${REDACTED}`);
  assert.equal(sanitizeUrlForLog('https://example.com/a?password=hunter2'), `https://example.com/a?password=${REDACTED}`);

  // The parameter's name survives, because the shape of the URL is what makes the line useful when a capture is
  // being debugged; only the value goes.
  assert.ok(sanitizeUrlForLog('https://example.com/a?token=abc').includes('token='));
});

test('redaction is on the parameter name, so an ordinary word containing a credential word survives', () => {
  // The line between "redact everything" and "redact nothing" is drawn on separators: `keyword` is a search term,
  // `api_key` is a credential. Getting this wrong in the safe direction costs a reader a moment; getting it wrong in
  // the other direction leaks.
  assert.equal(isSensitiveParamName('keyword'), false);
  assert.equal(isSensitiveParamName('token'), true);
  assert.equal(isSensitiveParamName('access_token'), true);
  assert.equal(isSensitiveParamName('API-KEY'), true);
  assert.equal(isSensitiveParamName('code'), true);
  assert.equal(sanitizeUrlForLog('https://example.com/s?keyword=shoes&token=abc'),
    `https://example.com/s?keyword=shoes&token=${REDACTED}`);
});

test('a fragment that mentions a credential is dropped whole, because a fragment is not a query string', () => {
  // The OAuth implicit flow puts the token in the fragment, and a fragment can also be a route, so the grammar is not
  // predictable enough to redact one part of it. A fragment is not needed to identify the page.
  assert.equal(sanitizeUrlForLog('https://example.com/cb#access_token=abc&state=x'), 'https://example.com/cb#REDACTED');
  assert.ok(!sanitizeUrlForLog('https://example.com/cb#access_token=abc').includes('abc'));
  assert.equal(sanitizeUrlForLog('https://example.com/docs#installation'), 'https://example.com/docs#installation');
});

test('text that contains a URL is redacted, because error messages quote the URL they refused', () => {
  // The browser layer's navigation errors and this project's own target refusals both interpolate the URL at issue.
  assert.equal(
    redactSecretsInText('navigation to https://user:pw@example.com/a did not complete'),
    `navigation to https://${REDACTED}@example.com/a did not complete`,
  );
  assert.ok(!redactSecretsInText('Error: refused http://example.com/x?token=abc123').includes('abc123'));
  assert.equal(redactSecretsInText("got 'http://example.com/a b'"), "got 'http://example.com/a b'");
  // A relative path is not a parseable URL on its own, and a query-bearing one still loses its credential.
  assert.equal(sanitizeUrlForLog('/reset?token=abc'), `/reset?token=${REDACTED}`);
  // Nothing in, nothing out, and nothing thrown.
  assert.equal(sanitizeUrlForLog(''), '');
  assert.equal(sanitizeUrlForLog(undefined), '');
  assert.equal(redactSecretsInText(null), '');
});
