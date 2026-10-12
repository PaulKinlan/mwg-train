/**
 * Pins the SHA-256 prefixes that archetype demo comparison pages print for their boards, and ties each
 * caption to the image the page actually renders.
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
 * The check works from what the page renders, not from the file's bytes:
 *
 *   1. The markup is reduced to rendered text: comments (including an unterminated one, which runs to the end
 *      of the document), the bodies of elements that never render their contents (script, style, template,
 *      noscript), of raw-text elements whose content is text (title, textarea) and of the elements whose
 *      children are fallback content (iframe, object, video, audio, canvas), are not part of a rendering.
 *   2. Elements a browser does not render are masked out of that text, including everything inside them.
 *      `hidden` counts however it is spelled, because it is a boolean attribute whose presence is what
 *      hides - `hidden`, `hidden=""`, `hidden="false"` and `hidden="until-found"` all hide an element - and
 *      an ancestor's `hidden` hides its subtree, so the check walks element nesting rather than inspecting
 *      one tag in isolation. An inline `display:none` is treated the same way.
 *   3. Each comparison page's board images are collected from its own `<img src>` elements. Those are the
 *      boards a reader sees, and they are the ground truth for which files a caption may describe.
 *   4. Each `SHA-256` caption is resolved to a file. A `../x.jpg` caption is relative to the demo directory
 *      and a bare `x.jpg` is relative to the archetype directory - both name the archetype's own board,
 *      which is what the page displays (`<img src="../x.jpg">`) even when the caption omits the `../`. A
 *      caption must name a board the page displays.
 *   5. Every displayed board must be captioned and every caption must describe a displayed board. A family
 *      that has never printed a digest is declared in UNCAPTIONED_BY_DESIGN with a reason, so a page that
 *      loses its captions fails rather than passing vacuously.
 *
 * The prefix itself is recomputed from the committed JPEG, so the image is the single source of truth and a
 * caption cannot agree with a stale record. Four more rules fail closed: every `SHA-256` mention must
 * parse; a shown prefix must be at least MIN_SHOWN hex characters; an image whose source cannot be read is
 * a finding rather than a skip; and a page must display every board its archetype commits, so deleting an
 * image fails instead of shrinking the page towards passing.
 *
 * THE CLAIM, narrowed to what this check actually establishes, because seven review rounds showed the broad
 * version could not be met without an HTML parser:
 *
 *   It pins the captions in the five COMMITTED comparison pages under
 *   `docs/design/archetypes/<family>/demo/compare.html` to the boards those pages display and to the JPEGs the
 *   archetype commits. Markup is read as tags, attribute text and the text between tags, so a pattern that
 *   appears only inside an attribute is not markup, and a raw-text element's content (title, textarea) is
 *   text. It fails closed on markup its tokenizer cannot parse and on an image whose source it cannot read,
 *   so making the input unreadable is not a way to pass.
 *
 * WHAT IT DOES NOT CLAIM: it does not model every element content model, and it does not model layout. An
 * image hidden by a stylesheet or by a class is not detected, and neither is content whose content model the
 * tokenizer does not implement - a `<` inside `<svg><desc>`, `<option>`, `<select>` or foreign-content
 * CDATA. Closing those needs an HTML parser rather than another excluded-element pattern, which is why the
 * broad claim was withdrawn in review round 7: a deliberately crafted page that models its own content is out
 * of scope. What this check is for is the pages this repository commits, read the way a browser reads them,
 * plus failing closed when it cannot read what it is given.
 *
 * ACCESSIBILITY EXPOSURE IS A SEPARATE LIMITATION, not a kind of hiding, and the earlier wording here
 * conflated the two by listing `aria-hidden` beside stylesheets and classes. `aria-hidden` does not visually
 * hide an image: a board carrying it is still rendered, so this check still counts it, and for a check about
 * what a page shows that is the correct answer. Whether a page exposes an image to assistive technology is a
 * different question, and this check does not assess it at all.
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
 * Comparison pages that display boards without any SHA-256 caption, and are not expected to gain one here.
 * Their boards predate the Wave 2 set and their pages never printed a digest, so there is nothing to pin
 * and nothing false to correct. They are named rather than inferred, so a page that loses its captions
 * fails instead of silently joining them; adding captions to them is a separate decision, not this check's.
 */
