import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';

import { DESIGN_SECTIONS, checkDesignDocument, repositoryLinkResolver } from '../src/design/contract.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkDocumentClassification } from '../scripts/check-baseline-label.mjs';

// A checker that has only ever been shown to pass is not a checker, so nearly every rule below is exercised by
// a document that must be rejected. The document builder produces a VALID contract; each test breaks exactly
// one thing and asserts that the break is the finding it should be.

const FRONTMATTER = [
  '---',
  'archetype: booking',
  'framework: raw',
  'tokens:',
  '  --fg: "#16181d"',
  '  --bg: "#ffffff"',
  'literals:',
  '  control-border: 1px solid #8a8f98',
  'antiPatterns:',
  '  - a second accent colour',
  '---',
  '',
].join('\n');

const SECTIONS = {
  'Visual thesis': 'A scene, so the page is the task.',
  'Grammar and layout': 'One narrow column, sixty-ish characters of measure.',
  Typography: '`16px/1.5 system-ui, sans-serif`, `h1` `1.6rem`.',
  'Token usage': 'The `--fg` token carries all ink and is redefined for dark mode.',
  'Spacing rhythm': '`1rem` between fields.',
  'Component hierarchy': '`main` then `form#booking-form`; files `app/page.mjs`, `spec.json`.',
  'Anti-patterns': 'A second accent colour.',
  Rationale: 'Constraints rather than preferences.',
  Provenance: 'Synthetic copy; see `docs/eval/design/README.md`.',
};

function document(overrides = {}, frontmatter = FRONTMATTER) {
  const title = overrides.__title ?? '# Evening class booking \u2014 `raw` demo design contract\n\n';
  delete overrides.__title;
  const sections = { ...SECTIONS, ...overrides };
  const headings = overrides.__sections ?? DESIGN_SECTIONS;
  delete overrides.__sections;
  return frontmatter + title + headings.map((heading) => `## ${heading}\n\n${sections[heading] ?? 'Body.'}\n`).join('\n');
}

const demo = {
  archetype: 'booking',
  framework: 'raw',
  files: ['app/enhance.js', 'app/page.mjs', 'app/styles.css', 'package.json', 'server.mjs', 'spec.json'],
  stylesheet: ':root { --fg: #16181d; --bg: #ffffff; }\ninput { border: 1px solid #8a8f98; }\n',
};
const check = (text, over = {}) => checkDesignDocument({ name: 'booking/raw.md', text, demo: { ...demo, ...over } });
const problems = (text, over) => check(text, over).map((finding) => `${finding.at}: ${finding.problem}`).join(' | ');

test('a contract that matches the generated demo produces no findings', () => {
  assert.deepEqual(check(document()), []);
});

test('the framework is named in the title, and it must be the demo that was generated', () => {
  assert.match(problems(document({ __title: '# Booking design contract\n\n' })), /must name the documented framework/);
  assert.match(problems(document({ __title: '# Booking \u2014 `vue` contract\n\n' })), /documents framework 'vue'/);
});

