/**
 * Logging a captured URL must not put a credential into a CI log (mwg-train-s7iu).
 *
 * A capture tool exists to accept arbitrary third-party URLs, and URLs carry secrets in three places: userinfo
 * (`https://user:pass@host/`), query parameters (`?token=`, `?X-Amz-Signature=`, `?apiKey=`) and fragments
 * (`#access_token=`). Whatever is printed to stdout or stderr on a CI runner is readable by anyone who can read the
 * job, and stays in the log after the run, so the URL is the last thing that should be echoed verbatim.
 *
 * The first version of this module enumerated credential-shaped parameter NAMES and redacted their values. That was
 * the defect, not a detail of it: the enumeration missed `apiKey`, `accessToken` and `AWSAccessKeyId` (mwg-train-34ms),
 * and it would have missed every other spelling - a camelCase one, an all-caps one, a vendor's own name. A list of
 * what to redact can only ever hold what its author thought of, so this module now fails closed instead: EVERY query
 * parameter's value is redacted, and every fragment is dropped, whether or not the name looks like a credential.
 *
 * What survives is the origin and the path: `https://user:pw@example.com/a/b?apiKey=secret#tok=x` logs as
 * `https://example.com/a/b#REDACTED`. The query is dropped rather than redacted value by value, because a NAME can be
 * the secret (`?SK_live_...=1` and `?SK_live_...` both printed it, found by probing the shapes rather than reasoning
 * about them), and a query carries nothing a capture log needs. A fragment is marked rather than shown.
 *
 * `redactSecretsInText` is for text that CONTAINS a URL rather than being one: error messages from the browser layer
 * and from this project's own refusals both interpolate the URL, and a refusal that quotes the URL it refused should
 * not be the thing that leaks it. It applies the same fail-closed rule to any URL it finds - userinfo out, the whole
 * query replaced - and to any loose `?name=value` run outside a scheme URL, whatever the name is.
 *
 * There is deliberately NO list of credential-shaped names anywhere in this module any more. It had one twice: first
 * as the URL rule (mwg-train-34ms: it missed `apiKey`, `accessToken`, `AWSAccessKeyId`), then only in the text path
 * (mwg-train-6rvi: a rejected URL with whitespace in its host does not parse, so it fell to that path and a vendor
 * parameter like `?myOwnThing=` was printed with its value). Both are the same defect - a list can only hold what its
 * author thought of - so the second fix deletes the mechanism rather than narrowing its reach.
 *
 * Stated as limits rather than presented as a guarantee, because the point of the rewrite is that a guarantee this
 * code cannot give is worse than a limit it states:
 *   - A secret carried in a PATH segment (`/reset/abc123`) is not redacted. The path is what makes a log line useful
 *     and the finding accepts origin+path; redacting it would trade a leak this code cannot detect for a log nobody
 *     can act on.
 *   - The query is not logged at all, so an operator cannot see which parameters a URL carried. That is the accepted
 *     cost of the rule above, and it is the only residual besides the path.
 *   - Text redaction is heuristic about where a URL ends inside prose. It over-redacts rather than under-redacts,
 *     because a redacted log line costs a reader a moment and a leaked secret costs them a lot. A message that
 *     mentions `?step=2` loses the `2`; that is the price of the rule above, and it is worth paying.
 */

/** The value substituted for every redacted part. Exported so callers and tests can name it once. */
export const REDACTED = 'REDACTED';

/**
 * A URL with every query parameter value redacted, every fragment dropped and userinfo removed. Names are kept, so
 * the shape of the URL is still legible; values never are, whether or not their name looks like a credential.
 */
export function sanitizeUrlForLog(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    // Not a parseable URL: a typo the CLI is reporting, or a relative path. Redact what the text contains instead of
    // refusing to print it, because the reason this is being logged is usually that a human has to fix it.
    return redactSecretsInText(text);
  }
  // The query is dropped ENTIRELY, not redacted name by name. Keeping names looked harmless and is not: a parameter
  // whose NAME is the credential (`?SK_live_...=1`) prints it, a valueless one (`?SK_live_...`) prints it too, and a
  // probe of 17 adversarial shapes found both. Dropping the query leaves one residual - a secret in the path - where
  // keeping names left two, and nothing in a query can leak by any spelling including ones nobody thought of.
  // parsed.origin carries no userinfo, so `https://user:pass@host/x` becomes `https://host/x`.
  return `${parsed.origin}${parsed.pathname}${parsed.hash ? `#${REDACTED}` : ''}`;
}

/**
 * Text that may contain URLs, with userinfo and query strings redacted. Used for error messages, whose authors are
 * the browser layer or this project's own refusals and which routinely quote the URL at issue.
 */
export function redactSecretsInText(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text
    // Any scheme://user:pass@ run, wherever it appears in the message.
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/\s@]*@/g, `$1${REDACTED}@`)
    // The whole query of any URL the message contains: fail closed, as above.
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"<>()]*?)\?[^\s'"<>()]*/g, `$1?${REDACTED}`)
    // Any loose query or fragment run outside a scheme URL, collapsed to the marker with no name kept: a relative path
    // in a refusal, a rejected input that did not parse as a URL, a query the rule above could not reach because the
    // string it was embedded in was not URL-shaped. Dropping the name too is deliberate - a name can be the secret.
    // The run stops at characters that end a URL inside prose - brackets, quotes, commas, semicolons - so a message
    // like `(now at http://h/p?x=1)` does not lose its closing bracket to the redaction.
    .replace(/([?&#])[^\s'"<>()\[\],;]*/g, `$1${REDACTED}`);
}
