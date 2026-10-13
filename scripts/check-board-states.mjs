/**
 * Every reference board on disk must be classified in docs/provenance/assets/board-states.json.
 *
 * The cross-arm comparator compares a rendered arm against the boards in
 * `docs/design/archetypes/<archetype>/step*.jpg`, and a board is only comparable if something can render the
 * state it depicts. `captureSignature` can reach any root-relative path (mwg-train-bosi), but nothing in the
 * repository associated a board with a path: the boards are named for what they show and most archetypes have no
 * demo at all, so an instrument that assumed a naming convention would compare against the wrong page and report
 * it as a state mismatch. The association is therefore authored, in one file, and this check is what keeps that
 * file honest in both directions (mwg-train-elx3).
 *
 * It fails on:
 *   - a board file on disk that the mapping does not mention, so adding a board without classifying it fails
 *     rather than silently leaving it uncomparable;
 *   - a mapping entry with no board file behind it, so deleting or renaming a board cannot leave a mapping that
 *     describes something other than what exists;
 *   - a non-null `path` that is not root-relative, since captureSignature refuses those and a comparator that
 *     passed one would die rather than report;
 *   - a null entry without a non-empty `source`, because an unexplained gap is indistinguishable from an
 *     oversight, and the whole point of the nulls here is that they are deliberate;
 *   - a `drive` block that could not produce a state: no action to take, a non-string selector, or an
 *     `expectText` that is not a string. A drive is how a state with NO path is captured (mwg-train-mr6t), and
 *     a malformed one fails as a capture with no state rather than as a bad entry, which is much harder to read.
 *
 * A `drive` entry must have `path: null`: a drive means the state is reached by acting on a page, and a board
 * that also claimed a path would be describing two different things with one entry.
 *
 * It does NOT judge whether a path is the RIGHT path - only a running capture can answer that - so a mapping
 * entry is a claim by the author, and the comparator is where it is tested.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ARCHETYPES_DIR = join(ROOT, 'docs/design/archetypes');
const MAPPING_PATH = join(ROOT, 'docs/provenance/assets/board-states.json');
const BOARD = /^step\d+[a-z0-9-]*\.jpg$/;

/** Every board file in the tree, keyed by archetype. Derived from disk, never from the mapping. */
export function boardsOnDisk(dir = ARCHETYPES_DIR) {
  const out = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const files = readdirSync(join(dir, entry.name)).filter((name) => BOARD.test(name)).sort();
    if (files.length) out[entry.name] = files;
  }
  return out;
}

/** Pure comparison, so the test does not need the real tree. */
export function boardStateFindings({ boards, mapping }) {
  const findings = [];
  for (const [archetype, files] of Object.entries(boards)) {
    const mapped = mapping[archetype] ?? {};
    for (const file of files) {
      const entry = mapped[file];
      if (!entry) {
        findings.push({ code: 'BOARD_UNMAPPED', archetype, board: file, message: `board ${archetype}/${file} has no entry in board-states.json, so nothing knows which state it depicts or which path renders it` });
        continue;
      }
      if (entry.path !== null) {
        if (typeof entry.path !== 'string' || !entry.path.startsWith('/') || entry.path.startsWith('//')) {
          findings.push({ code: 'PATH_NOT_ROOT_RELATIVE', archetype, board: file, message: `${archetype}/${file} maps to ${JSON.stringify(entry.path)}, which is not a root-relative path; captureSignature refuses it and the comparator would die instead of reporting` });
        }
      } else if (typeof entry.source !== 'string' || entry.source.trim() === '') {
        findings.push({ code: 'NULL_UNEXPLAINED', archetype, board: file, message: `${archetype}/${file} maps to null without a source, so an unexplained gap is indistinguishable from an oversight` });
      }
      if (entry.drive !== undefined) {
        findings.push(...driveFindings({ archetype, board: file, entry }));
      }
    }
    for (const file of Object.keys(mapped)) {
      if (!files.includes(file)) {
        findings.push({ code: 'MAPPING_WITHOUT_BOARD', archetype, board: file, message: `${archetype}/${file} is mapped but no such board file exists on disk` });
      }
    }
  }
  for (const [archetype, mapped] of Object.entries(mapping)) {
    if (archetype.startsWith('_')) continue;
    if (!boards[archetype] && Object.keys(mapped).length) {
      findings.push({ code: 'MAPPING_WITHOUT_ARCHETYPE', archetype, board: null, message: `${archetype} is mapped but has no board files on disk` });
    }
  }
  return findings;
}

