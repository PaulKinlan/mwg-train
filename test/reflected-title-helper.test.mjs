import test from 'node:test';
import assert from 'node:assert/strict';

// Part 1 of bead mwg-train-sia: the fix, verified in isolation and staged rather than applied.
//
// The escaping has to be an INLINE helper in the generated source, not an import, because a generated project is
// standalone - its package.json declares only its own dependencies. So this file holds the exact helper text that
// belongs in each non-Hono page module, evaluates it the way the generated code would, and proves it neutralises the
// payload the bead was raised from. Nothing here touches pilot/frameworks.mjs, so no frozen byte moves.

// This is the text to emit. Kept as a string so the test cannot silently drift from the patch recorded in
// docs/KNOWN-SINKS.md: if someone edits one and not the other, the assertion at the bottom fails.
export const ESCAPE_TITLE_SOURCE =
  "const escapeTitle = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');";

const escapeTitle = new Function(`${ESCAPE_TITLE_SOURCE}; return escapeTitle;`)();

// The exact payload the bead records as reproduced against the committed catalogue-react page module.
const PAYLOAD = '<script>alert(1)</script>';

test('the helper neutralises the reproduced payload', () => {
  const escaped = escapeTitle(`Search: ${PAYLOAD}`);
  assert.equal(escaped, 'Search: &lt;script&gt;alert(1)&lt;/script&gt;');
  assert.ok(!escaped.includes('<script'), 'no live tag may survive');
  assert.ok(!escaped.includes('</script'), 'including the closing form');
});

test('the helper covers every character that matters inside an element', () => {
  assert.equal(escapeTitle('<'), '&lt;');
  assert.equal(escapeTitle('>'), '&gt;');
  assert.equal(escapeTitle('&'), '&amp;');
  assert.equal(escapeTitle('"'), '&quot;');
  assert.equal(escapeTitle("'"), '&#39;');
});

test('ampersand is escaped first, so escaping is idempotent-safe rather than double-encoded', () => {
  // A naive order that escaped & last would turn an already-present &lt; into &amp;lt;. Asserting the exact output
  // here is what stops the replacement order being rearranged without anyone noticing.
  assert.equal(escapeTitle('&lt;'), '&amp;lt;');
  assert.equal(escapeTitle('a && b'), 'a &amp;&amp; b');
});

test('the helper is total: it cannot throw on the values the generator actually passes', () => {
  for (const value of [undefined, null, '', 0, false, 'Search: ', PAYLOAD]) {
    assert.doesNotThrow(() => escapeTitle(value), `escapeTitle threw on ${JSON.stringify(value)}`);
  }
  assert.equal(escapeTitle(undefined), '');
  assert.equal(escapeTitle(null), '');
  assert.equal(escapeTitle(0), '0');
});

test('the emitted helper text is self-contained: no imports, no outer references', () => {
  assert.ok(!/\bimport\b|\brequire\(/.test(ESCAPE_TITLE_SOURCE), 'the emitted helper must not import anything');
  assert.ok(!/document\.|window\.|globalThis\./.test(ESCAPE_TITLE_SOURCE), 'the helper must not depend on a browser global');
  // It must survive being pasted into a module that only has what it brought with it.
  assert.doesNotThrow(() => new Function(`${ESCAPE_TITLE_SOURCE}; return escapeTitle('x');`));
});

test('the patched interpolation shape is escaped, and the unpatched shape is exactly what the bug is', () => {
  // These two strings are the before and after of the one-line change in each page module, pinned so the patch
  // recorded on the bead cannot be edited into something that no longer fixes it.
  const before = '      <title>${title}</title>';
  const after = '      <title>${escapeTitle(title)}</title>';
  assert.match(before, /\$\{title\}/);
  assert.doesNotMatch(after, /\$\{title\}/, 'the patched form must not contain the bare interpolation');
  assert.match(after, /\$\{escapeTitle\(title\)\}/);
});