export const UNCAPTIONED_BY_DESIGN = Object.freeze({
  'account-recovery': 'displays its two boards without digests; no caption has ever been printed',
  'event-registration': 'displays its two boards without digests; no caption has ever been printed',
});

/** Elements that never have children, so an open tag for one does not open a subtree. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** One tag, with whatever attributes it carries, quoted values and all. */
/**
 * One tag, with whatever attributes it carries, quoted values and all. A `<` inside the attribute text ends the
 * attempt: in HTML a `<` starts a new tag, so tolerating one here let a truncated tag swallow its neighbour and
 * defeat the unaccounted-markup guard below.
 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>/g;

/** Attribute names and values, consumed in order so a name inside another attribute's value is not a name. */
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

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

/** `src` in double quotes, single quotes or unquoted, which is the whole of HTML's syntax for it. */
const MENTION = /SHA-256/g;

/** True when an element carries an `open` attribute, whatever its value, as `details` and `dialog` use. */

/**
 * The value of a named attribute, or undefined when the element does not carry that attribute.
 *
 * Attributes are read by NAME rather than by searching the attribute text for a pattern. `src` written inside
 * another attribute's value, as in `title="Example src='step1-grid.jpg'"`, is that attribute's text and not
 * the element's source; searching the whole string found it first and captioned a board the browser never
 * showed (review round 8). The first occurrence wins, which is also the browser's rule for a repeated
 * attribute.
 *
 * @param {string} attributes
 * @param {string} wanted
 * @returns {string|undefined}
 */
function attributeValue(attributes, wanted) {
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(attributes))) {
    if (match[1].toLowerCase() === wanted) return match[2] ?? match[3] ?? match[4] ?? '';
  }
  return undefined;
}

/** True when the element carries the named attribute, whatever its value. */
function hasAttribute(attributes, wanted) {
  return attributeValue(attributes, wanted) !== undefined;
}

/** True when an element is hidden by a boolean attribute or by an inline display:none. */
function hiddenAttributes(attributes) {
  // `hidden` is a boolean attribute: its presence hides the element whatever its value says, which is why
  // `hidden=""`, `hidden="false"` and `hidden="hidden"` all count.
  if (hasAttribute(attributes, 'hidden')) return true;
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(attributes))) {
    if (match[1].toLowerCase() !== 'style') continue;
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (/display\s*:\s*none/i.test(value)) return true;
  }
  return false;
}

/**
 * Removes HTML comments the way the specification defines them: a comment ends at `-->`, and an unterminated
 * one runs to the end of the document. Treating an unterminated `<!--` as ordinary text left everything after
 * it visible to the scanners, so a board and caption past it counted as displayed (review round 5).
 *
 * @param {string} html
 * @returns {string}
 */
export function stripComments(html) {
  let out = '';
  let at = 0;
  for (;;) {
    const open = html.indexOf('<!--', at);
    if (open === -1) {
      out += html.slice(at);
      break;
    }
    out += `${html.slice(at, open)} `;
    const close = html.indexOf('-->', open + 4);
    if (close === -1) break; // unterminated: the rest of the document is comment
    at = close + 3;
  }
  return out;
}

/**
 * The parts of a comparison page a browser renders, with the parts it does not removed.
 *
 * Comments go, and so do the bodies of two kinds of element: those that never render their contents (script,
 * style, template, noscript), raw-text elements whose content is text rather than markup (title, textarea),
 * and those whose children are FALLBACK content, rendered only when the element itself cannot be - iframe,
 * object, video, audio and canvas. An iframe renders its document rather than its children, so a board and
 * its caption inside one are not on screen (review round 5); a title's content is text, so apparent tags
 * inside one are not elements at all (review round 7). `<picture>` is deliberately not in this list: its
 * `<img>` child is what renders.
 *
 * This list is not a content-model implementation and does not claim to be; see the module header for the
 * claim and its limits.
 *
 * @param {string} html
 * @returns {string}
 */
