/**
 * Logging a captured URL must not put a credential into a CI log (mwg-train-s7iu).
 *
 * A capture tool exists to accept arbitrary third-party URLs, and URLs carry secrets in three places: userinfo
 * (`https://user:pass@host/`), query parameters (`?token=`, `?X-Amz-Signature=`, `?api_key=`) and fragments
 * (`#access_token=`). Whatever is printed to stdout or stderr on a CI runner is readable by anyone who can read the
 * job, and stays in the log after the run, so the URL is the last thing that should be echoed verbatim.
 *
 * `sanitizeUrlForLog` keeps what a reader needs to follow the capture - the origin and the path, which is the part
 * that identifies what was captured - and removes the rest: userinfo is dropped, and a query parameter whose NAME
 * looks like a credential keeps its name with the value replaced, so the shape of the URL is still legible.
 *
 * `redactSecretsInText` is for text that CONTAINS a URL rather than being one: error messages from the browser layer
 * and from this project's own refusals both interpolate the URL, and a refusal that quotes the URL it refused should
 * not be the thing that leaks it.
 *
 * Both are heuristics and are stated as such rather than presented as a guarantee:
 *   - A parameter name is matched against known credential shapes (`token`, `api_key`, `signature`, and so on). A
 *     service that carries a credential under an unrelated name is not covered.
 *   - A secret inside a path segment (`/reset/abc123`) is NOT redacted. This is deliberate: the path is what makes a
 *     log line useful, and the finding accepts origin+path. Removing it would trade a leak we cannot detect for a log
 *     nobody can act on.
 *   - Text redaction rewrites userinfo and credential-shaped parameters anywhere in a string. It over-redacts rather
 *     than under-redacts, because a redacted log line costs a reader a moment and a leaked secret costs them a lot.
 */

/** The value substituted for a redacted parameter. Exported so callers and tests can name it once. */
export const REDACTED = 'REDACTED';

/**
 * Parameter names that carry credentials. Matched on separators rather than as substrings, so `api_key` and
 * `access_token` are redacted while `keyword` - which merely contains "key" - is left alone.
 */
const SENSITIVE_PARAM = /(?:^|[_-])(?:token|secret|key|sig|signature|password|passwd|pwd|auth|authorization|bearer|credential|credentials|session|jwt|otp|code)(?:$|[_-])/i;

export function isSensitiveParamName(name) {
  return SENSITIVE_PARAM.test(String(name));
}

function redactParams(params) {
  for (const name of new Set(params.keys())) {
    if (isSensitiveParamName(name)) params.set(name, REDACTED);
  }
  return params;
}

/**
 * A fragment is not a query string - it can hold a route, a scroll target or an OAuth response - so the parameter
 * rules above do not apply to it cleanly. A fragment that mentions a credential word at all is replaced wholesale:
 * a fragment is not needed to identify the captured page, and guessing at its grammar is how a token slips through.
 */
function sanitizeFragment(hash) {
  if (!hash) return '';
  return /(?:token|secret|key|sig|password|passwd|pwd|auth|credential|session|jwt|code)/i.test(hash) ? '#REDACTED' : hash;
}

/** A URL (absolute, or a path that parses as one) with userinfo and credential-shaped parameters removed. */
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
  const params = redactParams(new URLSearchParams(parsed.search));
  const query = params.toString();
  // parsed.origin carries no userinfo, so `https://user:pass@host/x` becomes `https://host/x`.
  return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}${sanitizeFragment(parsed.hash)}`;
}

/**
 * Text that may contain URLs, with userinfo and credential-shaped parameters redacted. Used for error messages, whose
 * authors are the browser layer or this project's own refusals and which routinely quote the URL at issue.
 */
export function redactSecretsInText(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text
    // Any scheme://user:pass@ run, wherever it appears in the message.
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/\s@]*@/g, `$1${REDACTED}@`)
    // A credential-shaped parameter anywhere in the text, in a query or a fragment.
    .replace(
      /([?&#][^=&\s]*?(?:token|secret|key|sig|signature|password|passwd|pwd|auth|credential|session|bearer|jwt|code)[^=&\s]*=)[^&\s]*/gi,
      `$1${REDACTED}`,
    );
}
