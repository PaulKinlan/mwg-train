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
