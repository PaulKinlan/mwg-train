/**
 * The board-caption check's own tests.
 *
 * The check exists because `demo/compare.html` was a board-digest consumer that no check read: on
 * 2026-10-11 all ten captions across booking, catalogue and contact-lead were found to be showing digests
 * from earlier generations while every file the existing checks know about was in step (bead
 * mwg-train-7x8n). A check like this only earns its place if its failure paths work, so every rule is
 * driven here with a page that breaks exactly that rule - including the three that exist to stop the check
 * passing vacuously or against the wrong file:
 *
 *   - a duplicate board beside the demo must not satisfy a caption for the board the page displays,
 *   - a page whose captions were all removed must fail rather than pass with nothing to compare,
 *   - and the command line must be exercised against a failing fixture, not only against the good repo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPTION, UNCAPTIONED_BY_DESIGN, checkBoardCaptions, captionFindings, renderedText } from '../scripts/check-board-captions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'scripts', 'check-board-captions.mjs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A board whose bytes are arbitrary: the check hashes bytes, it does not decode the image. */
const BOARD = Buffer.from('not-a-real-jpeg, but the check only hashes bytes');
const OTHER = Buffer.from('a second board, with different bytes, to stand in for a duplicate');

/** The catalogue/contact-lead caption form. A leading `../` is tolerated, since the helper adds one. */
const wave2Caption = (shown, board = 'step1-grid.jpg') =>
  `<p class="comparison-source">Board <code>../${board.replace(/^\.\.\//, '')}</code> (1376 \u00d7 768, SHA-256 <code>${shown}</code>) &middot; live page <code>index.html</code></p>`;

/** The booking form, which uses three full stops and prints a bare filename. */
const bookingCaption = (shown, board = 'step1-browse.jpg') =>
  `<p class="card-subtitle">Source: <code>${board}</code> &bull; SHA-256: <code>${shown}</code></p>`;

/**
 * Writes a throwaway repo holding one archetype: a displayed board at the archetype root, an optional
 * duplicate inside `demo/`, and a comparison page carrying whatever img and caption markup is asked for.
 */
function fixture({ family = 'demo-family', board = 'step1-grid.jpg', extraFiles = {}, html } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'board-captions-'));
  const archetypeDir = join(root, 'docs', 'design', 'archetypes', family);
  mkdirSync(join(archetypeDir, 'demo'), { recursive: true });
  writeFileSync(join(archetypeDir, board), BOARD);
  for (const [name, bytes] of Object.entries(extraFiles)) {
    mkdirSync(dirname(join(archetypeDir, name)), { recursive: true });
    writeFileSync(join(archetypeDir, name), bytes);
  }
  const file = join(archetypeDir, 'demo', 'compare.html');
  writeFileSync(file, html);
  return { root, family, archetypeDir, file };
}

/** A realistic page: the img the reader sees, plus the caption that describes it. */
const page = (img, caption) => `<div class="comparison">\n  <img src="${img}" alt="board">\n  ${caption}\n</div>\n`;

const withFixture = (options, run) => {
  const holder = fixture(options);
  try {
    return run(holder);
  } finally {
    rmSync(holder.root, { recursive: true, force: true });
  }
};

test('a page whose caption matches the board it displays passes, in both forms', () => {
  const prefix = sha256(BOARD).slice(0, 10);
  const wave2 = withFixture(
    { html: page('../step1-grid.jpg', wave2Caption(`${prefix}\u2026`, '../step1-grid.jpg')) },
    (h) => captionFindings({ file: h.file, html: page('../step1-grid.jpg', wave2Caption(`${prefix}\u2026`, '../step1-grid.jpg')), archetypeDir: h.archetypeDir }),
  );
  const booking = withFixture(
    { board: 'step1-browse.jpg', html: page('../step1-browse.jpg', bookingCaption(`${prefix}...`)), },
    (h) => captionFindings({ file: h.file, html: page('../step1-browse.jpg', bookingCaption(`${prefix}...`)), archetypeDir: h.archetypeDir }),
  );
  assert.deepEqual(wave2, []);
  assert.deepEqual(booking, []);
});

test('a caption showing a stale prefix is a finding that names both digests', () => {
  withFixture({ html: page('../step1-grid.jpg', wave2Caption('deadbeef00\u2026', '../step1-grid.jpg')) }, (holder) => {
    const html = page('../step1-grid.jpg', wave2Caption('deadbeef00\u2026', '../step1-grid.jpg'));
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.length, 1);
    assert.match(findings[0], /shows SHA-256 deadbeef00\u2026/);
    assert.match(findings[0], new RegExp(sha256(BOARD).slice(0, 10)));
  });
});

test('a duplicate board beside the demo cannot satisfy a caption for the displayed board', () => {
  // The page displays ../step1-browse.jpg. A second copy at demo/step1-browse.jpg with different bytes
  // must not be the file the caption is checked against: the caption has to describe what the page shows.
  const shown = sha256(OTHER).slice(0, 10);
  const html = page('../step1-browse.jpg', bookingCaption(`${shown}...`));
  withFixture({ board: 'step1-browse.jpg', extraFiles: { 'demo/step1-browse.jpg': OTHER }, html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.length, 1, `expected the stale caption to be caught, got: ${findings.join(' | ')}`);
    assert.match(findings[0], new RegExp(sha256(BOARD).slice(0, 10)));
  });
});

