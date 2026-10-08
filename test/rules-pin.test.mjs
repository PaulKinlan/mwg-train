/**
 * The canonical ruleset pin.
 *
 * The pin exists because our evaluation vocabulary used to be pinned only to itself: prereg.mjs
 * recomputes rule_set_hash from the vocabulary beside it, which catches a tampered file but cannot
 * tell whether the file is the ruleset anyone else would recognise. web-uplift publishes that external
 * reference - a set-identity hash over the sorted guide ids - and these tests hold us to it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  checkRulesetPin,
  guideIdsHash,
  MWG_CANONICAL,
  MWG_SNAPSHOT_RULE_SET_HASH,
  ruleSetHash,
} from '../src/eval/ruleset.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RULES_PATH = join(ROOT, 'docs/eval/rules.json');
const rules = JSON.parse(readFileSync(RULES_PATH, 'utf8'));

const withVocabulary = (mutate) => {
  const copy = JSON.parse(JSON.stringify(rules));
  mutate(copy);
  return copy;
};
const codes = (findings) => findings.map((f) => f.code);

test('our committed vocabulary is the pinned canonical id set', () => {
  assert.equal(guideIdsHash(rules.categories), MWG_CANONICAL.guideIdsSha256);
  assert.equal(ruleSetHash(rules.categories), MWG_SNAPSHOT_RULE_SET_HASH);
  assert.equal(Object.values(rules.categories).flat().length, MWG_CANONICAL.guides);
  assert.equal(Object.keys(rules.categories).length, MWG_CANONICAL.categories);
  assert.deepEqual(checkRulesetPin(rules).filter((f) => f.fatal !== false), []);
});

test('the two hashes are different recipes over the same vocabulary', () => {
  // If these ever agreed, one of them would have been silently switched to the other's recipe, and the
  // canonical comparison would be checking our own convention against itself - the trap this whole
  // pin is meant to escape.
  assert.notEqual(guideIdsHash(rules.categories), ruleSetHash(rules.categories).replace('sha256:', ''));
  const bare = Object.values(rules.categories).flat();
  const prefixed = Object.entries(rules.categories).flatMap(([c, g]) => g.map((id) => `${c}/${id}`));
  assert.notEqual(bare[0], prefixed[0], 'bare ids and category/guide ids must not be interchangeable');
});

test('adding, removing or renaming a guide fails the pin', () => {
  const added = withVocabulary((c) => c.categories.css.push('a-guide-that-does-not-exist'));
  assert.ok(codes(checkRulesetPin(added)).includes('GUIDE_IDS_MISMATCH'));

  const removed = withVocabulary((c) => c.categories.css.pop());
  assert.ok(codes(checkRulesetPin(removed)).includes('GUIDE_IDS_MISMATCH'));

  const renamed = withVocabulary((c) => {
    c.categories.css[0] = 'renamed-guide';
  });
  assert.ok(codes(checkRulesetPin(renamed)).includes('GUIDE_IDS_MISMATCH'));
});

test('reordering within a category is not drift', () => {
  // The pin is a set identity over sorted ids, so it constrains the vocabulary and not the file's
  // layout. Asserting this keeps a future tightening honest: the check must not start failing because
  // the generator emitted categories in a different order.
  const reordered = withVocabulary((c) => {
    c.categories.css.reverse();
  });
  assert.deepEqual(checkRulesetPin(reordered).filter((f) => f.fatal !== false), []);
});

test('a file advertising the pinned hash beside a different vocabulary is still caught', () => {
  // The same property prereg.mjs enforces: never trust the field next to the vocabulary.
  const lying = withVocabulary((c) => {
    c.rule_set_hash = MWG_SNAPSHOT_RULE_SET_HASH;
    c.categories.js.push('invented-guide');
  });
  const found = codes(checkRulesetPin(lying));
  assert.ok(found.includes('GUIDE_IDS_MISMATCH'));
  assert.ok(found.includes('RULE_SET_HASH_MISMATCH'));
  assert.ok(found.includes('SNAPSHOT_SEAL_MISMATCH'));
});

test('an empty vocabulary fails closed instead of passing', () => {
  // sha256('') is a valid digest, so the danger here is a check that compares an empty vocabulary to
  // the pin, disagrees, and is then read as "no guide ids" rather than "no vocabulary". It is a finding.
  const empty = { counts: { categories: 0, guides: 0 }, categories: {}, rule_set_hash: '' };
  const found = codes(checkRulesetPin(empty));
  assert.ok(found.includes('EMPTY_VOCABULARY'));
  assert.ok(found.length >= 1);
});

test('a malformed vocabulary is rejected before it is hashed', () => {
  // Review finding on bead mwg-train-6ek: `categories.css[0] = [categories.css[0]]` passed the whole
  // check. `.flat()` yields the original bare id and template interpolation coerces the array to the
  // same string, so the count and BOTH hashes were unchanged while the vocabulary no longer held id
  // strings. Validation now runs before any hash is computed, so this class cannot pass.
  const malformed = [
    (c) => { c.categories.css[0] = [c.categories.css[0]]; },
    (c) => { c.categories.css[0] = [c.categories.css[0], 'extra']; },
    (c) => { c.categories.css[0] = 42; },
    (c) => { c.categories.css[0] = null; },
    (c) => { c.categories.css[0] = ''; },
    (c) => { c.categories.css[0] = 'has/slash'; },
    (c) => { c.categories.css = {}; },
    (c) => { c.categories.css = 'accessibility'; },
  ];
  for (const mutate of malformed) {
    const found = codes(checkRulesetPin(withVocabulary(mutate)));
    assert.ok(found.includes('BAD_VOCABULARY_SHAPE'), `expected a shape finding for ${mutate.toString()}`);
    // And it must not be only the non-fatal catalog note.
    assert.ok(checkRulesetPin(withVocabulary(mutate)).some((f) => f.fatal !== false));
  }
});

test('a malformed value is reported, never thrown', () => {
  // Second review finding here: `sortedGuideIds` ran BEFORE shape validation, so a parsed value without a
  // usable toString (`{"toString":null}`) threw "Cannot convert object to primitive value" instead of
  // being reported. A check that throws on bad input has not checked anything, and this file advertises
  // findings rather than exceptions.
  const values = ['{"toString":null}', '{"toString":{}}', '[{"toString":null}]', '{"valueOf":null}', '{"toString":"x"}', '{}', '[]'];
  for (const json of values) {
    const parsed = JSON.parse(json);
    const found = checkRulesetPin(withVocabulary((c) => { c.categories.css[0] = parsed; }));
    assert.ok(found.some((f) => f.code === 'BAD_VOCABULARY_SHAPE'), `expected a finding for ${json}`);
  }
  // Metadata that is interpolated into finding messages must not throw either: `${counts.guides}` on a
  // parsed object without a usable toString threw, turning a reportable mismatch into a crashed check.
  const weird = JSON.parse('{"toString":null}');
  for (const field of ['guides', 'categories']) {
    const found = checkRulesetPin(withVocabulary((c) => { c.counts[field] = weird; }));
    assert.ok(found.some((f) => f.code === 'COUNT_MISMATCH'), `expected COUNT_MISMATCH for counts.${field}`);
  }
  const hashCase = checkRulesetPin(withVocabulary((c) => { c.rule_set_hash = weird; }));
  assert.ok(hashCase.some((f) => f.code === 'RULE_SET_HASH_MISMATCH'));

  // And a category name that would make `category/guide` ambiguous is refused too.
  for (const name of ['bad name', 'a/b', 'a:b', '']) {
    const found = checkRulesetPin(withVocabulary((c) => { c.categories[name] = c.categories.css; delete c.categories.css; }));
    assert.ok(found.some((f) => f.code === 'BAD_VOCABULARY_SHAPE'), `expected a finding for category name ${JSON.stringify(name)}`);
  }
});

test('--json output is one parseable JSON document', () => {
  // Review finding: the JSON branch printed the report and then an unconditional PASS line, so a caller
  // parsing stdout as a single document failed on a SUCCESSFUL check - the case that must never fail.
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/check-rules-pin.mjs'), '--json'], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.findings, 0);
  assert.equal(parsed.guides, MWG_CANONICAL.guides);
  assert.equal(parsed.canonical_guide_ids_sha256, MWG_CANONICAL.guideIdsSha256);
});

test('a missing categories object is a finding, not a throw', () => {
  for (const bad of [null, {}, { categories: [] }, { categories: 'css' }, { rule_set_hash: 'sha256:x' }]) {
    const found = checkRulesetPin(bad);
    assert.equal(found[0].code, 'BAD_RULES_JSON', `expected ${JSON.stringify(bad)} to be reported`);
  }
});

test('duplicate guide ids are reported even when the id set is otherwise canonical', () => {
  const duplicated = withVocabulary((c) => {
    c.categories.css.push(c.categories.css[0]);
  });
  const found = codes(checkRulesetPin(duplicated));
  assert.ok(found.includes('DUPLICATE_GUIDE_ID'));
  assert.ok(found.includes('COUNT_MISMATCH'));
});

test('the catalog file pin is verified when present and reported when absent', () => {
  // Absent: a note, not a failure - the file is not in this repo.
  const absent = checkRulesetPin(rules);
  const note = absent.find((f) => f.code === 'CATALOG_NOT_VERIFIED');
  assert.ok(note, 'the check must state that the catalog file pin was not verified');
  assert.equal(note.fatal, false);

  // Absent but required: now it is a failure.
  const required = checkRulesetPin(rules, { requireCatalog: true });
  assert.equal(required.find((f) => f.code === 'CATALOG_NOT_VERIFIED').fatal, true);

  // Present with the wrong bytes: a failure naming both hashes, and no absence note alongside it.
  const wrong = checkRulesetPin(rules, { catalogBytes: Buffer.from('not the catalog'), catalogPath: 'knowledge/mwg-catalog.json' });
  const mismatch = wrong.find((f) => f.code === 'CATALOG_FILE_MISMATCH');
  assert.ok(mismatch, 'bytes that are not the catalog must fail');
  assert.match(mismatch.message, /7931ac35/, 'the finding must name the pinned hash');
  assert.ok(!codes(wrong).includes('CATALOG_NOT_VERIFIED'), 'once bytes are supplied, the absence note must not also fire');
  // The positive branch - bytes present AND matching the pin - cannot be constructed in a test: it
  // needs a file whose sha256 is the pinned digest, and the catalog is not vendored anywhere on this
  // VM. It is exercised only by running the check where the file exists, which is why the check says
  // out loud that it did not verify the file rather than leaving the reader to assume it did.
});

test('the CLI passes on the committed file and fails on a mutated one', () => {
  const run = (...args) => execFileSync(process.execPath, [join(ROOT, 'scripts/check-rules-pin.mjs'), ...args], { encoding: 'utf8' });

  const pass = run();
  assert.match(pass, /PASS/);
  assert.match(pass, /NOT verified/, 'the run must not imply the catalog file was verified');

  const dir = mkdtempSync(join(tmpdir(), 'rules-pin-'));
  try {
    const mutated = withVocabulary((c) => c.categories.css.push('a-guide-that-does-not-exist'));
    const path = join(dir, 'mutated.json');
    writeFileSync(path, JSON.stringify(mutated));
    let exit = 0;
    let output = '';
    try {
      run('--rules', path);
    } catch (error) {
      exit = error.status;
      output = String(error.stdout ?? '');
    }
    assert.equal(exit, 1);
    assert.match(output, /GUIDE_IDS_MISMATCH/);

    // An unknown argument is a usage error, distinct from a failed check.
    let usageExit = 0;
    try {
      run('--rules', path, '--nonsense');
    } catch (error) {
      usageExit = error.status;
    }
    assert.equal(usageExit, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
