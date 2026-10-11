/**
 * Pins the SHA-256 prefixes that archetype demo comparison pages print for their boards, and ties each
 * caption to the image the page actually displays.
 *
 * `docs/design/archetypes/<family>/demo/compare.html` shows each board beside the live page and captions it
 * with the board's SHA-256 truncated to a short prefix. That page is a consumer of the board digest, and
 * until this check existed nothing verified what it printed: the Wave 2 test compares board bytes against
 * the archetype README and the provenance register, `check:archetype-assets` compares the extracted store
 * against its target, and neither reads the caption. So a regeneration that re-synced every file those
 * checks know about could still leave this one stale - which is what happened on 2026-10-11, when all ten
 * captions across booking, catalogue and contact-lead were found to be showing earlier generations'
 * digests (bead mwg-train-7x8n).
 *
 * The check works from what the page displays, not from what a caption says:
 *
 *   1. Each comparison page's board images are collected from its own `<img src>` elements. Those are the
 *      boards a reader sees, and they are the ground truth for which files a caption may describe.
 *   2. Each `SHA-256` caption is resolved to a file. A `../x.jpg` caption is relative to the demo
 *      directory and a bare `x.jpg` is relative to the archetype directory - both name the archetype's own
 *      board, which is what the page displays (`<img src="../x.jpg">`) even when the caption omits the
 *      `../`. The first draft tried the demo directory first for both spellings, which meant a duplicate
 *      `demo/x.jpg` could satisfy the caption while the displayed board's caption stayed stale; a caption
 *      now has to name a file the page displays.
 *   3. Every displayed board must be captioned, and every caption must describe a displayed board. A page
 *      that displays boards without captions at all is declared in UNCAPTERED_BY_DESIGN with a reason, so a
 *      page that loses all of its captions fails rather than passing vacuously.
 *
 * The prefix itself is recomputed from the committed JPEG, so the image is the single source of truth and a
 * caption cannot agree with a stale record. Three more rules fail closed: every `SHA-256` mention must
 * parse (a caption this check cannot read is a caption nothing verifies); a shown prefix must be at least
 * MIN_SHOWN hex characters; and a caption resolving outside its own archetype is a finding, so the check
 * cannot be widened into an arbitrary-file reader by editing a demo page.
 *
 * Everything here is offline: file reads and hashing only.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The shortest prefix a caption may show. Ten and twelve characters are what the repo uses. */
export const MIN_SHOWN = 8;

/**
 * The parts of a comparison page a browser renders, with the parts it does not removed.
 *
 * Both inventories are built from this rather than from the file's raw bytes, because markup that is present
 * but not rendered used to satisfy the check: a board and its correct caption wrapped in an HTML comment were
 * found by both regexes, hashed correctly, and counted as displayed while a reader saw nothing (review
 * round 3). Comments, and the bodies of script, style, template, noscript and textarea elements, are removed
 * here. What remains out of scope is honest rather than implied: this is text, not layout, so an image hidden
 * by a stylesheet, by a class or by `aria-hidden` is not detected - a browser-driven check would be needed for
 * that, and these pages are static markup whose visibility is expressed in the markup itself.
 *
 * @param {string} html
 * @returns {string}
 */
export function renderedText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|noscript|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
}

/** True when the element's own markup keeps it out of the rendering, which is as far as a text scan reaches. */
function hiddenByMarkup(tag) {
  if (/\shidden(?=[\s/>])/i.test(tag)) return true;
  return /style\s*=\s*("[^"]*display\s*:\s*none[^"]*"|'[^']*display\s*:\s*none[^']*')/i.test(tag);
}

/**
 * Comparison pages that display boards without any SHA-256 caption, and are not expected to gain one here.
 * Their boards predate the Wave 2 set and their pages never printed a digest, so there is nothing to pin
 * and nothing false to correct. They are named rather than inferred, so a page that loses its captions
 * fails instead of silently joining them; adding captions to them is a separate decision, not this check's.
 */
export const UNCAPTIONED_BY_DESIGN = Object.freeze({
  'account-recovery': 'displays its two boards without digests; no caption has ever been printed',
  'event-registration': 'displays its two boards without digests; no caption has ever been printed',
});

/**
 * Both caption forms in use, matched as one paragraph: the board filename, then the truncated digest.
 * catalogue/contact-lead: `Board <code>../step1-grid.jpg</code> (1376 x 768, SHA-256 <code>456797ff0d...</code>)`
 * booking:                `Source: <code>step1-browse.jpg</code> &bull; SHA-256: <code>28a0a800a9...</code>`
 * The ellipsis is written as a single character in some families and three full stops in others.
 *
 * The hex run is deliberately allowed to be as short as one character so that a too-short caption matches
 * and is reported by MIN_SHOWN below, with a message that says what is wrong. Requiring eight characters
 * here instead would make that rule unreachable and report a short caption as an unreadable one.
 */
