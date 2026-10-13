import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// docs/train/corpus/records.json is the browser-journey EVIDENCE for the tr-* training corpus: each row records what
// was driven, and `corpus_tree_sha` is the hash of the tree it was driven against. `scripts/check-train-records.mjs`
// already enforces that the two agree - and it is the authority, because it re-materialises nothing and reads only the
// committed records. But it is a CHECK SCRIPT, and check:all is the only thing that runs check scripts; the fast gate
// runs suites. So a generator change re-records pilot/TRAINING_CORPUS.json (moving 210 tree hashes), the evidence
// silently starts attesting to trees that no longer exist, and the fast gate sees nothing.
//
// That is not hypothetical: it happened in mwg-train-kipj, where the escape fix re-recorded the corpus and left 34 of
// 40 rows stale (check-train-records: "the record is evidence about trees that no longer exist"). This suite is the
// same rule in the fast gate's own currency, so the mapping entry for these two files means something.

const ROOT = join(import.meta.dirname, '..');
const RECORDS = join(ROOT, 'docs', 'train', 'corpus', 'records.json');
const CORPUS = join(ROOT, 'pilot', 'TRAINING_CORPUS.json');

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Extracted so the rule can be shown to bite on synthetic input rather than only asserted against the real files -
// a check that cannot fail on a mangled copy is not a check.
function staleEvidenceRows(records, corpus) {
  const treeShaByProject = new Map(corpus.projects.map((project) => [project.project_id, project.tree_sha]));
  const offenders = [];
  for (const row of records.projects) {
    const corpusSha = treeShaByProject.get(row.project_id);
    if (corpusSha === undefined) {
      offenders.push(`${row.project_id}: no such project in the corpus record`);
    } else if (row.corpus_tree_sha !== corpusSha) {
      offenders.push(`${row.project_id}: driven tree ${row.corpus_tree_sha} != corpus tree ${corpusSha}`);
    }
  }
  return offenders;
}

test('every recorded journey row attests to a tree the training corpus still holds', () => {
  const records = read(RECORDS);
  const corpus = read(CORPUS);

  const offenders = staleEvidenceRows(records, corpus);
  assert.deepEqual(offenders, [],
    `the evidence attests to trees that are no longer in the corpus - re-record it (see docs/train/corpus/README.md):\n  ${offenders.join('\n  ')}`);

  // The evidence must be ABOUT this corpus, and cannot predate the corpus it drove. A stale run that was somehow
  // hash-consistent would still be evidence about an older corpus.
  assert.equal(records.corpus, 'pilot/TRAINING_CORPUS.json');
  assert.ok(new Date(records.generated_at) >= new Date(corpus.generated_at),
    `the journey run (${records.generated_at}) predates the corpus it drove (${corpus.generated_at})`);

  // And the coverage arithmetic must line up with the corpus, so a re-record that changed the project count is
  // visible here rather than only in the prose.
  assert.equal(records.coverage.total, corpus.projects.length,
    'the evidence total must match the number of projects in the corpus record');
  assert.equal(corpus.summary.projects, corpus.projects.length);
});

test('the stale-row rule bites on a mangled copy', () => {
  const records = read(RECORDS);
  const corpus = read(CORPUS);
  assert.deepEqual(staleEvidenceRows(records, corpus), [], 'the rule must pass on the committed records');

  const mangled = JSON.parse(JSON.stringify(records));
  mangled.projects[0].corpus_tree_sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const found = staleEvidenceRows(mangled, corpus);
  assert.equal(found.length, 1, 'a wrong hash must be reported');
  assert.match(found[0], /driven tree .* != corpus tree/);

  const missing = JSON.parse(JSON.stringify(records));
  missing.projects[0].project_id = 'tr-99-hono';
  assert.match(staleEvidenceRows(missing, corpus)[0], /no such project/);
});
