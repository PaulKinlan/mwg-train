import { after, test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkDocLinks, extractLinks, resolveTarget, stripInlineCode } from '../scripts/check-doc-links.mjs';

const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

// A scratch tree, so each case is a document that either resolves or does not. The check takes its file list and its
// tracked set as arguments precisely so a test does not need git or the repository to exercise it.
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-links-'));
  tempDirs.push(root);
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

// A blockquote is skipped because it reproduces someone else's document, so its relative links are relative to that
// document. A callout is not a quotation - it is our own prose inside a marker - so its block is checked, and the
// block is the unit rather than the line, because a callout's continuation lines are as much ours as its first line
// (mwg-train-0ts).
test('a callout is checked, and its continuation lines are checked with it', () => {
  const root = tree({
    'doc.md': ['> [!NOTE]', '> See [the missing guide](missing.md) for more.', '', 'Body.'].join('\n'),
  });
  const { ok, findings } = run(root, ['doc.md']);
  assert.strictEqual(ok, false, 'a callout link to a missing file must be reported');
  assert.match(findings[0].message, /missing\.md/, 'the report names the target');
  // The second line is the half a per-line fix would leave unchecked: it carries no marker of its own.
  const continuation = tree({
    'doc.md': ['> [!NOTE]', '> The first line is fine.', '> Then [a second-line link](gone.md).', ''].join('\n'),
  });
  const second = run(continuation, ['doc.md']);
  assert.strictEqual(second.ok, false, 'a link on a callout continuation line must be reported too');
  assert.match(second.findings[0].message, /gone\.md/);
});

// The review's edge-case table, in the two directions that matter. A lazy continuation is a line with no `>` that
// still belongs to the blockquote, so it neither ends the block nor re-opens it: a callout stays a callout across one,
// and a quotation stays a quotation.
test('a lazy continuation does not end a block, in either kind of blockquote', () => {
  const callout = tree({
    'doc.md': ['> [!NOTE]', 'Belongs to the callout without a marker.', '> [still ours](gone.md)', ''].join('\n'),
  });
  assert.strictEqual(
    run(callout, ['doc.md']).ok,
    false,
    'a callout resumed after a lazy continuation is still ours, so its broken link is reported',
  );

  const quotation = tree({
    'doc.md': ['> [Quoted from elsewhere](ALSO-LICENSE)', 'Still the same quotation, lazily continued.', ''].join('\n'),
  });
  assert.strictEqual(run(quotation, ['doc.md']).ok, true, 'a lazily continued quotation must stay skipped');
});

// The other half of the claim: widening what is checked must not report what resolves. A callout's link is counted as
// checked rather than quoted, which is what tells the two sets apart on a passing document.
test('a valid link in a callout is checked and counted, not quoted', () => {
  const root = tree({
    'doc.md': ['> [!WARNING]', '> Read [the guide](guide.md) first.', ''].join('\n'),
    'guide.md': '# the guide\n',
  });
  const { ok, counts } = run(root, ['doc.md']);
  assert.strictEqual(ok, true, 'a link that resolves must not be reported');
  assert.strictEqual(counts.checked, 1, 'the callout link counts as checked');
  assert.strictEqual(counts.quoted, 0, 'and not as quoted');
});