export function renderedText(html) {
  return stripComments(html)
    .replace(/<(script|style|template|noscript|title|textarea|iframe|object|video|audio|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
}

/**
 * The ranges of the given markup that a browser does not render, including everything inside a hidden
 * element. Element nesting is walked rather than individual tags being inspected, because `hidden` on an
 * ancestor hides the subtree - adding it to a card's `<article>` hides the board and its caption together.
 *
 * @param {string} text
 * @returns {Array<[number, number]>} start and end offsets, unordered and possibly overlapping
 */
export function hiddenRanges(text) {
  const ranges = [];
  const open = [];
  TAG.lastIndex = 0;
  let match;
  while ((match = TAG.exec(text))) {
    const [, closing, rawName, attributes, selfClosing] = match;
    const name = rawName.toLowerCase();
    const end = match.index + match[0].length;

    if (closing === '/') {
      // Close the nearest matching element, tolerating stray or unclosed tags the way a browser does.
      for (let i = open.length - 1; i >= 0; i -= 1) {
        if (open[i].name !== name) continue;
        const element = open[i];
        open.length = i;
        if (element.hidden) ranges.push([element.start, end]);
        break;
      }
      continue;
    }

    const hidden = hiddenAttributes(attributes) || open.some((element) => element.hidden);
    // Two elements are not rendered at all unless their markup says otherwise: a <details> shows only its
    // first <summary> until it is open, and a <dialog> is hidden unless open. A board inside either is not on
    // screen, so its subtree is masked whole - which errs towards reporting a board that a reader cannot see
    // than towards passing one that is absent.
    const hiddenByDefault = (name === 'details' || name === 'dialog') && !hasAttribute(attributes, 'open');
    if (VOID_ELEMENTS.has(name) || selfClosing === '/') {
      if (hidden || hiddenByDefault) ranges.push([match.index, end]);
      continue;
    }
    open.push({ name, start: match.index, hidden: hidden || hiddenByDefault });
  }
  // An element left open still hides whatever follows it.
  for (const element of open) {
    if (element.hidden) ranges.push([element.start, text.length]);
  }
  return ranges;
}

/** Replaces the hidden ranges with spaces, keeping every offset in the text where it was. */
export function maskHidden(text) {
  const ranges = hiddenRanges(text);
  if (ranges.length === 0) return text;
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  for (const [start, end] of sorted) {
    if (end <= at) continue;
    out += text.slice(at, Math.max(start, at)) + ' '.repeat(end - Math.max(start, at));
    at = end;
  }
  return out + text.slice(at);
}

/**
 * Tag-like markup in the given text that the tag scanner did not account for.
 *
 * The other guards all assume the scanner can see the markup. This one covers the case where it cannot: a tag
 * with no closing `>`, an attribute value swallowing the rest of the line, anything that leaves a `<` looking
 * like a tag start. Unaccounted markup fails the check rather than being quietly ignored, so the check cannot
 * be made to pass by making its input unreadable.
 *
 * @param {string} text
 * @returns {string[]} the unaccounted fragments, empty when every tag parsed
 */
export function unaccountedMarkup(text) {
  const consumed = new Uint8Array(text.length);
  TAG.lastIndex = 0;
  let match;
  while ((match = TAG.exec(text))) {
    for (let i = match.index; i < match.index + match[0].length; i += 1) consumed[i] = 1;
  }
  const stray = [];
  const tagLike = /<\/?[a-zA-Z][a-zA-Z0-9:-]*/g;
  while ((match = tagLike.exec(text))) {
    if (!consumed[match.index]) stray.push(match[0]);
  }
  return stray;
}

/** The markup a browser renders, with hidden elements masked out of it. */
const visibleMarkup = (html) => maskHidden(renderedText(html));

/**
 * Splits markup into the tokens a browser's lexer sees: tags, and the text between them.
 *
 * This exists because scanning the raw bytes cannot tell an element from an apparent one written inside an
 * attribute value. A page whose only content is an element whose `title` reads
 * `<img src='...'><code>...</code> SHA-256 <code>...</code>` renders a title, but the image and caption
 * scanners both found their patterns inside it and passed a page showing nothing (review round 6). Reading
 * tags and their attributes here means the scanners see what a browser sees, not what the bytes contain.
 *
 * @param {string} text
 * @returns {Array<{ kind: 'tag'|'text', name?: string, closing?: boolean, attributes?: string, raw: string }>}
 */
export function markupTokens(text) {
  const tokens = [];
  let at = 0;
  TAG.lastIndex = 0;
  let match;
  while ((match = TAG.exec(text))) {
    if (match.index > at) tokens.push({ kind: 'text', raw: text.slice(at, match.index) });
    tokens.push({
      kind: 'tag',
      name: match[2].toLowerCase(),
      closing: match[1] === '/',
      attributes: match[3],
      raw: match[0],
    });
    at = match.index + match[0].length;
  }
  if (at < text.length) tokens.push({ kind: 'text', raw: text.slice(at) });
  return tokens;
}

/**
 * The same markup with every tag reduced to its name, so attribute contents cannot masquerade as markup.
 * Captions are read from this: their own `<code>` markers survive, and a `<code>` inside a `title` is gone.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizedMarkup(text) {
  return markupTokens(text)
    .map((token) => (token.kind === 'tag' ? `<${token.closing ? '/' : ''}${token.name}>` : token.raw))
    .join('');
}

/** Resolves a caption's board name the way the page means it, and rejects paths outside the archetype. */
function resolveCaptionBoard(file, archetypeDir, source) {
  const demoDir = path.dirname(file);
  const bare = path.basename(source) === source;
  const candidate = bare ? path.resolve(archetypeDir, source) : path.resolve(demoDir, source);
  if (path.relative(archetypeDir, candidate).startsWith('..')) return null;
  return candidate;
}

/**
 * Collects the board images a comparison page displays, as absolute paths inside its archetype.
 *
 * Every `<img>` a browser renders is examined, not only the ones whose `src` happens to be spelled the way
 * this check first expected. An `<img>` whose source cannot be read, or that names a `.jpg` which is not
 * committed, is a finding: an image missing from this inventory is an image whose caption nothing verifies.
 *
 * @param {{ file: string, html: string, archetypeDir: string }} page
 * @returns {{ boards: string[], findings: string[] }}
 */
export function displayedBoards({ file, html, archetypeDir }) {
  const rel = path.relative(ROOT, file);
  const text = visibleMarkup(html);
  const boards = [];
  const findings = [];
  // The inventory is read from the tokenizer's tags, not from a pattern over the raw text: an apparent
  // `<img>` inside a quoted attribute is text, not an element, and a regex cannot tell them apart.
  for (const token of markupTokens(text)) {
    if (token.kind !== 'tag' || token.name !== 'img' || token.closing) continue;
    const tag = token.raw;
    const src = attributeValue(token.attributes, 'src');
    if (src === undefined) {
      // An <img> with no readable src cannot be pinned, and silently ignoring it is what let a single-quoted
      // page slip through before. Fail closed.
      findings.push(`${rel} carries an image whose source this check cannot read (${tag.trim().slice(0, 60)}); board images must name a .jpg in a readable src attribute`);
      continue;
    }
    const source = src.trim();
    if (source === '') {
      // An empty src names no file: not something to skip as "not a board", because the same rule has to
      // account for every image this check cannot read.
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
  const text = visibleMarkup(html);
  // Captions and their mentions are read from the normalized markup, where attribute contents cannot pose as
  // markup, while the unaccounted-markup guard reads the masked text, which is where unparsed tags show up.
  const scan = normalizedMarkup(text);
  for (const stray of unaccountedMarkup(text)) {
    findings.push(`${rel} contains markup this check cannot account for (${stray}); every tag on a comparison page must parse`);
  }
  const mentions = (scan.match(MENTION) || []).length;
  const { boards, findings: displayFindings } = displayedBoards({ file, html, archetypeDir });
  findings.push(...displayFindings);

  const captioned = new Set();
  const shownFor = new Map();
  let parsed = 0;

  CAPTION.lastIndex = 0;
  let match;
  while ((match = CAPTION.exec(scan))) {
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
    const text = visibleMarkup(html);
    const label = path.relative(repoRoot, file);
    captions += (normalizedMarkup(text).match(CAPTION) || []).length;
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
    console.error(`check:board-captions - FAILED: every board a comparison page renders must carry a caption that matches the committed board.`);
    process.exit(1);
  }
  console.log(`check:board-captions - PASS - checked ${result.captions} caption(s) for ${result.boards} displayed board(s) across ${result.pages} committed comparison page(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
