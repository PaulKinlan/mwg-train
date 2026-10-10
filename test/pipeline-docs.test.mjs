// docs/PIPELINE.md states, for each stage, what it consumes and what it produces, and for the sealed
// brief manifest it quotes the seal that manifest is sealed with. That quoted seal drifted: the row
// still named `sha256:91d75f29…` long after the manifest had moved to `sha256:89a1f47d…`, and nothing
// caught it. `check:briefs` validates the MANIFEST against the enforced seal; it never reads the
// document that describes the pipeline, so no gate was watching the copy.
//
// This gate watches the copy. It derives the expected value from EVAL_SEAL - the constant the code
// actually enforces - rather than restating it, so the document, the constant and the npm script
// cannot disagree without one of these two tests failing.
//
// Scope, deliberately narrow and worth stating: only SHORT forms (`sha256:1234abcd…`) are checked,
// because that is the form PIPELINE.md uses. It is NOT a repo-wide "no document may quote a
// superseded seal" rule, and it must not become one: docs/eval/PREREGISTRATION.md keeps a change
// ledger that deliberately quotes every seal the manifest has ever had, and test/endpoint.test.mjs
// deliberately passes a wrong seal to prove `analyseSealed` refuses it. Both are correct as written.
// This gate covers the one document that states what the pipeline ENFORCES.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EVAL_SEAL } from '../src/train/disjoint.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pipelineDoc = readFileSync(join(repoRoot, 'docs/PIPELINE.md'), 'utf8');

/**
 * ANY sha256 token, however it is written.
 *
 * This deliberately does not require a particular truncation or an ellipsis. The first version matched
 * exactly eight hex digits followed by a Unicode ellipsis, and a review pointed out the hole that leaves:
 * a superseded seal written as a full 64-hex hash, or with three ASCII dots, does not match that pattern,
 * so it would sit in the document unchecked as long as one correctly-shaped seal was also present to
 * satisfy the floor. A gate whose blindness depends on how a value is punctuated - or cased - is not a
 * gate, which is why this pattern is case-insensitive as well.
 */
const SEAL = /sha256:([0-9a-f]+)/gi;

test('every brief seal quoted in docs/PIPELINE.md is the active one', () => {
  const quoted = [...pipelineDoc.matchAll(SEAL)].map((match) => match[1]);

  // A floor, not an equality: the count may grow if the doc quotes the seal again, and deleting all
  // of them should fail rather than quietly leave this test with nothing to check.
  assert.ok(
    quoted.length >= 1,
    'docs/PIPELINE.md should quote the brief seal on its BRIEFS row, and this gate should not pass by finding nothing to check',
  );

  const active = EVAL_SEAL.replace(/^sha256:/, '');
  for (const hex of quoted) {
    // The quoted value must be the active seal, truncated however the document chose to truncate it.
    // This accepts 8 hex and an ellipsis, a full 64-hex seal, and everything between, and refuses any
    // value that differs from the active seal. The comparison is case-folded because the pattern has to
    // be case-insensitive to catch an uppercase seal at all, and it would be perverse to match one and
    // then reject the active value for being rendered in capitals.
    //
    // There is deliberately NO symmetric `hex.startsWith(active)` clause. It looks like it covers a
    // LONGER quoted value, but the active seal is 64 hex digits and no sha256 token can exceed that, so
    // the clause could only ever be true when the two were equal - which the line below already covers.
    // A review called it dead logic and was right; it is removed rather than left looking load-bearing.
    assert.ok(
      active.startsWith(hex.toLowerCase()),
      `docs/PIPELINE.md quotes sha256:${hex} which is not the seal the code enforces (sha256:${active}). A seal written in a different shape must not escape this check.`,
    );
  }
});

test('the seal the docs are checked against is the one package.json enforces', () => {
  // Without this, EVAL_SEAL could drift from the checked script and the gate above would still pass
  // while pointing at a seal nothing enforces.
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['check:briefs'].includes(EVAL_SEAL),
    `check:briefs should enforce ${EVAL_SEAL}, but reads: ${pkg.scripts['check:briefs']}`,
  );
});
