import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderMarkdown } from '../src/viewer/pages.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('renderMarkdown renders docs/PIPELINE.md code blocks, blockquotes, headings, lists, and tables', () => {
  const doc = readFileSync(resolve(ROOT, 'docs', 'PIPELINE.md'), 'utf8');
  const html = renderMarkdown(doc);

  // Diagrams must be wrapped in <pre><code>, not paragraphs
  assert.ok(html.includes('<pre><code>[Trainable Multimodal Code Model (e.g. DeepSeek V4.1 Flash / Qwen 2.5 VL)]'), 'diagrams must render in pre code');
  assert.doesNotMatch(html, /<p>```<\/p>/, 'must not emit stray p tags around code fences');

  // Headings
  assert.ok(html.includes('<h1>The mwg-train pipeline</h1>'));
  assert.ok(html.includes('<h2>0. Owner-Directed Model-to-Model Training Lifecycle (Paul, 2026-10-10)</h2>'));
  assert.ok(html.includes('<h3>The 8-Step Closed-Loop Pipeline:</h3>'));

  // Blockquotes
  assert.ok(html.includes('<blockquote><p><strong>mwg-train deterministic baseline</strong>'));

  // Lists
  assert.ok(html.includes('<ol>'));
  assert.ok(html.includes('<li><strong>Select and Qualify a Trainable Model</strong>:'));
  assert.ok(html.includes('<ul>'));

  // Horizontal rules
  assert.ok(html.includes('<hr>'));

  // Tables
  assert.ok(html.includes('<div class="table-scroll" role="region" aria-label="Pipeline table" tabindex="0"><table><tbody>'));
  assert.ok(html.includes('<th>Model Family</th>'));
});

// mwg-train-rsol: the markdown renderer put the captured target straight into `href`, so a document that
// said `[click](javascript:alert(1))` produced a link that executes in the viewer's origin. These tests
// pin both directions: the targets that are legitimate anchors still render as one, and no spelling of an
// executable or local-file scheme survives into an `href`.

test('renderMarkdown renders safe link targets as anchors', () => {
  const html = renderMarkdown([
    '[web](https://example.com/docs/page?q=1&lang=en)',
    '[also web](http://example.com/page)',
    '[root relative](/docs/PIPELINE.md)',
    '[dot relative](./docs/PIPELINE.md)',
    '[parent relative](../README.md)',
    '[anchor](#section-two)',
    // docs/PIPELINE.md links its siblings this way (`vocabulary.md`, `train/UNIFIED-CONCEPTS-EPIC.md`). A bare
    // relative path carries no scheme to execute, so it stays a link rather than silently losing navigation.
    '[bare relative](vocabulary.md)',
  ].join('\n\n'));

  assert.match(html, /<a href="https:\/\/example\.com\/docs\/page\?q=1&amp;lang=en">web<\/a>/);
  assert.match(html, /<a href="http:\/\/example\.com\/page">also web<\/a>/);
  assert.match(html, /<a href="\/docs\/PIPELINE\.md">root relative<\/a>/);
  assert.match(html, /<a href="\.\/docs\/PIPELINE\.md">dot relative<\/a>/);
  assert.match(html, /<a href="\.\.\/README\.md">parent relative<\/a>/);
  assert.match(html, /<a href="#section-two">anchor<\/a>/);
  assert.match(html, /<a href="vocabulary\.md">bare relative<\/a>/);
});

test('renderMarkdown refuses executable and local-file link schemes and keeps the link text', () => {
  // Each entry is a spelling a browser would still act on. `JavaScript:` is the same scheme in another case;
  // `java\tscript:` is the same URL because the URL parser drops tab, LF and CR before reading the scheme; a
  // leading space or control character is stripped by the parser too, so the value the check sees is not the
  // value the browser navigates to. `//evil.example/...` is a scheme-relative URL: it names another origin,
  // not a path inside this viewer. A backslash is a slash to the URL parser in a special URL, so
  // `\\host/path`, `\/host` and `/\host` are that same network-path reference spelled with backslashes.
  // None of them may reach an `href`. (A raw newline cannot appear in a test target here: renderMarkdown is line-based,
  // so a link is never assembled across lines.)
  const refused = [
    'javascript:alert(1)',
    'javascript:alert%281%29',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(document.cookie)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    '\u0000javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'DATA:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox+1',
    'file:///etc/passwd',
    '//evil.example/records/42',
    '\\\\host/path',
    '\\/host',
    '/\\host',
    'mailto:someone@example.com',
  ];
  for (const target of refused) {
    const html = renderMarkdown(`[click](${target})`);
    assert.doesNotMatch(html, /<a /, `a ${JSON.stringify(target)} target must not render as an anchor`);
    assert.doesNotMatch(html, /href=/, `a ${JSON.stringify(target)} target must not reach an href`);
    // `javascript:alert(1)` leaves a stray `)` behind: the link pattern ends at the first close parenthesis,
    // which is the parser's pre-existing limitation and not part of this gate. The text still renders.
    assert.match(html, /<p>click/, `a ${JSON.stringify(target)} target still renders its link text, so the document stays readable`);
  }
  assert.equal(renderMarkdown('[click](javascript:alert%281%29)'), '<p>click</p>', 'a refused link leaves the label and nothing else');

  // An entity in the target is escaped before it reaches the attribute, so the browser decodes it exactly once
  // and the result carries no `:` scheme separator: `javascript&colon;alert(1)` stays a relative path rather
  // than becoming the scheme it names.
  assert.match(renderMarkdown('[click](javascript&colon;alert(1))'), /<a href="javascript&amp;colon;alert\(1">/);
});

test('renderMarkdown keeps docs/PIPELINE.md links as anchors and never emits an executable-scheme href', () => {
  const doc = readFileSync(resolve(ROOT, 'docs', 'PIPELINE.md'), 'utf8');
  const html = renderMarkdown(doc);
  for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
    assert.doesNotMatch(href, /^\s*(?:javascript|data|vbscript|file):/i, `rendered href ${href} carries an executable scheme`);
  }

  // The scheme check alone passes if every link is stripped, which would make the pipeline page unreadable and
  // silently lose the doc's cross-references. Pin the links the doc actually carries, by href and by label.
  const knownLinks = [
    ['train/UNIFIED-CONCEPTS-EPIC.md', 'UNIFIED-CONCEPTS-EPIC.md'],
    ['eval/deepseek-checkpoint-matrix.md', 'checkpoint matrix'],
    ['../src/train/seam.mjs', '<code>src/train/seam.mjs</code>'],
    ['../plan.md', 'plan.md'],
    ['vocabulary.md', 'docs/vocabulary.md'],
  ];
  for (const [href, label] of knownLinks) {
    assert.ok(
      html.includes(`<a href="${href}">${label}</a>`),
      `docs/PIPELINE.md link ${href} must still render as an anchor labelled ${label}`,
    );
  }

  // Every markdown link in the doc becomes one anchor: no target is dropped, and none is duplicated by the
  // label being left behind as well.
  const markdownTargets = [...doc.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target);
  const renderedAnchors = [...html.matchAll(/<a href=/g)];
  assert.equal(renderedAnchors.length, markdownTargets.length, 'every docs/PIPELINE.md markdown link must render as exactly one anchor');
});
