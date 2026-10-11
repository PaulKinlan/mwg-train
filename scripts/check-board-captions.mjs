/**
 * Pins the SHA-256 prefixes that archetype demo comparison pages print for their boards.
 *
 * `docs/design/archetypes/<family>/demo/compare.html` shows each board beside the live page and
 * captions it with the board's SHA-256 truncated to a short prefix. That page is a consumer of the
 * board digest, and until this check existed nothing verified the prefix it prints: the Wave 2 test
 * compares board bytes against the archetype README and the provenance register, `check:archetype-assets`
 * compares the extracted store against its target, and neither of them reads the demo caption. So a
 * regeneration that re-synced every file those checks know about could still leave this one stale -
 * which is what happened on 2026-10-11, when all ten captions across booking, catalogue and contact-lead
 * were found to be showing digests from earlier generations (bead mwg-train-7x8n).
 *
 * The check recomputes each prefix from the committed JPEG rather than comparing it against any other
 * document, so the committed image is the single source of truth and a caption cannot agree with a stale
 * record. Two rules beyond equality matter, and both fail closed:
 *
 *   - every `SHA-256` mention in the page must parse. A caption this check cannot read is a caption
 *     nothing verifies, so an unparsed mention is a finding rather than a skip.
 *   - a shown prefix must be at least 8 hex characters. A caption truncated to two characters would
 *     pass equality while pinning almost nothing.
 *
 * The page names the board relative to the demo directory (`../step1-grid.jpg`) in the Wave 2 families,
 * and by bare filename (`step1-browse.jpg`) in booking, where the page itself displays
 * `<img src="../step1-browse.jpg">` - so a bare name resolves to the archetype directory, not to `demo/`.
 * Both are accepted, because both name a file the page displays. What is not accepted is a caption
 * resolving outside its own archetype: that is a finding, so this check cannot be widened into an
 * arbitrary-file reader by editing a demo page.
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

const MENTION = /SHA-256/g;

/**
 * Finds every problem with the captions in one comparison page.
 *
 * @param {{ file: string, html: string, archetypeDir: string, label?: string }} page
 * @returns {string[]} one message per finding, empty when the page is fully pinned
 */
export function captionFindings({ file, html, archetypeDir, label = path.relative(ROOT, file) }) {
  const findings = [];
  const rel = label;
  const mentions = (html.match(MENTION) || []).length;
  let parsed = 0;

  CAPTION.lastIndex = 0;
  let match;
  while ((match = CAPTION.exec(html))) {
    parsed += 1;
    const [, source, shown] = match;
    const demoDir = path.dirname(file);

    // Two naming conventions are in use: `../step1-grid.jpg` relative to the demo directory, and a bare
    // `step1-browse.jpg` that the page displays as `../step1-browse.jpg` from the archetype root. Both
    // refer to the same committed board, so both are tried; one that resolves outside the archetype is a
    // finding whichever spelling it used.
    const candidates = [path.resolve(demoDir, source), path.resolve(archetypeDir, source)];
    const inside = candidates.filter((candidate) => !path.relative(archetypeDir, candidate).startsWith('..'));
    const board = inside.find((candidate) => fs.existsSync(candidate));

    if (inside.length === 0) {
      findings.push(`${rel} names ${source}, which is outside its own archetype directory`);
      continue;
    }
    if (!board) {
      findings.push(`${rel} names ${source}, but no such board is committed`);
      continue;
    }
    if (shown.length < MIN_SHOWN) {
      findings.push(`${rel} shows only ${shown.length} hex characters for ${source}; at least ${MIN_SHOWN} are required to pin anything`);
      continue;
    }
    const actual = createHash('sha256').update(fs.readFileSync(board)).digest('hex');
    if (!actual.startsWith(shown)) {
      findings.push(`${rel} shows SHA-256 ${shown}\u2026 for ${source}, but the committed board hashes to ${actual.slice(0, shown.length)}\u2026`);
    }
  }

  if (parsed !== mentions) {
    findings.push(`${rel} mentions SHA-256 ${mentions} time(s) but only ${parsed} caption(s) parsed; a caption this check cannot read is a caption nothing verifies`);
  }
  return findings;
}

/**
 * Runs the check over every archetype demo comparison page.
 *
 * @param {{ repoRoot?: string }} [options]
 * @returns {{ ok: boolean, findings: string[], pages: number, captions: number }}
 */
export function checkBoardCaptions({ repoRoot = ROOT } = {}) {
  const archetypesDir = path.join(repoRoot, 'docs', 'design', 'archetypes');
  const findings = [];
  let pages = 0;
  let captions = 0;

  const families = fs.existsSync(archetypesDir) ? fs.readdirSync(archetypesDir).sort() : [];
  for (const family of families) {
    const archetypeDir = path.join(archetypesDir, family);
    const file = path.join(archetypeDir, 'demo', 'compare.html');
    if (!fs.existsSync(file)) continue;
    pages += 1;
    const html = fs.readFileSync(file, 'utf8');
    captions += (html.match(CAPTION) || []).length;
    findings.push(...captionFindings({ file, html, archetypeDir, label: path.relative(repoRoot, file) }));
  }

  return { ok: findings.length === 0, findings, pages, captions };
}

function main() {
  const result = checkBoardCaptions({ repoRoot: ROOT });
  if (!result.ok) {
    for (const finding of result.findings) console.error(`check:board-captions - FAILED: ${finding}`);
    console.error(`check:board-captions - FAILED: every board digest printed in a demo comparison page must match the committed board.`);
    process.exit(1);
  }
  console.log(`check:board-captions - PASS - checked ${result.captions} caption(s) in ${result.pages} demo comparison page(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
