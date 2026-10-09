import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFrontmatter, parseYamlSubset } from '../src/design/yaml.mjs';

// Mappings are built with Object.create(null) so that a key can never land on a prototype, which means an
// assertion about their contents has to compare plain copies rather than the parsed objects themselves.
const plain = (value) => JSON.parse(JSON.stringify(value));

// A checker that has only ever been shown to pass is not a checker, so most of these are negative: each one is a
// shape the subset must refuse rather than half-read. A wrongly-accepted block would let a design document claim
// tokens the checker never actually compared against the stylesheet.
test('parses the documented subset: nested mappings, sequences, scalars and a bare hex colour', () => {
  const { value, problems } = parseYamlSubset(
    [
      '# a full-line comment is data-free',
      'archetype: booking',
      'framework: raw',
      'tokens:',
      '  color:',
      '    ink: "#1b1e24"',
      '    paper: \'#ffffff\'',
      '    accent: #b3261e',
      '  typography:',
      '    family: Inter, system-ui, sans-serif',
      '    scale: 1.25',
      '  spacing:',
      '    unit: 0.5',
      '  radius:',
      '    none: 0',
      '    padded: 6',
      'elevated: true',
      'shadow: null',
      'antiPatterns:',
      '  - pure black backgrounds',
      '  - centred body text',
    ].join('\n'),
  );
  assert.deepEqual(problems, []);
  assert.equal(value.archetype, 'booking');
  assert.equal(value.tokens.color.ink, '#1b1e24');
  assert.equal(value.tokens.color.paper, '#ffffff');
  assert.equal(value.tokens.color.accent, '#b3261e');
  assert.equal(value.tokens.typography.family, 'Inter, system-ui, sans-serif');
  assert.equal(value.tokens.typography.scale, '1.25', 'numbers are read as text, not normalised');
  assert.equal(value.tokens.spacing.unit, '0.5');
  assert.equal(value.tokens.radius.none, '0');
  assert.equal(value.elevated, true);
  assert.equal(value.shadow, null);
  assert.deepEqual(plain(value.antiPatterns), ['pure black backgrounds', 'centred body text']);
});

for (const [name, source, expected] of [
  ['a tab character', 'key:\n\tother: 1', /tab character/],
  ['odd indentation', 'key:\n   other: 1', /not a multiple of two/],
  ['a duplicate key', 'ink: a\nink: b', /duplicate key 'ink'/],
  ['a flow mapping', 'ink: {a: 1}', /'\{' starts a YAML feature/],
  ['a flow sequence', 'ink: [a, b]', /'\[' starts a YAML feature/],
  ['an anchor', 'ink: &base #fff', /'&' starts a YAML feature/],
  ['an alias', 'ink: *base', /'\*' starts a YAML feature/],
  ['a tag', 'ink: !!str 1', /'!' starts a YAML feature/],
  ['a block scalar', 'ink: |\n  a\n  b', /'\|' starts a YAML feature/],
  ['a folded scalar', 'ink: >\n  a', /'>' starts a YAML feature/],
  ['a directive line', '%YAML 1.2', /expected "key: value"|starts a YAML feature/],
  ['an unterminated double quote', 'ink: "abc', /unterminated double-quoted string/],
  ['an unterminated single quote', "ink: 'abc", /unterminated single-quoted string/],
  ['an unquoted value containing a colon-space', 'ink: a: b', /cannot contain ': '/],
  ['an inline comment', 'ink: #fff # not really', /inline comments are not supported/],
  ['a value beginning with a non-hex hash', 'ink: #notahexcolour', /only understood as a hex colour/],
  ['a key with neither a value nor children', 'ink:\npaper: #fff', /'ink' has neither a value nor any children/],
  ['a list item written as a mapping', 'items:\n  - name: a', /list item cannot be a mapping/],
  ['a line that is neither a key nor a list item', 'just some text', /expected "key: value"/],
].map(([name, source, expected]) => [name, source, expected])) {
  test(`refuses ${name}`, () => {
    const { problems } = parseYamlSubset(source);
    assert.ok(problems.length > 0, 'expected at least one problem');
    assert.ok(
      problems.some((problem) => expected.test(problem)),
      `no problem matched ${expected}: ${JSON.stringify(problems)}`,
    );
  });
}

test('refuses an empty block, and reports it rather than returning an empty mapping', () => {
  const { value, problems } = parseYamlSubset('\n\n# only a comment\n');
  assert.equal(value, null);
  assert.deepEqual(problems, ['the block is empty']);
});

// The point of the subset is that an unreadable block is not silently half-read: whatever a rejected line would have
// contributed is absent, and the problem list is non-empty, so a caller cannot mistake the result for a complete one.
test('a refused line contributes nothing, so a partial parse is never mistakeable for a complete one', () => {
  const { value, problems } = parseYamlSubset('ink: #1b1e24\npaper: {@bad}\naccent: #b3261e');
  assert.equal(value.ink, '#1b1e24');
  assert.equal(value.paper, null);
  assert.equal(value.accent, '#b3261e');
  assert.equal(problems.length, 1);
});

