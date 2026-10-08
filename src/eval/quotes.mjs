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
 * Two failure modes are guarded here. Searching the whole page is not enough, because a page lists
 * many prices and a wrong row could match some other card's number - so the value must occur within
 * `window` characters of the verbatim snippet. And the match must be a whole numeric token, not a
 * prefix: `$0.2` occurs inside `$0.27`, so a substring test would accept a price that is not on the
 * page at all.
 */
export function valueNearVerbatim(haystack, verbatim, value, window = 240) {
  const text = normaliseText(haystack);
  const needle = normaliseText(verbatim);
  const at = text.indexOf(needle);
  if (at === -1) return { found: false, reason: 'VERBATIM_NOT_FOUND' };
  const from = Math.max(0, at - window);
  const nearby = text.slice(from, at + needle.length + window);
  const forms = [...new Set([String(value), Number(value).toFixed(2), Number(value).toFixed(3), Number(value).toFixed(4)])];
  const matched = forms.find((form) => new RegExp(`(?:^|[^0-9.])${form.replace('.', '\\.')}(?![0-9])`).test(nearby));
  return matched ? { found: true, matched } : { found: false, reason: 'VALUE_NOT_NEAR_VERBATIM' };
}

/**
 * The label a row claims its number belongs to: the GPU for a rented hour, the model (or size band)
 * inside `model_size_band` for a per-token rate. The label's parenthetical is metadata we add, so
 * only the part that should appear on the page is used.
 */
export function labelOf(row) {
  const raw = typeof row.gpu === 'string' && row.gpu.trim() !== '' ? row.gpu : typeof row.model_size_band === 'string' ? row.model_size_band : '';
  if (raw.trim() === '') return '';
  // Strip the metadata we add around the page's own wording: the parenthetical, and the word
  // "parameters" that a size band carries for readability. What is left is the text that has to be
  // on the page for the row to be about the thing it says it is about.
  return raw.split('(')[0].replace(/\s+parameters?\s*$/i, '').trim();
}

/**
 * Does the snippet actually mention the thing the row says it prices? Proximity alone does not stop
 * a cross-card transplant: taking another card's price *and* its snippet passes the proximity test
 * while the row's own label belongs to a different product. Requiring the label to appear in the
 * snippet is what ties the number to the product.
 */
export function labelAppearsInVerbatim(verbatim, row) {
  const label = labelOf(row);
  if (label === '') return { found: false, reason: 'NO_LABEL' };
  const haystack = normaliseText(verbatim);
  const needle = normaliseText(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Whole-token match: "NVIDIA A10" must not be satisfied by "NVIDIA A100 SXM", which is exactly how
  // a cross-card transplant slipped through a plain substring test.
  const pattern = new RegExp(`(?:^|[^a-z0-9])${needle.replace(/ /g, '\\s+')}(?![a-z0-9])`);
  return pattern.test(haystack) ? { found: true, label } : { found: false, reason: 'LABEL_NOT_IN_VERBATIM', label };
}