test('a blockquote after a callout is a quotation again, not part of the callout', () => {
  // The block boundary. A callout ends where its `>` lines end, so tracking only "are we in a callout" and never
  // leaving would mark every later quotation as ours - the regression this test exists to catch.
  const root = tree({
    'doc.md': ['> [!NOTE]', '> Ours.', '', 'Ordinary text.', '', '> [Quoted from elsewhere](ALSO-LICENSE)', ''].join('\n'),
  });
  assert.strictEqual(
    run(root, ['doc.md']).ok,
    true,
    'a blockquote following a callout must still be treated as a quotation',
  );
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

// The four cases below were reported as parser limits in the review of mwg-train-oae. The first two could make a
// CORRECT document fail, which is the direction that matters: a gate that cries wolf gets switched off.
test('balanced parentheses belong to the destination, so a correct link is not truncated into a false finding', () => {
  const root = tree({
    'doc.md': 'See [the guide](docs/(draft)/guide.md).\n',
    'docs/(draft)/guide.md': '# guide\n',
  });
  const { ok, counts, findings } = run(root, ['doc.md']);
  assert.strictEqual(ok, true, JSON.stringify(findings));
  assert.strictEqual(counts.checked, 1);
  assert.strictEqual(extractLinks('See [the guide](docs/(draft)/guide.md).')[0].target, 'docs/(draft)/guide.md');
});

test('a code span delimited by several backticks hides the link inside it', () => {
  // An even number of backticks used to pair the opener with the closer, match empty, and leave the span contents
  // exposed - so a document showing an example link in code could fail as if it made the link.
  const text = 'Write ``[example](broken.md)`` in prose.\n\nAnd ``a`` plus ``b``.\n';
  const root = tree({ 'doc.md': text });
  const { ok, counts, findings } = run(root, ['doc.md']);
  assert.strictEqual(ok, true, JSON.stringify(findings));
  assert.strictEqual(counts.checked, 0);
  assert.deepEqual(extractLinks(text), []);
});

test('a destination on the following line is still a link, but a blank line is not', () => {
  const root = tree({ 'doc.md': 'See [the guide](\ndocs/guide.md).\n', 'docs/guide.md': '# guide\n' });
  const { ok, counts } = run(root, ['doc.md']);
  assert.strictEqual(ok, true);
  assert.strictEqual(counts.checked, 1);

  const blank = tree({ 'doc.md': 'Not [the guide](\n\ndocs/guide.md).\n', 'docs/guide.md': '# guide\n' });
  assert.deepEqual(extractLinks('Not [the guide](\n\ndocs/guide.md).'), []);
  assert.strictEqual(run(blank, ['doc.md']).counts.checked, 0);
});

test('an escaped bracket in link text does not end the text, so the link is still found', () => {
  const text = 'See [foo \\] bar](docs/guide.md).\n';
  const links = extractLinks(text);
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].target, 'docs/guide.md');
  const root = tree({ 'doc.md': text, 'docs/guide.md': '# guide\n' });
  assert.strictEqual(run(root, ['doc.md']).ok, true);
});

test('a fence closes only on a run at least as long as the one that opened it', () => {
  // A shorter fence inside a longer one is content, so the link between them must stay hidden.
  const text = ['````', '```', '[example](broken.md)', '```', '````', '', 'After: [real](docs/guide.md).', ''].join('\n');
  const root = tree({ 'doc.md': text, 'docs/guide.md': '# guide\n' });
  const { ok, counts, findings } = run(root, ['doc.md']);
  assert.strictEqual(ok, true, JSON.stringify(findings));
  assert.strictEqual(counts.checked, 1, 'only the link after the fence is a link');
  assert.strictEqual(extractLinks(text)[0].target, 'docs/guide.md');
});

test('links come out in document order, whatever kind they are', () => {
  const text = ['[one](a.md)', '', '<img src="b.png" alt="b">', '', '[two]: c.md', ''].join('\n');
  assert.deepEqual(extractLinks(text).map((link) => link.target), ['a.md', 'b.png', 'c.md']);
});

// The five cases below are the review findings on this change. The first is a P1 because it made the scanner find LESS
// than the regex it replaced: a valid link was silently dropped, which is worse than reporting a wrong one.
test('whitespace before the closing parenthesis does not stop a link being a link', () => {
  const root = tree({ 'doc.md': 'See [the guide](docs/guide.md ).\n', 'docs/guide.md': '# guide\n' });
  const links = extractLinks('See [the guide](docs/guide.md ).');
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].target, 'docs/guide.md');
  const { ok, counts, findings } = run(root, ['doc.md']);
  assert.strictEqual(ok, true, JSON.stringify(findings));
  assert.strictEqual(counts.checked, 1);
});