test('a page that displays a board with no caption at all fails rather than passing vacuously', () => {
  const html = page('../step1-grid.jpg', '<p>No digest printed here.</p>');
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.length, 1);
    assert.match(findings[0], /displays step1-grid\.jpg but prints no SHA-256 caption/);
  });
});

test('a family declared uncaptioned is allowed to display boards without captions', () => {
  const html = page('../step1-grid.jpg', '<p>No digest printed here.</p>');
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir, captionsRequired: false });
    assert.deepEqual(findings, []);
  });
});

test('the exemptions are the two families measured as never printing a digest', () => {
  assert.deepEqual(Object.keys(UNCAPTIONED_BY_DESIGN).sort(), ['account-recovery', 'event-registration']);
  for (const reason of Object.values(UNCAPTIONED_BY_DESIGN)) assert.ok(reason.length > 20, 'each exemption carries its reason');
});

test('a caption for a board the page does not display is a finding', () => {
  const prefix = sha256(BOARD).slice(0, 10);
  const html = `${page('../step1-grid.jpg', '')}${wave2Caption(`${prefix}\u2026`, '../step2-cart.jpg')}`;
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.ok(findings.some((f) => /does not display/.test(f)), findings.join(' | '));
  });
});

test('a caption naming a board that is not committed is reported once', () => {
  const html = page('../step9-missing.jpg', wave2Caption(`${sha256(BOARD).slice(0, 10)}\u2026`, '../step9-missing.jpg'));
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.length, 1, findings.join(' | '));
    assert.match(findings[0], /no such board is committed/);
  });
});

test('a SHA-256 mention that cannot be parsed is a finding rather than a silent skip', () => {
  const html = page('../step1-grid.jpg', '<p>Board <code>../step1-grid.jpg</code> (SHA-256 <code>not-a-hash</code>)</p>');
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    // Two true statements, both wanted: the mention did not parse, and the displayed board is therefore
    // uncaptioned. The first is the one this rule exists for.
    assert.ok(findings.some((f) => /mentions SHA-256 1 time\(s\) but only 0 caption\(s\) parsed/.test(f)), findings.join(' | '));
    assert.ok(findings.some((f) => /displays step1-grid\.jpg but prints no SHA-256 caption/.test(f)), findings.join(' | '));
  });
});

test('a prefix too short to pin anything is a finding even when it matches', () => {
  const short = sha256(BOARD).slice(0, 4);
  const html = page('../step1-grid.jpg', wave2Caption(`${short}\u2026`, '../step1-grid.jpg'));
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.length, 1);
    assert.match(findings[0], /only 4 hex characters/);
  });
});

test('a caption resolving outside its own archetype is a finding', () => {
  const html = page('../step1-grid.jpg', wave2Caption(`${sha256(BOARD).slice(0, 10)}\u2026`, '../../../authoring/secret.jpg'));
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.ok(findings.some((f) => /outside its own archetype directory/.test(f)), findings.join(' | '));
  });
});

test('the real repository passes, and every captioned page is fully paired', () => {
  const result = checkBoardCaptions({ repoRoot: ROOT });
  assert.ok(result.pages >= 3, `expected at least three comparison pages, found ${result.pages}`);
  assert.ok(result.captions >= 10, `expected at least ten captions, found ${result.captions}`);
  assert.ok(result.boards >= 12, `expected at least twelve displayed boards, found ${result.boards}`);
  assert.deepEqual(result.findings, [], `committed captions must match the committed boards:\n${result.findings.join('\n')}`);
});

test('the command line fails with a diagnostic when pointed at a repository with a stale caption', () => {
  withFixture({ html: page('../step1-grid.jpg', wave2Caption('deadbeef00\u2026', '../step1-grid.jpg')) }, (holder) => {
    let status = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [CHECK, '--root', holder.root], { encoding: 'utf8' });
    } catch (error) {
      status = error.status;
      stderr = error.stderr;
    }
    assert.equal(status, 1, 'a stale caption must make the command line exit non-zero');
    assert.match(stderr, /check:board-captions - FAILED: .*shows SHA-256 deadbeef00/);
    assert.match(stderr, /check:board-captions - FAILED: every board a comparison page displays/);
  });
});

test('the command line passes with a count when the repository is in step', () => {
  const stdout = execFileSync(process.execPath, [CHECK], { cwd: ROOT, encoding: 'utf8' });
  assert.match(stdout, /check:board-captions - PASS - checked \d+ caption\(s\) for \d+ displayed board\(s\) across \d+ demo comparison page\(s\)/);
});