export const CAPTION = /<code>([^<]+\.jpg)<\/code>[^<]*?SHA-256:?\s*<code>([0-9a-f]{1,64})(?:\.\.\.|\u2026)<\/code>/g;

/**
 * Every `<img>` tag a comparison page carries, whatever its source spelling. Anything this cannot read a
 * source from is reported rather than skipped: an image that disappears from the inventory takes its
 * caption with it, which is how a page can lose content and still pass.
 */
const IMG_TAG = /<img\b[^>]*>/gi;

/** `src` in double quotes, single quotes or unquoted, which is the whole of HTML's syntax for it. */
const SRC = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

const MENTION = /SHA-256/g;

/** Resolves a caption's board name the way the page means it, and rejects paths outside the archetype. */
function resolveCaptionBoard(file, archetypeDir, source) {
  const demoDir = path.dirname(file);
  const relativeToDemo = path.resolve(demoDir, source);
  const bare = path.basename(source) === source;
  const candidate = bare ? path.resolve(archetypeDir, source) : relativeToDemo;
  if (path.relative(archetypeDir, candidate).startsWith('..')) return null;
  return candidate;
}

/**
 * Collects the board images a comparison page displays, as absolute paths inside its archetype.
 *
 * Every `<img>` on the page is examined, not only the ones whose `src` happens to be spelled the way this
 * check first expected. An `<img>` whose source cannot be read, or that names a `.jpg` which is not
 * committed, is a finding: an image missing from this inventory is an image whose caption nothing verifies.
 *
 * @param {{ file: string, html: string, archetypeDir: string }} page
 * @returns {{ boards: string[], findings: string[] }}
 */
export function displayedBoards({ file, html, archetypeDir }) {
  const rel = path.relative(ROOT, file);
  const text = renderedText(html);
  const boards = [];
  const findings = [];
  IMG_TAG.lastIndex = 0;
  let match;
  while ((match = IMG_TAG.exec(text))) {
    const tag = match[0];
    if (hiddenByMarkup(tag)) continue; // the element is in the file but not in the rendering
    const src = SRC.exec(tag);
    if (!src) {
      // An <img> with no readable src is not a board this check can pin, and silently ignoring it is what
      // let a single-quoted page slip through before. Fail closed.
      findings.push(`${rel} carries an image whose source this check cannot read (${tag.trim().slice(0, 60)}); board images must name a .jpg in a readable src attribute`);
      continue;
    }
    const source = (src[1] ?? src[2] ?? src[3] ?? '').trim();
    if (source === '') {
      // An <img> whose src is empty or whitespace names no file at all: not something to skip as "not a
      // board", because the same rule has to catch every image this check cannot account for.
      findings.push(`${rel} carries an image whose source this check cannot read (${tag.trim().slice(0, 60)}); board images must name a .jpg in a readable src attribute`);
      continue;
    }
    if (!/\.jpe?g$/i.test(source)) continue; // not a reference board: live pages and favicons are not pinned here
    const board = path.resolve(path.dirname(file), source);
    if (path.relative(archetypeDir, board).startsWith('..')) {
      findings.push(`${rel} displays ${source}, which is outside its own archetype directory`);
      continue;
    }
    if (!boards.includes(board)) boards.push(board);
    if (!fs.existsSync(board)) {
      // Still recorded as displayed, so the caption that describes it pairs up and the missing file is
      // reported once rather than also looking like a caption for a board the page does not show.
      findings.push(`${rel} displays ${source}, but no such board is committed`);
    }
  }
  return { boards, findings };
}

/**
 * The boards an archetype has committed, so a page can be held to showing all of them.
 *
 * This closes the other half of the same hole: removing an <img> from a page used to remove the board from
 * the inventory, and a page with nothing on it passed. A comparison page exists to show its boards, so every
 * committed board must appear - which also means deleting one from the page fails rather than passing.
 */
export function committedBoards(archetypeDir) {
  return fs.readdirSync(archetypeDir).filter((name) => /\.jpe?g$/i.test(name)).map((name) => path.join(archetypeDir, name));
}

/**
 * Finds every problem with the captions in one comparison page.
 *
 * @param {{ file: string, html: string, archetypeDir: string, label?: string, captionsRequired?: boolean }} page
 * @returns {string[]} one message per finding, empty when the page is fully pinned
 */
