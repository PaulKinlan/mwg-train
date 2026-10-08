/**
 * Shared text handling for the quote pipeline.
 *
 * scripts/extract-quotes.mjs reads prices out of *decoded* page text, and
 * scripts/verify-quotes.mjs re-derives those prices from the *raw* bodies. If the two use different
 * normalisation the check fails on a real quote or, worse, passes on a wrong one - which is exactly
 * what happened on the first run (names with non-breaking spaces failed to match). One decoder, used
 * by both sides, is the fix.
 */

const ENTITIES = [
  [/&nbsp;|&#160;|&#xa0;/g, ' '],
  [/&gt;/g, '>'],
  [/&lt;/g, '<'],
  [/&quot;|&#34;/g, '"'],
  [/&#39;|&rsquo;|&apos;/g, "'"],
  [/&mdash;/g, '-'],
  [/&ndash;/g, '-'],
  [/&hellip;/g, '...'],
  [/&amp;/g, '&'],
];

/** Strip tags, decode the entities these pricing pages use, and collapse whitespace. */
export function decodeHtml(html) {
  let text = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  for (const [pattern, replacement] of ENTITIES) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, ' ').trim();
}

/** Comparison form: decoded text, case-folded, whitespace-collapsed, currency spacing removed. */
export function normaliseText(text) {
  return decodeHtml(text)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\$\s+/g, '$');
}

export function parseJsonl(text) {
  return String(text)
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`line ${index + 1} is not valid JSON: ${error.message}`);
      }
    });
}

/**
 * Is the number actually present in the page next to the snippet it is claimed to come from?
 *
 * Searching the whole page is not enough: a page lists many prices, so a wrong row could match some
 * other card's number. The value must occur within `window` characters of the verbatim snippet.
 */
export function valueNearVerbatim(haystack, verbatim, value, window = 240) {
  const text = normaliseText(haystack);
  const needle = normaliseText(verbatim);
  const at = text.indexOf(needle);
  if (at === -1) return { found: false, reason: 'VERBATIM_NOT_FOUND' };
  const from = Math.max(0, at - window);
  const nearby = text.slice(from, at + needle.length + window);
  const forms = [`$${Number(value).toFixed(2)}`, `$${value}`, String(value)];
  const matched = forms.find((form) => nearby.includes(form));
  return matched ? { found: true, matched } : { found: false, reason: 'VALUE_NOT_NEAR_VERBATIM' };
}