test('a single-quoted image source is read, not skipped', () => {
  // The hole this closes: only double quotes were recognised, so a page could spell its images with single
  // quotes, lose its captions, and pass with an empty inventory. The caption here is removed entirely.
  const html = `<div class="comparison">\n  <img src='../step1-grid.jpg' alt="board">\n  <p>No digest printed here.</p>\n</div>\n`;
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.ok(findings.some((f) => /displays step1-grid\.jpg but prints no SHA-256 caption/.test(f)), findings.join(' | '));
  });
});

test('an unquoted image source is read and paired with its caption', () => {
  const prefix = sha256(BOARD).slice(0, 10);
  const html = `<div>\n  <img src=../step1-grid.jpg alt="board">\n  ${wave2Caption(`${prefix}\u2026`)}\n</div>\n`;
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.deepEqual(findings, []);
  });
});

test('an image whose source cannot be read is a finding, not a silent skip', () => {
  const html = `<div>\n  <img src="" alt="board">\n  <img alt="no source at all">\n</div>\n`;
  withFixture({ html }, (holder) => {
    const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
    assert.equal(findings.filter((f) => /cannot read/.test(f)).length, 2, findings.join(' | '));
  });
});

test('a page that stops displaying a committed board is a finding', () => {
  // Same hole one level up: delete the <img> and the board leaves the inventory. The page must show every
  // board its archetype commits, so removal fails rather than shrinking towards passing.
  const html = `<div><p>This page displays nothing now.</p></div>\n`;
  withFixture({ html }, (holder) => {
    const result = checkBoardCaptions({ repoRoot: holder.root });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => /does not display step1-grid\.jpg, which its archetype commits/.test(f)), result.findings.join(' | '));
  });
});

test('a commented-out board and caption do not satisfy the check', () => {
  // Review round 3: markup wrapped in an HTML comment is present in the file and absent from the rendering.
  // Both inventories are built from rendered text now, so this page displays nothing and must fail.
  const prefix = sha256(BOARD).slice(0, 10);
  const html = `<div>\n  <!-- removed for now\n  <img src="../step1-grid.jpg" alt="board">\n  ${wave2Caption(`${prefix}\u2026`)}\n  -->\n</div>\n`;
  withFixture({ html }, (holder) => {
    // Nothing is rendered, so there are no boards and no captions: the finding belongs to the page-level rule
    // that a comparison page must display every board its archetype commits, which is what catches this.
    const result = checkBoardCaptions({ repoRoot: holder.root });
    assert.equal(result.ok, false, 'a fully commented-out board must fail the page check');
    assert.equal(result.findings.filter((f) => /does not display step1-grid\.jpg/.test(f)).length, 1, result.findings.join(' | '));
    assert.equal(result.captions, 0, 'a commented-out caption must not be counted');
    assert.equal(result.boards, 0, 'a commented-out image must not be counted as displayed');
  });
});

test('markup inside script, style, template and noscript bodies is not rendered content', () => {
  const prefix = sha256(BOARD).slice(0, 10);
  const pair = `<img src="../step1-grid.jpg">${wave2Caption(`${prefix}\u2026`)}`;
  for (const [open, close] of [['<script>', '</script>'], ['<style>', '</style>'], ['<template>', '</template>'], ['<noscript>', '</noscript>']]) {
    const html = `<div>${open}${pair}${close}</div>`;
    withFixture({ html }, (holder) => {
      // Same shape as the commented-out case: the pair leaves the inventories, so the page-level rule that
      // every committed board is displayed is what reports it.
      const result = checkBoardCaptions({ repoRoot: holder.root });
      assert.equal(result.ok, false, `${open} content must not satisfy the page check`);
      assert.equal(result.captions, 0, `${open}: the caption must not be counted`);
      assert.equal(result.boards, 0, `${open}: the image must not be counted as displayed`);
    });
  }
});

test('an image hidden by its own markup is not displayed', () => {
  const prefix = sha256(BOARD).slice(0, 10);
  for (const img of ['<img hidden src="../step1-grid.jpg">', '<img style="display:none" src="../step1-grid.jpg">']) {
    const html = `<div>${img}${wave2Caption(`${prefix}\u2026`)}</div>`;
    withFixture({ html }, (holder) => {
      const findings = captionFindings({ file: holder.file, html, archetypeDir: holder.archetypeDir });
      assert.ok(findings.some((f) => /does not display|but prints no SHA-256 caption|does not display/.test(f)), `${img}: ${findings.join(' | ')}`);
    });
  }
});

test('renderedText removes comments and non-rendered element bodies, and keeps ordinary markup', () => {
  const html = `<p>a</p><!-- <p>b</p> --><script>const x = '<p>c</p>';</script><style>/* <p>d</p> */</style><p>e</p>`;
  const text = renderedText(html);
  assert.match(text, /<p>a<\/p>/);
  assert.match(text, /<p>e<\/p>/);
  assert.doesNotMatch(text, /b<\/p>|c<\/p>|d<\/p>/);
});

test('the exported regex only pairs a filename with a digest in the same element', () => {
  const html = `<p>Board <code>../step1-grid.jpg</code></p>\n<p>SHA-256 <code>0123456789\u2026</code></p>`;
  CAPTION.lastIndex = 0;
  assert.equal(CAPTION.exec(html), null);
});
