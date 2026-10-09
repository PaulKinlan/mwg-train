import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFrontmatter, parseYamlSubset } from '../src/design/yaml.mjs';

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
  assert.equal(value.tokens.typography.scale, 1.25);
  assert.equal(value.tokens.spacing.unit, 0.5);
  assert.equal(value.tokens.radius.none, 0);
  assert.equal(value.elevated, true);
  assert.equal(value.shadow, null);
  assert.deepEqual(value.antiPatterns, ['pure black backgrounds', 'centred body text']);
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
  assert.deepEqual(frontmatter, { archetype: 'booking', framework: 'raw' });
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
