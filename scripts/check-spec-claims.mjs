#!/usr/bin/env node
/**
 * Audit the archetype specs' checkable claims against the artefacts that GENERATE them.
 *
 * Why this exists. Every accuracy defect found in the archetype plan.md and design.md files during the
 * 2026-10-12 review round had the same shape: a sentence asserting more than the artefact supports. Four of
 * five were invisible to a reader of the document, because the document is self-consistent - the falsehood
 * only shows up when you diff it against the thing that produces the board. Reading found none of them; a
 * reviewer found them one at a time, at the cost of a review round each (mwg-train-5cvq, -v4c0, -ltw6,
 * -seqr, -f1bj, and the eight sibling contrast beads under mwg-train-a57f).
 *
 * So this file checks the classes that can be checked mechanically, and says plainly which ones cannot.
 *
 *   1. TOKEN DECLARATIONS. A design.md token table maps a token to a hex value. The family's generation
 *      prompt (docs/design/training/<tr-NN>/prompt.txt) is the contract that produces the board, and it
 *      declares the palette with "Use exactly this palette: #rrggbb (prefix-name), ...". A token in the
 *      spec whose hex appears in none of that archetype's families' prompts is either a mis-transcription
 *      or an invented token - the defect that took four review rounds to land on 5cvq. This check would
 *      have found it before the first review.
 *
 *   2. PROMPT-ONLY TOKENS. The inverse, which matters for the same reason: a palette colour the prompt
 *      demands but the spec never names is a family the spec claims to describe and does not.
 *
 *   3. COVERAGE. Which archetypes have no family prompt to check against, so a green run is not mistaken
 *      for "all 21 were checked".
 *
 * Deliberately NOT automated, with the reason, because a check that silently ignores a class is worse than
 * no check:
 *   - CORPUS-WIDE QUANTIFIERS ("no family", "the only", "first in the corpus"). These are countable, so it
 *     prints a census for a human, but deciding whether a phrase is TRUE needs a judgement about what
 *     counts as support. Both real occurrences in this corpus (mwg-train-cpzu) were mine and both were
 *     false; the census is here so the next one is visible before a reviewer finds it.
 *   - ROUTE CLAIMS. "the engine already renders X" is checkable against pilot/training-archetypes.mjs, but
 *     the spec's prose does not name routes in a shape worth parsing. The route table is printed as a
 *     reference so the diff is a short manual step, which is what caught plan.md:179.
 *   - RASTER DESCRIPTIONS. Claims about what a board's pixels show cannot be checked by reading; they need
 *     the board opened or a vision pass (mwg-train-seqr).
 *
 * Fails closed: a missing document or prompt is reported, never thrown.
 *
 *   node scripts/check-spec-claims.mjs            # report
 *   node scripts/check-spec-claims.mjs --json     # machine-readable
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const ARCHETYPES = join(ROOT, 'docs/design/archetypes');
const TRAINING = join(ROOT, 'docs/design/training');
const PILOT = join(ROOT, 'pilot/training-archetypes.mjs');

/**
 * Token declarations are written BOTH ways in this corpus and a parser that handles only one shape
 * silently under-reports: catalogue and event-registration use markdown table rows, while booking says
 * "`--accent` (`#10b981`)" in prose. Sampling three files and generalising is how the first version of this
 * file reported that 20 of 21 archetypes had no token table.
 */
const TOKEN_TABLE = /^\|\s*`(--[a-z0-9-]+)`\s*\|\s*`(#[0-9a-fA-F]{6})`/gm;
const TOKEN_PROSE = /`(--[a-z0-9-]+)`\s*\(?\s*`(#[0-9a-fA-F]{6})`/g;
/** The prompt's palette line: "Use exactly this palette: #rrggbb (name), ...". */
const PROMPT_PALETTE = /Use exactly this palette:([^\n]*)/;
const PROMPT_HEX = /#([0-9a-fA-F]{6})/g;
/** A family id as the specs write it: tr-16, fam-16. */
const FAMILY_ID = /\b((?:tr|fam)-[0-9]{2})\b/g;
/** Phrases that assert something about the whole corpus, and so can be false corpus-wide. */
const QUANTIFIERS = [
  /\bno (?:family|famil(?:y|ies)|archetype|other) (?:in the corpus )?/gi,
  /\bthe only\b/gi,
  /\bfirst in (?:the|this) corpus\b/gi,
  /\bfewest in (?:the|this) corpus\b/gi,
  /\banywhere in (?:the|this) corpus\b/gi,
  /\bnone of the\b/gi,
  /\bno other\b/gi,
];

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function listDirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((n) => statSync(join(path, n)).isDirectory())
    .sort();
}

/** Every palette a family prompt declares, keyed by family id. */
function familyPalettes() {
  const out = new Map();
  for (const fam of listDirs(TRAINING)) {
    const text = read(join(TRAINING, fam, 'prompt.txt'));
    if (text === null) continue;
    const line = text.match(PROMPT_PALETTE);
    const hexes = new Set();
    if (line) for (const m of line[1].matchAll(PROMPT_HEX)) hexes.add(m[1].toLowerCase());
    out.set(fam, hexes);
  }
  return out;
}

