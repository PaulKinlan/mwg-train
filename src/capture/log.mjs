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
 * What survives is what a reader needs to follow the capture and cannot be a secret: the origin, the path, and the
 * NAMES of the parameters. So `https://user:pw@example.com/a/b?apiKey=secret&page=2#tok=x` logs as
 * `https://example.com/a/b?apiKey=REDACTED&page=2#REDACTED` - enough to see what was captured and which parameters
 * were present, with nothing that can be a credential in it.
 *
 * `redactSecretsInText` is for text that CONTAINS a URL rather than being one: error messages from the browser layer
 * and from this project's own refusals both interpolate the URL, and a refusal that quotes the URL it refused should
 * not be the thing that leaks it. It applies the same fail-closed rule to any URL it finds - userinfo out, the whole
 * query replaced - and keeps a credential-name rule only for a loose `?name=value` that is not inside a scheme URL,
 * where "redact everything that looks like a parameter" would mangle ordinary prose.
 *
 * Stated as limits rather than presented as a guarantee, because the point of the rewrite is that a guarantee this
 * code cannot give is worse than a limit it states:
 *   - A secret carried in a PATH segment (`/reset/abc123`) is not redacted. The path is what makes a log line useful
 *     and the finding accepts origin+path; redacting it would trade a leak this code cannot detect for a log nobody
 *     can act on.
 *   - A secret carried as a parameter NAME is still visible, since names survive. That is deliberate and is the one
 *     residual: names are what tell an operator which parameters the URL had. If a reviewer wants the tighter form,
 *     dropping the query entirely (`origin+pathname` only) is a one-line change to `sanitizeUrlForLog`.
 *   - Text redaction is heuristic about where a URL ends inside prose. It over-redacts rather than under-redacts,
 *     because a redacted log line costs a reader a moment and a leaked secret costs them a lot.
 */

/** The value substituted for every redacted part. Exported so callers and tests can name it once. */
export const REDACTED = 'REDACTED';

/**
 * Does this parameter name look like it carries a credential? Used ONLY by the text redactor, for a loose
 * `?name=value` outside a scheme URL. It is deliberately a case-insensitive SUBSTRING test, because its job is to
 * over-redact prose: narrowing it is how the original URL bug happened, and here a false positive costs nothing but a
 * few characters in a log line. It is NOT the rule that protects URLs - that rule redacts every value.
 */
const CREDENTIAL_WORD = /token|secret|key|sig|signature|password|passwd|pwd|auth|credential|session|bearer|jwt|otp|code/i;

export function looksLikeCredentialParam(name) {
  return CREDENTIAL_WORD.test(String(name));
}

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
  const names = [...new URLSearchParams(parsed.search).keys()];
  const query = names.map((name) => `${encodeURIComponent(name)}=${REDACTED}`).join('&');
  // parsed.origin carries no userinfo, so `https://user:pass@host/x` becomes `https://host/x`.
  return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash ? `#${REDACTED}` : ''}`;
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
    // A loose credential-shaped pair outside a scheme URL, e.g. a relative path in a refusal.
    .replace(/([?&#][^=&\s]*?(?:token|secret|key|sig|signature|password|passwd|pwd|auth|credential|session|bearer|jwt|otp|code)[^=&\s]*=)[^&\s]*/gi, `$1${REDACTED}`);
}
