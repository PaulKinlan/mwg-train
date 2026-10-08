/**
 * The held-out brief manifest is evaluation material, so its invariants belong in the test suite:
 * a brief that breaks the property-set rule or names a rule outside the pinned snapshot must fail
 * the build, not be noticed later in a review.
 *
 * These assertions describe the manifest as committed. Composition targets (how many families, how
 * many challenges) are asserted as ranges so the file can grow without the test being rewritten,
 * and the preregistration records the exact sealed counts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IN_FAMILY_ARCHETYPES, familyOverlap, parseBriefs, ruleIndex, sealHash, summarizeBriefs, validateBriefs } from '../src/eval/prereg.mjs';
import { sealHash as cliSealHash } from '../scripts/validate-briefs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'docs/eval/briefs/manifest.jsonl');
const RULES = resolve(ROOT, 'docs/eval/rules.json');

const rows = parseBriefs(readFileSync(MANIFEST, 'utf8'));
const index = ruleIndex(JSON.parse(readFileSync(RULES, 'utf8')));

test('the held-out brief manifest satisfies the preregistration invariants', () => {
  const { ok, findings, counts } = validateBriefs(rows, index);
  assert.equal(ok, true, findings.map((f) => `${f.code} ${f.id} ${f.field}: ${f.message}`).join('\n'));
  assert.ok(counts.briefs > 0);
  assert.ok(counts.families > 0);
  assert.ok(counts.familiesBySplit.dev > 0, 'there must be a dev split to tune on');
  assert.ok(counts.familiesBySplit.test > 0, 'there must be a sealed test split');
});

test('every rule the briefs require exists in the pinned vocabulary', () => {
  const used = new Set(rows.flatMap((row) => row.required_rules ?? []));
  assert.ok(used.size > 0);
  for (const rule of used) {
    assert.ok(index.ids.has(rule), `${rule} is not in the pinned rule set`);
  }
  assert.equal(index.hash, 'sha256:f6301c020f138ed70287b663107033c757e11120fa87d947248ce5e4b4cdca19');
});

test('in-family briefs use the fixed archetype vocabulary and have at least two variants', () => {
  const byFamily = new Map();
  for (const row of rows) {
    if (!byFamily.has(row.family_id)) byFamily.set(row.family_id, []);
    byFamily.get(row.family_id).push(row);
  }
  for (const [family, familyRows] of byFamily) {
    if (familyRows[0].stratum === 'C_out_of_family' || familyRows[0].stratum === 'R_repair') continue;
    assert.ok(familyRows.length >= 2, `${family} needs at least two variants`);
    for (const row of familyRows) {
      assert.ok(IN_FAMILY_ARCHETYPES.includes(row.archetype), `${row.brief_id} uses archetype '${row.archetype}' outside the in-family vocabulary`);
    }
  }
});

test('the repair stratum, when present, carries defects and generation rows never do', () => {
  for (const row of rows) {
    if (row.task === 'repair') assert.ok(row.seeded_defects.length > 0, `${row.brief_id} is a repair row with no defects`);
    if (row.task === 'generate') assert.deepEqual(row.seeded_defects, [], `${row.brief_id} is a generation row carrying defects`);
  }
});

test('the briefs are held out: no family may also be a training family', () => {
  const corpusPath = resolve(ROOT, 'docs/eval/briefs/corpus.example.jsonl');
  const corpus = parseBriefs(readFileSync(corpusPath, 'utf8'));
  assert.deepEqual(familyOverlap(rows, corpus), [], 'a family appears in both the held-out briefs and the corpus');
  // ...and the check is not vacuous: the same family in both must be reported
  assert.deepEqual(familyOverlap(rows, [{ family_id: rows[0].family_id, split: 'train' }]), [rows[0].family_id]);
});

test('the committed manifest matches the seal recorded in the preregistration', () => {
  // The preregistration says a hand-edited manifest cannot keep a stale seal. That is only true if a
  // test compares the computed seal against the RECORDED one; checking that the hash is well-formed
  // and that an edit moves it would leave an edited manifest green with a stale document.
  const prereg = readFileSync(resolve(ROOT, 'docs/eval/PREREGISTRATION.md'), 'utf8');
  const recorded = prereg.match(/seal hash:\s*(sha256:[0-9a-f]{64})/)?.[1];
  assert.ok(recorded, 'PREREGISTRATION.md must record a seal hash');
  assert.match(prereg, /seal form\s+v2|seal form:\s*v2/i, 'the canonical form must be stated so the seal can be reproduced independently');
  assert.equal(sealHash(parseBriefs(readFileSync(MANIFEST, 'utf8'))), recorded, 'the manifest no longer matches the recorded seal');
});

test('the seal is canonical: key order and unicode form cannot move it', () => {
  const rows = parseBriefs(readFileSync(MANIFEST, 'utf8'));
  const original = sealHash(rows);
  // The same content with keys written in a different order must seal identically, or a
  // re-serialised manifest would look like an edit (and an editor could say "I only reformatted it").
  const reordered = rows.map((row) => Object.fromEntries(Object.entries(row).reverse()));
  assert.equal(sealHash(reordered), original, 'key order must not change the seal');
  // ...and a real content change must move it.
  const edited = rows.map((row, index) => (index === 0 ? { ...row, prompt: `${row.prompt} Also add a FAQ.` } : row));
  assert.notEqual(sealHash(edited), original, 'an edited prompt must move the seal');
  // The CLI and the library must agree on the canonical form.
  assert.equal(cliSealHash(rows), original);
});

test('the validator refuses an empty manifest and reports hostile input instead of throwing', () => {
  const empty = join(tmpdir(), 'mwg-briefs-empty.jsonl');
  writeFileSync(empty, '');
  let refused = null;
  try {
    execFileSync(process.execPath, [resolve(ROOT, 'scripts/validate-briefs.mjs'), empty], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    refused = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  assert.ok(refused !== null, 'an empty manifest must not exit 0');
  assert.match(refused, /EMPTY_MANIFEST/, 'the empty manifest must be reported as such');

  const broken = join(tmpdir(), 'mwg-briefs-broken.jsonl');
  writeFileSync(broken, '{"brief_id": "truncated"\n');
  let output = '';
  let code = 0;
  try {
    output = execFileSync(process.execPath, [resolve(ROOT, 'scripts/validate-briefs.mjs'), broken], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    code = error.status ?? 1;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  assert.equal(code, 1, 'malformed JSONL must exit 1');
  assert.ok(!/^\s*at /m.test(output.split('\n').slice(1).join('\n')), `malformed input must be a finding, not a stack trace:\n${output}`);
  assert.match(output, /ERROR/);
});

test('the validator does not trust the rule_set_hash beside the vocabulary', () => {
  const rules = JSON.parse(readFileSync(resolve(ROOT, 'docs/eval/rules.json'), 'utf8'));
  const tampered = JSON.parse(JSON.stringify(rules));
  tampered.categories.forms = [...tampered.categories.forms, 'invented-guide'];
  const index = ruleIndex(tampered);
  assert.notEqual(index.computedHash, index.hash, 'the recomputed vocabulary hash must differ from the declared one');
  const { ok, findings } = validateBriefs(parseBriefs(readFileSync(MANIFEST, 'utf8')), index);
  assert.equal(ok, false);
  assert.ok(findings.some((f) => f.code === 'RULE_HASH_MISMATCH'), 'an unpinned vocabulary must be reported');
});

test('a variant must point at its family canonical brief', () => {
  const rows = parseBriefs(readFileSync(MANIFEST, 'utf8'));
  const index = ruleIndex(JSON.parse(readFileSync(resolve(ROOT, 'docs/eval/rules.json'), 'utf8')));
  const victim = rows.find((row) => row.variant_of && row.brief_id.endsWith('-v2'));
  const mutated = rows.map((row) => (row.brief_id === victim.brief_id ? { ...row, variant_of: row.brief_id.replace('v2', 'v3') } : row));
  const { ok, findings } = validateBriefs(mutated, index);
  assert.equal(ok, false, 'pointing at a sibling variant must be rejected');
  assert.ok(findings.some((f) => f.code === 'BAD_VARIANT_OF'));
});

test('the seal hash is deterministic and covers the brief content', () => {
  const hashOf = (content) => {
    writeFileSync('/tmp/briefs-seal-input.jsonl', content);
    const output = execFileSync(
      process.execPath,
      [resolve(ROOT, 'scripts/validate-briefs.mjs'), '/tmp/briefs-seal-input.jsonl', '--seal', '--seal-out', '/tmp/briefs-seal-test.txt'],
      { encoding: 'utf8' },
    );
    assert.match(output, /PASS/);
    return readFileSync('/tmp/briefs-seal-test.txt', 'utf8').trim();
  };
  const first = readFileSync(MANIFEST, 'utf8');
  const original = hashOf(first);
  assert.match(original, /^sha256:[0-9a-f]{64}$/);
  assert.equal(hashOf(first), original, 'the seal must be reproducible from the same file');

  const asLines = (rows) => `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const rows = parseBriefs(first);
  // row order must not change the seal
  assert.equal(hashOf(asLines([...rows].reverse())), original, 'reordering rows must not move the seal');
  // a *legitimate* content change must: rewording one prompt is allowed by the contract, and it has
  // to be visible in the seal. (Mutating an invariant field would be rejected outright, which the
  // other tests already cover.)
  const reworded = rows.map((row, index) => (index === 0 ? { ...row, prompt: `${row.prompt} Please also add a short FAQ page.` } : row));
  assert.notEqual(hashOf(asLines(reworded)), original, 'changing a brief must move the seal');
});

test('the summary the preregistration quotes is computable', () => {
  const counts = summarizeBriefs(rows);
  assert.equal(counts.briefs, rows.length);
  assert.equal(counts.families, new Set(rows.map((r) => r.family_id)).size);
  assert.equal(typeof counts.byStratum, 'object');
  assert.equal(typeof counts.alreadyModern, 'number');
});