test('a reference definition inside a blockquote is found, and marked as quoted', () => {
  const root = tree({ 'doc.md': '> [ref]: docs/guide.md\n', 'docs/guide.md': '# guide\n' });
  const links = extractLinks('> [ref]: docs/guide.md');
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].target, 'docs/guide.md');
  assert.strictEqual(links[0].quoted, true, 'a definition inside a blockquote is in a quotation');
  assert.strictEqual(run(root, ['doc.md']).counts.quoted, 1);
});

test('a blank line inside a link is refused wherever it falls', () => {
  // Between the text and the destination, and between the destination and a title: both end the paragraph.
  assert.deepEqual(extractLinks('[the guide]\n\n(docs/guide.md)'), []);
  assert.deepEqual(extractLinks('[the guide](\n\ndocs/guide.md)'), []);
  assert.deepEqual(extractLinks('[the guide](docs/guide.md\n\n"a title")'), []);
  // One line break is fine in the places markdown allows it.
  assert.strictEqual(extractLinks('[the guide](\ndocs/guide.md)').length, 1);
});

test('a parenthesis must follow the link text immediately to be an inline link', () => {
  assert.deepEqual(extractLinks('[the guide] (docs/guide.md)'), [], 'a space before the paren is not an inline link');
  assert.strictEqual(extractLinks('[the guide](docs/guide.md)').length, 1);
});

test('one unmatched backtick does not leave the rest of the document unmasked', () => {
  const text = 'A stray ` backtick here.\n\nThen ``[example](broken.md)`` inside code.\n';
  assert.deepEqual(extractLinks(text), [], 'the later code span is still closed and hides its link');
});

test('a linked image yields both of its targets', () => {
  const text = 'See [![the logo](logo.png)](home.md).\n';
  // Document order is the order of the opening bracket, so the enclosing link comes first and the image it contains
  // follows - both are real targets and a reference checker should see both.
  assert.deepEqual(extractLinks(text).map((link) => link.target), ['home.md', 'logo.png']);
});

test('a code span does not cross a blank line, so a stray backtick cannot hide links below it', () => {
  // CommonMark example 337: a span may cross a single line break but not a blank line. Without that rule the stray
  // backtick here paired with the equal-length run two paragraphs down and blanked everything between them - so the
  // broken link in the middle was never even seen, which is the direction that hides real problems.
  const text = 'A stray ` here.\n\nA [real](gone.md) link.\n\nAnd another ` later.\n';
  assert.deepEqual(extractLinks(text).map((link) => link.target), ['gone.md']);
  // A span across one line break is still a span, and still hides what is inside it: the rule is a blank line, not
  // every newline, and over-refusing would report links inside code as broken.
  assert.deepEqual(extractLinks('Write `[hidden](x.md)\nacross one\nline` here.\n'), []);
});

test('a quoted title does not cross a blank line, so the construct is not a link', () => {
  assert.deepEqual(extractLinks('[the guide](docs/guide.md "a title\n\ncontinues")'), []);
  assert.strictEqual(
    extractLinks('[the guide](docs/guide.md "a title\ncontinues")').length,
    1,
    'one line break inside a title is allowed, as it is inside a destination',
  );
});

test('a single-quoted HTML attribute is a target too, rather than invisible', () => {
  assert.deepEqual(extractLinks("<a href='doc.md'>the guide</a>").map((link) => link.target), ['doc.md']);
  assert.deepEqual(extractLinks('<img src="pic.png" alt="x">').map((link) => link.target), ['pic.png']);
});

test('an escaped opening bracket is literal text, so one link is not reported twice', () => {
  // The inner `[` used to be treated as an opener as well, and because `](target.md)` follows it the same target was
  // extracted twice - a duplicate in a checker whose whole job is to report each broken reference once.
  assert.deepEqual(extractLinks('A literal \\[bracket\\] then [label\\[inner](target.md).').map((link) => link.target), ['target.md']);
  // Two backslashes are an escaped backslash, so the bracket after them is a real opener and the link is real.
  assert.strictEqual(extractLinks('Text \\\\[label](other.md).').length, 1);
});