export function loadMapping(path = MAPPING_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * The contract for a `drive` block, checked here so a malformed one is a finding about the entry rather than a
 * confusing capture failure. Kept separate from the loop above because the rules are about the block itself.
 */
export function driveFindings({ archetype, board, entry }) {
  const findings = [];
  const at = `${archetype}/${board}`;
  const drive = entry.drive;
  if (drive === null || typeof drive !== 'object' || Array.isArray(drive)) {
    findings.push({ code: 'DRIVE_NOT_AN_OBJECT', archetype, board, message: `${at} has drive ${JSON.stringify(drive)}, which is not an object describing how to reach the state` });
    return findings;
  }
  if (entry.path !== null) {
    findings.push({ code: 'DRIVE_WITH_PATH', archetype, board, message: `${at} has both a path (${JSON.stringify(entry.path)}) and a drive; a driven state is reached by acting on a page, so its path must be null and the drive names where it starts` });
  }
  const { fill = null, submit = null, expectText = null, startPath = undefined } = drive;
  if (fill === null && submit === null) {
    findings.push({ code: 'DRIVE_WITH_NO_ACTION', archetype, board, message: `${at} has a drive with neither fill nor submit, so it would capture the plain page and compare it against this board's state` });
  }
  if (fill !== null && (typeof fill !== 'object' || Array.isArray(fill))) {
    findings.push({ code: 'DRIVE_FILL_NOT_AN_OBJECT', archetype, board, message: `${at} has fill ${JSON.stringify(fill)}, which is not an object of selector -> value` });
  }
  for (const [selector, value] of Object.entries(fill ?? {})) {
    if (typeof selector !== 'string' || !selector.trim()) {
      findings.push({ code: 'DRIVE_FILL_EMPTY_SELECTOR', archetype, board, message: `${at} has an empty fill selector` });
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      findings.push({ code: 'DRIVE_FILL_BAD_VALUE', archetype, board, message: `${at} fills ${JSON.stringify(selector)} with ${JSON.stringify(value)}, which is not a string or number` });
    }
  }
  if (submit !== null && (typeof submit !== 'string' || !submit.trim())) {
    findings.push({ code: 'DRIVE_SUBMIT_NOT_A_SELECTOR', archetype, board, message: `${at} has submit ${JSON.stringify(submit)}, which is not a non-empty selector` });
  }
  // mwg-train-pv44 (rev-1): expectText is REQUIRED, not optional. A drive without it still captures and
  // compares whatever page the submission produced, so an author who omits it gets exactly the silent wrong
  // answer expectText exists to prevent - a successful submission compared against a refusal board. The
  // contract refuses the entry rather than trusting the author to remember.
  if (expectText === null || typeof expectText !== 'string' || !expectText.trim()) {
    findings.push({ code: 'DRIVE_EXPECT_TEXT_NOT_A_STRING', archetype, board, message: `${at} has expectText ${JSON.stringify(expectText)}, which is not a non-empty string; a drive without it would compare whatever the submission produced against this refusal board, including a successful submission (mwg-train-pv44)` });
  }
  if (startPath !== undefined) {
    if (typeof startPath !== 'string' || !startPath.startsWith('/') || startPath.startsWith('//')) {
      findings.push({ code: 'DRIVE_START_PATH_NOT_ROOT_RELATIVE', archetype, board, message: `${at} starts the drive at ${JSON.stringify(startPath)}, which is not a root-relative path that captureSignature will accept` });
    }
  }
  return findings;
}

function main() {
  if (!existsSync(MAPPING_PATH)) {
    console.error(`check-board-states: FAIL - ${MAPPING_PATH} does not exist`);
    process.exit(1);
  }
  const boards = boardsOnDisk();
  const mapping = loadMapping();
  const findings = boardStateFindings({ boards, mapping });
  const total = Object.values(boards).reduce((n, files) => n + files.length, 0);
  if (findings.length) {
    console.error(`check-board-states: FAIL - ${findings.length} finding(s) across ${total} board(s)`);
    for (const f of findings) console.error(`  [${f.code}] ${f.message}`);
    process.exit(1);
  }
  const withPath = Object.values(mapping).flatMap((e) => Object.values(e ?? {})).filter((e) => e && e.path).length;
  const nulled = Object.values(mapping).flatMap((e) => Object.values(e ?? {})).filter((e) => e && e.path === null).length;
  console.log(`check-board-states: PASS - all ${total} board(s) on disk are classified (${withPath} with a path the comparator can render, ${nulled} deliberately null with a reason)`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