export function captionFindings({ file, html, archetypeDir, label = path.relative(ROOT, file), captionsRequired = true }) {
  const findings = [];
  const rel = label;
  const text = renderedText(html);
  const mentions = (text.match(MENTION) || []).length;
  const { boards, findings: displayFindings } = displayedBoards({ file, html, archetypeDir });
  findings.push(...displayFindings);

  const captioned = new Set();
  const shownFor = new Map();
  let parsed = 0;

  CAPTION.lastIndex = 0;
  let match;
  while ((match = CAPTION.exec(text))) {
    parsed += 1;
    const [, source, shown] = match;
    const board = resolveCaptionBoard(file, archetypeDir, source);

    if (board === null) {
      findings.push(`${rel} names ${source}, which is outside its own archetype directory`);
      continue;
    }
    if (!boards.includes(board)) {
      findings.push(`${rel} captions ${source}, which the page does not display; a caption must describe a board that is shown`);
      continue;
    }
    if (captioned.has(board)) {
      findings.push(`${rel} captions ${source} more than once`);
      continue;
    }
    captioned.add(board);
    shownFor.set(board, shown);
  }

  if (parsed !== mentions) {
    findings.push(`${rel} mentions SHA-256 ${mentions} time(s) but only ${parsed} caption(s) parsed; a caption this check cannot read is a caption nothing verifies`);
  }

  for (const board of boards) {
    const source = path.relative(archetypeDir, board);
    // A family that has never printed a digest is allowed to keep printing none - but only while it prints
    // none. As soon as a page carries one caption, every board it displays needs one, so a page that loses
    // some or all of its captions fails instead of shrinking quietly towards passing.
    if (!captioned.has(board)) {
      if (captionsRequired || captioned.size > 0) {
        findings.push(`${rel} displays ${source} but prints no SHA-256 caption for it`);
      }
      continue;
    }
    const shown = shownFor.get(board);
    if (shown.length < MIN_SHOWN) {
      findings.push(`${rel} shows only ${shown.length} hex characters for ${source}; at least ${MIN_SHOWN} are required to pin anything`);
      continue;
    }
    // A missing board was already reported when the page's images were collected, and its caption still
    // pairs with it, so there is nothing to hash.
    if (!fs.existsSync(board)) continue;
    const actual = createHash('sha256').update(fs.readFileSync(board)).digest('hex');
    if (!actual.startsWith(shown)) {
      findings.push(`${rel} shows SHA-256 ${shown}\u2026 for ${source}, but the committed board hashes to ${actual.slice(0, shown.length)}\u2026`);
    }
  }

  return findings;
}

/**
 * Runs the check over every archetype demo comparison page.
 *
 * @param {{ repoRoot?: string }} [options]
 * @returns {{ ok: boolean, findings: string[], pages: number, captions: number, boards: number }}
 */
export function checkBoardCaptions({ repoRoot = ROOT } = {}) {
  const archetypesDir = path.join(repoRoot, 'docs', 'design', 'archetypes');
  const findings = [];
  let pages = 0;
  let captions = 0;
  let boards = 0;

  const families = fs.existsSync(archetypesDir) ? fs.readdirSync(archetypesDir).sort() : [];
  for (const family of families) {
    const archetypeDir = path.join(archetypesDir, family);
    const file = path.join(archetypeDir, 'demo', 'compare.html');
    if (!fs.existsSync(file)) continue;
    pages += 1;
    const html = fs.readFileSync(file, 'utf8');
    const text = renderedText(html);
    const label = path.relative(repoRoot, file);
    captions += (text.match(CAPTION) || []).length;
    const { boards: displayed } = displayedBoards({ file, html, archetypeDir });
    boards += displayed.length;
    // A comparison page exists to show its archetype's boards, so every committed board must be on it.
    // Without this, deleting an <img> would remove the board from the inventory and shrink the page
    // towards passing - the same hole as a caption that cannot be read.
    for (const committed of committedBoards(archetypeDir)) {
      if (!displayed.includes(committed)) {
        findings.push(`${label} does not display ${path.basename(committed)}, which its archetype commits`);
      }
    }
    findings.push(...captionFindings({
      file,
      html,
      archetypeDir,
      label,
      captionsRequired: !(family in UNCAPTIONED_BY_DESIGN),
    }));
  }

  return { ok: findings.length === 0, findings, pages, captions, boards };
}

/** Reads `--root <dir>` so the command line can be pointed at a fixture by its own tests. */
function rootFrom(argv) {
  const at = argv.indexOf('--root');
  if (at !== -1 && argv[at + 1]) return path.resolve(argv[at + 1]);
  return ROOT;
}

function main() {
  const result = checkBoardCaptions({ repoRoot: rootFrom(process.argv.slice(2)) });
  if (!result.ok) {
    for (const finding of result.findings) console.error(`check:board-captions - FAILED: ${finding}`);
    console.error(`check:board-captions - FAILED: every board a comparison page displays must carry a caption that matches the committed board.`);
    process.exit(1);
  }
  console.log(`check:board-captions - PASS - checked ${result.captions} caption(s) for ${result.boards} displayed board(s) across ${result.pages} demo comparison page(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