/** The family ids an archetype names in its own documents - the link to a generation contract. */
/** The family ids an archetype names, recorded only for the report - NOT used to choose what to check. */
function familiesNamedBy(slug) {
  const found = new Set();
  for (const name of ['plan.md', 'design.md', 'README.md']) {
    const text = read(join(ARCHETYPES, slug, name));
    if (text === null) continue;
    for (const m of text.matchAll(FAMILY_ID)) found.add(m[1]);
  }
  return found;
}

/** Every `--token`/hex pair a design.md declares, table rows and prose alike. */
function tokenRows(slug) {
  const text = read(join(ARCHETYPES, slug, 'design.md'));
  if (text === null) return [];
  const seen = new Map();
  for (const re of [TOKEN_TABLE, TOKEN_PROSE]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) if (!seen.has(m[1])) seen.set(m[1], m[2].toLowerCase());
  }
  return [...seen].map(([token, hex]) => ({ token, hex }));
}

function quantifierCensus() {
  const hits = [];
  for (const slug of listDirs(ARCHETYPES)) {
    for (const name of ['plan.md', 'design.md']) {
      const path = join(ARCHETYPES, slug, name);
      const text = read(path);
      if (text === null) continue;
      text.split('\n').forEach((line, i) => {
        for (const re of QUANTIFIERS) {
          re.lastIndex = 0;
          const m = re.exec(line);
          if (m) {
            hits.push({ archetype: slug, file: name, line: i + 1, phrase: m[0].trim(), text: line.trim().slice(0, 110) });
            break;
          }
        }
      });
    }
  }
  return hits;
}

function pilotRoutes() {
  const text = read(PILOT);
  if (text === null) return [];
  return [...text.matchAll(/\{\s*method:\s*'([A-Z]+)',\s*path:\s*'([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);
}

function main() {
  const asJson = process.argv.includes('--json');
  const palettes = familyPalettes();
  const findings = [];
  const coverage = [];
  const perArchetype = [];

  // The union of every palette any family prompt declares. This is the non-circular half: a hex that
  // appears in no prompt at all is a value the corpus never asks a model to render, which is what the
  // invented hp-control token on library-catalogue was. Deliberately not joined per-archetype: no
  // authoritative archetype-to-family map exists in this repo, and inferring it from prose mentions put
  // tr-16 into event-registration's set and produced 30 false findings on the first run.
  const allPromptHex = new Set();
  for (const [, hexes] of palettes) for (const h of hexes) allPromptHex.add(h);

  for (const slug of listDirs(ARCHETYPES)) {
    const rows = tokenRows(slug);
    const named = [...familiesNamedBy(slug)].filter((f) => palettes.has(f));
    if (rows.length === 0) {
      coverage.push({ archetype: slug, reason: 'design.md declares no token value at all, so there is nothing to diff' });
      continue;
    }
    const undeclared = rows.filter((r) => !allPromptHex.has(r.hex));
    perArchetype.push({
      archetype: slug,
      familiesMentioned: named,
      tokenRows: rows.length,
      declaredByNoPrompt: undeclared.length,
    });
    for (const u of undeclared) {
      findings.push({
        archetype: slug,
        kind: 'token-declared-by-no-prompt',
        detail: `${u.token} = ${u.hex} is declared by no family prompt anywhere in the corpus (${palettes.size} prompts checked)`,
      });
    }
  }

  const census = quantifierCensus();
  const result = {
    archetypesChecked: perArchetype.length,
    coverageGaps: coverage,
    perArchetype,
    findings,
    quantifierCensus: census,
    pilotRoutes: pilotRoutes(),
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(findings.length === 0 ? 0 : 1);
  }

  console.log(`spec-claim audit: ${perArchetype.length} archetype(s) diffed against their generation prompts`);
  for (const p of perArchetype) {
    const flag = p.declaredByNoPrompt ? ` UNDECLARED=${p.declaredByNoPrompt}` : '';
    console.log(`  ${p.archetype.padEnd(24)} mentions=${(p.familiesMentioned.join(',') || '-').padEnd(14)} tokens=${String(p.tokenRows).padEnd(3)}${flag}`);
  }

  if (coverage.length) {
    console.log(`\nNot checked (${coverage.length}) - a clean run does not mean these were audited:`);
    for (const c of coverage) console.log(`  ${c.archetype.padEnd(24)} ${c.reason}`);
  }

  if (findings.length) {
    console.log(`\nFINDINGS (${findings.length}):`);
    for (const f of findings) console.log(`  [${f.kind}] ${f.archetype}: ${f.detail}`);
  } else {
    console.log('\nNo token declaration disagrees with its generation prompt.');
  }

  console.log(`\nCorpus-wide quantifiers for manual review (${census.length}). Each asserts something about every family, so each can be false: the check is whether the corpus supports it, and two real occurrences in this corpus were both false:`);
  for (const c of census) console.log(`  ${c.archetype}/${c.file}:${c.line} "${c.phrase}" - ${c.text}`);

  const routes = pilotRoutes();
  if (routes.length) {
    console.log(`\nPilot route table (${routes.length}) - for diffing prose that claims what "the engine already renders":`);
    console.log(`  ${[...new Set(routes)].join('  ')}`);
  }

  console.log(
    findings.length === 0
      ? '\ncheck-spec-claims: PASS - every declared token appears in its generation prompt'
      : `\ncheck-spec-claims: FAIL - ${findings.length} finding(s)`,
  );
  process.exit(findings.length === 0 ? 0 : 1);
}

main();