test('splits a document into frontmatter and body', () => {
  const { frontmatter, body, problems } = parseFrontmatter(
    ['---', 'archetype: booking', 'framework: raw', '---', '', '## Visual thesis', '', 'Prose here.', ''].join('\n'),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(plain(frontmatter), { archetype: 'booking', framework: 'raw' });
  assert.match(body, /## Visual thesis/);
  assert.doesNotMatch(body, /archetype: booking/);
});

test('refuses a document with no frontmatter fence at all', () => {
  const { frontmatter, problems } = parseFrontmatter('## Visual thesis\n\nNo tokens here.\n');
  assert.equal(frontmatter, null);
  assert.match(problems.join(' '), /does not begin with a --- frontmatter fence/);
});

test('refuses a frontmatter fence that is never closed', () => {
  const { frontmatter, problems } = parseFrontmatter('---\narchetype: booking\n\n## Visual thesis\n');
  assert.equal(frontmatter, null);
  assert.match(problems.join(' '), /never closed/);
});

test('carries a malformed frontmatter block through as problems rather than throwing', () => {
  const { problems } = parseFrontmatter('---\n\tink: #fff\n---\n\n## Visual thesis\n');
  assert.match(problems.join(' '), /tab character/);
});

// A hex colour is data wherever it appears, including after other value parts. Reading '1px solid #8a8f98'
// as a value with a trailing comment would refuse a perfectly ordinary CSS border and would have done so in
// the first document written against this parser.
test('accepts a hex colour as one part of a multi-part value', () => {
  const { value, problems } = parseYamlSubset(
    ['control-border: 1px solid #8a8f98', 'focus: 3px solid #1b4fd8', 'rule: 1px solid #d5d8dd'].join('\n'),
  );
  assert.deepEqual(problems, []);
  assert.equal(value['control-border'], '1px solid #8a8f98');
  assert.equal(value.focus, '3px solid #1b4fd8');
});

test('still refuses a genuine trailing comment', () => {
  const { problems } = parseYamlSubset('control-border: 1px solid # this is prose, not a colour');
  assert.match(problems.join(' '), /inline comments are not supported/);
});

// A key that lands on the prototype rather than the object is a claim that is recorded and never read. The key
// regex admits `__proto__`, Object.hasOwn is never true for it, and assignment then writes the prototype - so a
// frontmatter literal could state a value the checker would never look at. Two defences: prototype keys are
// refused outright, and mappings do not inherit Object.prototype at all.
test('refuses a prototype key rather than letting it vanish into the prototype', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const mapping = parseYamlSubset(`tokens:\n  ${key}:\n    evil: 1`);
    assert.ok(
      mapping.problems.some((problem) => problem.includes(`'${key}' is not a usable key`)),
      `${key} nested: ${JSON.stringify(mapping.problems)}`,
    );
    const scalar = parseYamlSubset(`tokens:\n  ${key}: 999px bogus`);
    assert.ok(
      scalar.problems.some((problem) => problem.includes(`'${key}' is not a usable key`)),
      `${key} scalar: ${JSON.stringify(scalar.problems)}`,
    );
  }
});

test('a parsed mapping does not pollute Object.prototype, and its keys stay own properties', () => {
  const { value, problems } = parseYamlSubset('tokens:\n  --fg: "#16181d"');
  assert.deepEqual(problems, []);
  assert.equal({}.evil, undefined, 'the global Object prototype must be untouched');
  assert.ok(Object.hasOwn(value.tokens, '--fg'), 'the key is an own property');
  assert.equal(Object.getPrototypeOf(value.tokens), null, 'mappings have no prototype to inherit from');
});

// This subset does not implement YAML escapes, so a quoted string containing one must be refused rather than
// silently read with the escape left in it - an accepted shape that is misread is the failure mode that matters.
test('refuses quoted strings whose escapes it would silently misread', () => {
  const escaped = parseYamlSubset('a: "x \\" y"');
  assert.match(escaped.problems.join(' '), /backslash escapes are not implemented/);
  const doubled = parseYamlSubset("a: 'it''s'");
  assert.match(doubled.problems.join(' '), /doubled single quote is not implemented/);
});

// A token value is compared against the stylesheet as text, so interpreting numbers would check a claim the
// document did not make: "010" is not 10, and "1.50" is not 1.5, in a stylesheet that says what it says.
test('reads numbers as text rather than normalising them', () => {
  const { value, problems } = parseYamlSubset('a: 010\nb: 1.50\nc: -3\nd: 0.5rem');
  assert.deepEqual(problems, []);
  assert.equal(value.a, '010');
  assert.equal(value.b, '1.50');
  assert.equal(value.c, '-3');
  assert.equal(value.d, '0.5rem');
});
