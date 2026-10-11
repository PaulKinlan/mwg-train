import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkDocLinks, extractLinks, resolveTarget, stripInlineCode } from '../scripts/check-doc-links.mjs';

// A scratch tree, so each case is a document that either resolves or does not. The check takes its file list and its
// tracked set as arguments precisely so a test does not need git or the repository to exercise it.
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-links-'));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

function run(root, documents, tracked = null) {
  return checkDocLinks({
    root,
    files: documents.map((relative) => path.join(root, relative)),
    tracked,
  });
}

test('extraction skips code fences and inline code, and finds inline, image and HTML targets', () => {
  const text = [
    'A [real](a.md) link and an ![image](b.png).',
    '',
    '```',
    '[not a link](c.md)',
    '```',
    '',
    'Write `[also not a link](d.md)` in prose.',
    '',
    '<img src="e.png" alt="x">',
    '',
    '[label]: f.md',
  ].join('\n');
  const found = extractLinks(text).map((link) => link.target);
  assert.deepEqual(found, ['a.md', 'b.png', 'e.png', 'f.md']);
});

test('the efg off-by-one: a store README at the real depth cannot borrow a shallower document link', () => {
  // The real depth is what matters, and it is the bug: `assets/archetypes/<name>/` is four levels down, so three
  // `../` reach the repository root. An earlier version of this test used a three-level path and therefore asserted
  // the wrong correction - the same off-by-one this check exists to catch, in the test for it.
  const deep = 'assets/archetypes/thing/README.md';
  const files = { 'docs/design/archetypes/thing/README.md': '# thing\n' };

  const fixed = tree({ ...files, [deep]: 'from [thing](../../../docs/design/archetypes/thing/README.md)\n' });
  assert.strictEqual(run(fixed, [deep]).ok, true, JSON.stringify(run(fixed, [deep]).findings));

  // One `../` too few, which is what copying a link between depths produces.
  const wrong = tree({ ...files, [deep]: 'from [thing](../../docs/design/archetypes/thing/README.md)\n' });
  const wrongRun = run(wrong, [deep]);
  assert.strictEqual(wrongRun.ok, false);
  assert.match(wrongRun.findings[0].message, /resolves to assets\/docs\/design\/archetypes\/thing\/README\.md, which does not exist/);
});

test('a path with a line number is broken when clicked, which is how five store READMEs were broken', () => {
  const root = tree({
    'docs/design/archetypes/thing/README.md': '# thing\n',
    'assets/archetypes/thing/README.md': 'from [docs/design/archetypes/thing/README.md:5](../../../docs/design/archetypes/thing/README.md:5)\n',
  });
  const withLine = run(root, ['assets/archetypes/thing/README.md']);
  assert.strictEqual(withLine.ok, false);
  assert.match(withLine.findings[0].message, /README\.md:5/);

  // A label may cite a line; a target may not.
  const fixed = tree({
    'docs/design/archetypes/thing/README.md': '# thing\n',
    'assets/archetypes/thing/README.md': 'from [docs/design/archetypes/thing/README.md:5](../../../docs/design/archetypes/thing/README.md)\n',
  });
  const fixedRun = run(fixed, ['assets/archetypes/thing/README.md']);
  assert.strictEqual(fixedRun.ok, true, JSON.stringify(fixedRun.findings));
});

test('a target that exists but is not tracked fails, because a clone breaks it', () => {
  const root = tree({ 'doc.md': '[generated](out/thing.md)\n', 'out/thing.md': '# generated\n' });
  const untracked = run(root, ['doc.md'], new Set());
  assert.strictEqual(untracked.ok, false);
  assert.strictEqual(untracked.findings[0].code, 'LINK-UNTRACKED');

  const tracked = run(root, ['doc.md'], new Set([path.join(root, 'out/thing.md')]));
  assert.strictEqual(tracked.ok, true, JSON.stringify(tracked.findings));

  // A directory is tracked through the files under it.
  const dirRoot = tree({ 'doc.md': '[store](out/)\n', 'out/thing.md': '# thing\n' });
  const asDirectory = run(dirRoot, ['doc.md'], new Set([path.join(dirRoot, 'out/thing.md')]));
  assert.strictEqual(asDirectory.ok, true, JSON.stringify(asDirectory.findings));
  assert.strictEqual(asDirectory.counts.directories, 1);
});

test('external, anchor-only and templated targets are ignored; an angle-wrapped target is a URL, so it is checked', () => {
  const root = tree({
    'doc.md': [
      '[web](https://example.com/x.md)',
      '[mail](mailto:x@example.com)',
      '[self](#section)',
      '[protocol](//example.com/x.md)',
      '[templated]({{thing}}.md)',
      '[ellipsis](...)',
      '[a path with spaces](<a file.md>)',
    ].join('\n'),
    'a file.md': '# here\n',
  });
  const { ok, counts, findings } = run(root, ['doc.md']);
  assert.strictEqual(ok, true, JSON.stringify(findings));
  // Angle brackets are CommonMark syntax for a URL containing spaces, not a placeholder marker, so that target is
  // resolved like any other - which is what would catch a real placeholder rather than waving it through.
  assert.strictEqual(counts.checked, 1);
  assert.strictEqual(counts.ignored, 6);
});

test('a relative link inside a quotation is counted and skipped, not reported', () => {
  const root = tree({
    'doc.md': ['Own link: [gone](gone.md).', '', '> Quoted upstream: [license](LICENSE).'].join('\n'),
  });
  const { findings, counts } = run(root, ['doc.md']);
  assert.strictEqual(counts.quoted, 1, 'the quoted target is counted as quoted');
  assert.strictEqual(counts.checked, 1, 'only the document own link is checked');
  assert.strictEqual(findings.length, 1);
  assert.match(findings[0].message, /gone\.md/);
});

test('resolution is relative to the file, and a leading slash means the root the caller asked about', () => {
  const root = tree({ 'a/b/doc.md': '', 'a/b/sibling.md': '', 'top.md': '' });
  assert.strictEqual(resolveTarget(path.join(root, 'a/b/doc.md'), 'sibling.md', root), path.join(root, 'a/b/sibling.md'));
  assert.strictEqual(resolveTarget(path.join(root, 'a/b/doc.md'), '../doc2.md', root), path.join(root, 'a/doc2.md'));
  assert.strictEqual(resolveTarget(path.join(root, 'a/b/doc.md'), '/top.md', root), path.join(root, 'top.md'));
  assert.strictEqual(resolveTarget(path.join(root, 'a/b/doc.md'), 'sibling.md#anchor', root), path.join(root, 'a/b/sibling.md'));
  assert.strictEqual(resolveTarget(path.join(root, 'a/b/doc.md'), 'a%20file.md', root), path.join(root, 'a/b/a file.md'));
  assert.strictEqual(resolveTarget(path.join(root, 'a/b/doc.md'), 'https://example.com', root), null);
  assert.strictEqual(resolveTarget(path.join(root, 'a/b/doc.md'), '#anchor', root), null);
});

test('inline code is blanked, not deleted, so reported line numbers stay honest', () => {
  assert.strictEqual(stripInlineCode('a `b` c').length, 'a `b` c'.length);
});
