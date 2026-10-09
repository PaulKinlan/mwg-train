import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REQUIRED_SECTIONS, checkDesignDocument } from '../src/design/contract.mjs';

// A checker that only ever passes is not a checker, so every rule gets a document that must be rejected.
const body = (overrides = {}) => {
  const sections = {
    'Visual thesis': 'A scene, so the page is the task.',
    'Grammar and layout': 'Grammar: Decision workbench. Routes: `GET /` and `POST /book`.',
    Typography: '`16px/1.5 system-ui, sans-serif`, `h1` `1.6rem`.',
    'Token vocabulary': '| `--fg` | `#16181d` |',
    'Spacing rhythm': '`1rem` between fields.',
    'Component hierarchy': '`main` \u2192 `form#booking-form`. Files: `app/page.mjs`, `spec.json`.',
    States: 'Invalid implemented; loading declared only.',
    'Implementation status': 'Lists what exists and what is declared only.',
    Rationale: 'Constraints rather than preferences.',
    Provenance: 'Synthetic copy; see `docs/eval/design/README.md`.',
    ...overrides,
  };
  return `# Evening class booking \u2014 \`raw\` demo design contract\n\n`
    + REQUIRED_SECTIONS.map((heading) => `## ${heading}\n\n${sections[heading]}\n`).join('\n');
};

const demo = {
  archetype: 'booking',
  framework: 'raw',
  files: ['app/enhance.js', 'app/page.mjs', 'app/styles.css', 'package.json', 'server.mjs', 'spec.json'],
  stylesheet: ':root { --fg: #16181d; --bg: #fff; }\n',
  routes: [{ method: 'GET', path: '/' }, { method: 'POST', path: '/book' }],
};
const check = (text, over = {}) => checkDesignDocument({ name: 'booking/raw.md', text, demo: { ...demo, ...over } });

test('a contract that matches the generated demo produces no findings', () => {
  assert.deepEqual(check(body()), []);
});

test('every required section is required, and a stray section is refused', () => {
  for (const heading of REQUIRED_SECTIONS) {
    const text = body().replace(new RegExp(`## ${heading}\\n\\n[^\\n]*\\n`), '');
    const findings = check(text);
    assert.ok(findings.some((f) => f.problem.includes(heading)), `${heading}: removal must be a finding`);
  }
  const stray = check(body().replace('## Rationale', '## Colours\n\nRed.\n\n## Rationale'));
  assert.ok(stray.some((f) => f.problem.includes('outside the contract')), 'stray sections must be refused');
});

test('a token the demo does not emit is a finding, because the doc must not describe fiction', () => {
  const findings = check(body({ 'Token vocabulary': '| `--ink` | `#1b1b1f` |' }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /'--ink' is not emitted/);
});

test('a route the demo does not serve, and a file it does not generate, are findings', () => {
  assert.match(check(body({ 'Grammar and layout': 'Routes: `GET /checkout`.' }))[0].problem, /does not serve/);
  assert.match(check(body({ 'Component hierarchy': '`app/theme.css`' }))[0].problem, /does not generate/);
});

test('the title must name the framework of its own demo, and the path must match it', () => {
  const wrongFramework = check(body().replace('`raw`', '`vue`'));
  assert.match(wrongFramework[0].problem, /but the demo generates 'raw'/);
  const wrongPath = checkDesignDocument({ name: 'booking/vue.md', text: body(), demo });
  assert.ok(wrongPath.some((f) => f.at === 'path'), 'path must match the demo');
});

test('the vocabulary must name at least one token, or it documents nothing checkable', () => {
  assert.match(check(body({ 'Token vocabulary': 'No tokens named here.' }))[0].problem, /at least one custom property/);
});