test('every required section is required, a stray is refused, and the order is fixed', () => {
  for (const heading of DESIGN_SECTIONS) {
    const text = document().replace(new RegExp(`## ${heading}\\n\\n[^\\n]*\\n`), '');
    assert.match(problems(text), new RegExp(`missing required section '## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(problems(document().replace('## Rationale', '## Implementation status')), /sections outside the contract/);
  const reversed = [...DESIGN_SECTIONS].reverse();
  assert.match(problems(document({ __sections: reversed })), /sections must appear in contract order/);
});

test('an empty section is a finding, because a heading with nothing under it claims nothing', () => {
  assert.match(problems(document({ Typography: '' })), /section '## Typography' is empty/);
});

for (const [name, frontmatter, expected] of [
  ['no frontmatter at all', '', /does not begin with a --- frontmatter fence/],
  ['frontmatter with the wrong archetype', FRONTMATTER.replace('archetype: booking', 'archetype: catalogue'), /archetype is 'catalogue'/],
  ['frontmatter with the wrong framework', FRONTMATTER.replace('framework: raw', 'framework: vue'), /framework is 'vue'/],
  ['no tokens mapping', FRONTMATTER.replace(/tokens:\n(  --.*\n)+/, ''), /frontmatter needs a `tokens` mapping/],
  ['no antiPatterns', FRONTMATTER.replace(/antiPatterns:\n  - .*\n/, ''), /`antiPatterns` must be a non-empty list/],
].map(([name, frontmatter, expected]) => [name, frontmatter, expected])) {
  test(`refuses ${name}`, () => {
    assert.match(problems(document({}, frontmatter)), expected);
  });
}

test('a token the stylesheet does not emit is a finding, and so is a value it does not have', () => {
  assert.match(
    problems(document({}, FRONTMATTER.replace('  --bg: "#ffffff"', '  --muted: "#ffffff"'))),
    /'--muted: #ffffff' is not a declaration this demo's stylesheet makes/,
  );
  assert.match(
    problems(document({}, FRONTMATTER.replace('--fg: "#16181d"', '--fg: "#000000"'))),
    /'--fg: #000000' is not a declaration this demo's stylesheet makes/,
  );
});

test('a literal the stylesheet does not contain is a finding', () => {
  assert.match(
    problems(document({}, FRONTMATTER.replace('control-border: 1px solid #8a8f98', 'control-border: 2px solid #ff00ff'))),
    /names '#ff00ff', which this stylesheet does not contain/,
  );
});

test('the frontmatter is the single source of truth, so a token value in the body is a finding', () => {
  assert.match(problems(document({ 'Token usage': 'The ink is `#16181d` in light mode.' })), /restates the frontmatter value '#16181d'/);
  // Naming the token without its value is expected, and must stay clean.
  assert.deepEqual(check(document({ 'Token usage': 'The `--fg` token carries all ink.' })), []);
});

test('a route claim belongs in plan.md, where it can be checked against the spec', () => {
  assert.match(problems(document({ 'Grammar and layout': 'Serves `GET /` and `POST /book`.' })), /routes belong in plan.md/);
});

test('a file the demo does not generate is a finding', () => {
  assert.match(problems(document({ 'Component hierarchy': '`app/missing.mjs` holds it.' })), /names 'app\/missing.mjs'/);
});

test('the path is the archetype and framework of the demo it describes', () => {
  const findings = checkDesignDocument({ name: 'booking/vue.md', text: document(), demo });
  assert.match(findings.map((f) => f.problem).join(' | '), /must live at booking\/raw.md/);
});
// The resolver is the one part of the contract that reads the filesystem, so it is tested against real
// files and real symlinks rather than reasoned about. A path can be inside the repository as a string
// and still be a symlink whose bytes live outside it.
test('the link resolver refuses anything outside the repository, including through symlinks', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'link-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'link-outside-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const documentDir = join(root, 'docs');
  mkdirSync(documentDir, { recursive: true });
  writeFileSync(join(root, 'inside.md'), 'inside\n');
  writeFileSync(join(outside, 'secret.md'), 'outside\n');
  symlinkSync(join(outside, 'secret.md'), join(root, 'leak.md'));
  symlinkSync(outside, join(root, 'dirlink'));
  symlinkSync(join(outside, 'gone.md'), join(root, 'dangling.md'));

  const resolveLink = repositoryLinkResolver({ root, documentDir });
  assert.equal(resolveLink('../inside.md'), true, 'a real in-repo file resolves');
  assert.equal(resolveLink('../inside.md#section'), true, 'a fragment is not part of the path');
  assert.equal(resolveLink('../leak.md'), false, 'a symlinked file whose bytes are outside is refused');
  assert.equal(resolveLink('../dirlink/secret.md'), false, 'a symlinked directory component is refused');
  assert.equal(resolveLink('../dangling.md'), false, 'a dangling symlink is refused');
  assert.equal(resolveLink('../missing.md'), false, 'a missing file is refused');
  // A real file outside the root, reached without any symlink, so containment is the only thing that can
  // refuse it. The version this replaced named a path that is never created, so it proved only that a
  // missing file is refused.
  assert.equal(
    resolveLink(`../../${basename(outside)}/secret.md`),
    false,
    'a real existing file outside the root is refused by containment',
  );
  assert.equal(resolveLink('..'), false, 'the repository root itself is not a file inside it');
  assert.equal(resolveLink('../../../..'), false, 'a path well above the root is refused');
});

test('canonicalises the repository root, so a root reached through a symlink still contains its files', (t) => {
  // The resolver canonicalises the root as well as the target. Without that, a checkout reached through a
  // symlink makes containment a fact about a path string, and an ordinary in-repo file resolves to a path
  // that begins with '..' relative to the uncanonical root and is wrongly refused.
  const realRoot = mkdtempSync(join(tmpdir(), 'link-realroot-'));
  const aliasRoot = `${realRoot}-alias`;
  const outside = mkdtempSync(join(tmpdir(), 'link-alias-outside-'));
  t.after(() => {
    rmSync(realRoot, { recursive: true, force: true });
    rmSync(aliasRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(join(outside, 'secret.md'), 'outside\n');
  mkdirSync(join(realRoot, 'docs'), { recursive: true });
  writeFileSync(join(realRoot, 'inside.md'), 'inside\n');
  symlinkSync(realRoot, aliasRoot);

  const resolveLink = repositoryLinkResolver({ root: aliasRoot, documentDir: join(realRoot, 'docs') });
  assert.equal(resolveLink('../inside.md'), true, 'a file inside the real root is inside when the root is a symlink');
  // A REAL file outside the root, reached without any symlink, so the refusal can only come from the
  // containment test: realpathSync succeeds and the file exists. The first version of this assertion named
  // containment while testing non-existence - the target was never created - so it passed for a reason it did
  // not state. The mutation check below is what makes that concrete.
  assert.equal(
    resolveLink(`../../${basename(outside)}/secret.md`),
    false,
    'a real file outside the root is refused by containment, not by being missing',
  );
});

test('accepts an in-repo file whose name begins with two dots, which the first containment test refused', (t) => {
  // The previous test rejected anything whose relative path started with '..', which also rejected a real
  // file named ..dot.md. The contract fix accepts it, and this pins that so it cannot be undone silently.
  const root = mkdtempSync(join(tmpdir(), 'link-dots-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, '..dot.md'), 'two dots\n');

  const resolveLink = repositoryLinkResolver({ root, documentDir: join(root, 'docs') });
  assert.equal(resolveLink('../..dot.md'), true, 'a two-dots filename inside the repository is a real file');
  assert.equal(resolveLink('..missing.md'), false, 'a missing file is still refused');
});

test('the token-value restatement check ignores case, because a value does not change case', () => {
  assert.match(
    problems(document({ 'Token usage': 'The ink is `#16181D` in light mode.' })),
    /restates the frontmatter value/,
  );
});

const root = new URL('../', import.meta.url);

// Permanent guard: a new design document that nobody classified is exactly what the merger's full gate caught on
// this branch, and it passed every check I had run. This asserts the class cannot recur.
//
// The first version of this guard was itself wrong in three ways, found by an independent cross-family review and
// reproduced before being fixed: it searched the checker's SOURCE TEXT for a quoted path, so an entry moved into
// a comment left the guard green while the full gate failed; it scanned only .md in one directory, while the
// checker scans tracked .md AND .json; and its floor of 35 permitted six of the 41 tracked design documents to
// disappear unnoticed. It now enumerates the checker's own surface with NUL separation, so git path quoting
// cannot hide a file, and asserts against the exported DOCUMENTS map itself rather than a string that looks like
// it. The control that proves it bites: remove one entry and this test fails.
test('every tracked design document is classified for the baseline-label check', () => {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'docs/eval/design'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((p) => /[.](md|json)$/.test(p));
  // A floor, not a target: the point is that a shrinking list cannot make this test pass vacuously. It is the
  // count of tracked design documents at the time of writing, so removing design documents is a deliberate edit.
  assert.ok(tracked.length >= 41, `expected at least the 41 tracked design documents, saw ${tracked.length}`);
  // The checker's own predicate, not a re-implementation of it: this rejects an entry whose value is null or
  // empty, which Object.hasOwn would have accepted, and it honours GENERATED_PATTERNS the same way the gate does.
  const findings = checkDocumentClassification(tracked);
  assert.deepEqual(findings.map(({ code, subject }) => `${code} ${subject}`), [],
    'classify these in DOCUMENTS or the full gate will fail');
});

