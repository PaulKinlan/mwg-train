/**
 * The visual conformance axis and the target images it scores against.
 *
 * Two things could quietly make this axis meaningless: a metric that returns 1 for everything (so
 * every arm "conforms"), or a target whose pinned hash no longer matches the bytes on disk (so the
 * score is taken against a picture nobody reviewed). Both are asserted here, on synthetic signatures
 * for the metric and on the committed manifest for the targets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { controlSimilarity, conformanceScore, geometrySimilarity, IDENTITY_AXES, identityFindings, scoreArm, structuralSimilarity, variantIdentity, WEIGHTS } from '../src/eval/conformance.mjs';
import { validateManifest } from '../src/provenance/record.mjs';
import { parseManifest } from '../src/provenance/record.mjs';
import { IDENTITY_BUDGET, TARGETS_MANIFEST, TARGETS_STORAGE, TARGET_FAMILIES } from '../src/eval/targets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

const signature = ({ tags = [], boxes = [], controls = [] } = {}) => ({
  nodes: tags.map((tag) => ({ tag })),
  boxes,
  controls,
});

const box = (tag, x, y, w, h) => ({ tag, x, y, w, h });

test('an identical signature scores 1 on every axis', () => {
  const page = signature({ tags: ['header', 'main', 'form', 'input', 'button'], boxes: [box('form', 0, 0, 1, 0.5)], controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }] });
  const score = conformanceScore(page, structuredClone(page));
  assert.equal(score.structural, 1);
  assert.equal(score.geometry, 1);
  assert.equal(score.controls, 1);
  assert.equal(score.overall, 1);
});

test('a framework wrapper costs a little structure, not the whole score', () => {
  const target = signature({ tags: ['header', 'main', 'form', 'input'] });
  const wrapped = signature({ tags: ['div', 'header', 'main', 'form', 'input'] });
  const score = structuralSimilarity(target, wrapped);
  assert.ok(score > 0.7 && score < 1, `one wrapper must not collapse the score, got ${score}`);
});

test('structural similarity is order-sensitive, not just composition', () => {
  const a = signature({ tags: ['main', 'h1', 'form', 'input'] });
  const reordered = signature({ tags: ['main', 'form', 'h1', 'input'] });
  const same = structuralSimilarity(a, reordered);
  assert.ok(same < 1, `reordering the same elements must score below 1, got ${same}`);
  assert.ok(structuralSimilarity(a, a) > same);
});

test('geometry similarity falls when a box moves, and unmatched boxes count as zero', () => {
  const a = signature({ boxes: [box('main', 0, 0, 1, 1), box('form', 0.1, 0.2, 0.3, 0.4)] });
  const moved = signature({ boxes: [box('main', 0, 0, 1, 1), box('form', 0.6, 0.6, 0.3, 0.4)] });
  assert.ok(geometrySimilarity(a, moved) < 1);
  assert.equal(geometrySimilarity(a, signature({ boxes: [box('main', 0, 0, 1, 1)] })), 0.5);
});

test('geometry similarity survives a global translation and a single inserted field', () => {
  const stacked = (offset, extra = false) => {
    const boxes = [box('form', 0.1, 0.1 + offset, 0.8, 0.6)];
    for (let i = 0; i < 5; i += 1) boxes.push(box('label', 0.1, 0.2 + offset + i * 0.1, 0.8, 0.03), box('input', 0.1, 0.24 + offset + i * 0.1, 0.8, 0.05));
    // An extra field at the top is what used to shift every later `label:n` onto the wrong box.
    if (extra) boxes.push(box('label', 0.1, 0.1 + offset, 0.8, 0.03), box('input', 0.1, 0.14 + offset, 0.8, 0.05));
    return signature({ boxes });
  };
  const translated = geometrySimilarity(stacked(0), stacked(0.08));
  assert.ok(translated > 0.8, `a global translation must not wipe the score, got ${translated}`);
  const inserted = geometrySimilarity(stacked(0), stacked(0, true));
  assert.ok(inserted > 0.8, `one inserted field must not wipe the score, got ${inserted}`);
  assert.ok(inserted < translated, 'an inserted field must still cost something');
});

test('controls similarity rewards the same controls and penalises a missing label', () => {
  const labelled = signature({ controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }] });
  assert.equal(controlSimilarity(labelled, labelled), 1);
  const unlabelled = signature({ controls: [{ tag: 'input', type: 'text', name: 'name', label: null }] });
  assert.ok(controlSimilarity(labelled, unlabelled) < 1);
  assert.equal(controlSimilarity(labelled, signature({ controls: [] })), 0);
});

test('scoreArm reports the raw baseline, the arm target and the delta', () => {
  const target = signature({ tags: ['main', 'h1', 'form', 'input', 'button'], boxes: [box('form', 0, 0, 1, 0.6)], controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }] });
  const raw = signature({ tags: ['div', 'div'], boxes: [box('form', 0.5, 0.5, 0.1, 0.1)], controls: [{ tag: 'input', type: 'text', name: 'name', label: null }] });
  const arm = structuredClone(target);
  const score = scoreArm({ target, raw, arm });
  assert.equal(score.target, 1);
  assert.ok(score.raw < 1);
  assert.equal(score.delta, Math.round((score.target - score.raw) * 10000) / 10000);
  assert.ok(score.delta > 0);
  assert.equal(WEIGHTS.structural + WEIGHTS.geometry + WEIGHTS.controls, 1);
});

test('a target with no controls scores control similarity as a pass by vacuity, so targets are checked separately', () => {
  // This is the reason the renderer refuses a page with no controls: the metric itself cannot tell an
  // empty target from a perfectly matched one.
  assert.equal(controlSimilarity(signature({}), signature({})), 1);
});

test('variantIdentity is 1 when the variants agree and names the outlier when they do not', () => {
  const a = signature({ tags: ['main', 'form', 'input'], boxes: [box('form', 0, 0, 1, 0.6)], controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }] });
  const b = structuredClone(a);
  assert.equal(variantIdentity(a, [{ framework: 'raw', signature: a }, { framework: 'react', signature: b }]).identity.overall, 1);
  const odd = signature({ tags: ['div', 'form'], boxes: [box('form', 0.6, 0.6, 0.2, 0.2)], controls: [{ tag: 'input', type: 'text', name: 'name', label: null }] });
  const report = variantIdentity(a, [{ framework: 'raw', signature: a }, { framework: 'react', signature: b }, { framework: 'odd', signature: odd }]);
  assert.ok(report.identity.overall < 1, 'a divergent variant must lower the family identity');
  assert.ok(report.weakest_pair.a === 'odd' || report.weakest_pair.b === 'odd', 'the outlier must be named');
  assert.ok(report.variance.overall > 0, 'variance must be non-zero when variants diverge');
});

test('identityFindings names the axis below budget and the pair responsible for that axis', () => {
  const identity = {
    identity: { structural: 0.5, geometry: 0.4, controls: 0.95, overall: 0.7 },
    weakest_pair: { a: 'vue', b: 'hono' },
    weakest_by_axis: { structural: { a: 'raw', b: 'react' }, geometry: { a: 'vue', b: 'hono' }, controls: null, overall: { a: 'vue', b: 'hono' } },
  };
  const findings = identityFindings(identity, { structural: 0.6 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].axis, 'structural');
  assert.equal(findings[0].pair, 'raw/react', 'the structural finding must blame the pair weak on structure, not the overall-worst pair');
});

test('identityFindings reports vacuous identity rather than a perfect score', () => {
  const blank = signature({});
  const report = variantIdentity(blank, [{ framework: 'raw', signature: blank }, { framework: 'react', signature: blank }]);
  assert.equal(report.degenerate, true);
  assert.ok(identityFindings(report, { overall: 0.9 }).some((finding) => finding.code === 'IDENTITY_DEGENERATE'));
});

test('peer identity does not depend on the order of the variants', () => {
  const unlabelled = signature({ tags: ['main', 'form', 'input'], boxes: [box('form', 0, 0, 1, 0.5)], controls: [{ tag: 'input', type: 'text', name: 'name', label: null }] });
  const labelled = structuredClone(unlabelled);
  labelled.controls = [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }];
  const forward = variantIdentity(unlabelled, [{ framework: 'a', signature: unlabelled }, { framework: 'b', signature: labelled }]);
  const backward = variantIdentity(unlabelled, [{ framework: 'b', signature: labelled }, { framework: 'a', signature: unlabelled }]);
  assert.equal(forward.identity.controls, backward.identity.controls, 'identity must not depend on which variant is passed first');
  assert.ok(forward.identity.controls < 1, 'an unlabelled peer must lower controls identity');
});

test('every family has exactly one shared target, not one per framework', () => {
  const rows = parseManifest(readFileSync(join(ROOT, TARGETS_MANIFEST), 'utf8'));
  const frameworkNames = ['raw', 'react', 'preact', 'vue', 'hono'];
  for (const family of TARGET_FAMILIES) {
    const targets = rows.filter((row) => row.family_id === family.family_id);
    assert.equal(targets.length, 1, `${family.family_id} must have exactly one shared target`);
    assert.ok(!frameworkNames.some((name) => targets[0].id === `target-${name}`), 'a target must be family-level, not framework-level');
    assert.ok(!('framework' in targets[0]), 'a target must not name a framework');
  }
});

test('the committed variant-identity reports carry the verdict the code computes', () => {
  for (const family of TARGET_FAMILIES) {
    const path = join(ROOT, 'docs/eval/conformance', `${family.family_id}-identity.json`);
    assert.ok(existsSync(path), `${family.family_id}-identity.json is missing; run scripts/score-variant-identity.mjs --all`);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    // The stored verdict must BE the verdict the code computes from the stored measurements. This used to
    // assert `findings === []`, which pinned the old rule and went stale the moment identityFindings learned
    // to judge the weakest pair as well as the mean - leaving four committed reports claiming compliance
    // beside a pair below budget. A stored verdict with nothing that recomputes it is a verdict that can
    // only be believed, and these are published artifacts.
    assert.deepEqual(
      report.findings,
      identityFindings(report.identity, report.budget),
      `${family.family_id}: the stored findings must be the findings the code computes from the stored identity (run scripts/score-variant-identity.mjs --rerender)`,
    );
    assert.equal(report.identity.degenerate, false, `${family.family_id} identity is vacuous`);
    for (const [axis, minimum] of Object.entries(report.budget)) {
      assert.ok(report.identity.identity[axis] >= minimum, `${family.family_id}: ${axis} ${report.identity.identity[axis]} < budget ${minimum}`);
    }
    // Self-consistency: a hand-edited report with arbitrary numbers must not pass, so the reported
    // identity has to be the mean of the pairwise scores it ships, and the named weakest pair has to
    // be the pair with the lowest overall. (A live render is not run here - it is heavy and
    // non-deterministic - so the guard is that the report cannot contradict its own evidence.)
    for (const axis of ['structural', 'geometry', 'controls', 'overall']) {
      const expected = Math.round((report.identity.pairwise.reduce((sum, pair) => sum + pair[axis], 0) / report.identity.pairwise.length) * 10000) / 10000;
      assert.equal(report.identity.identity[axis], expected, `${family.family_id}: ${axis} identity must equal the mean of its pairwise scores`);
    }
    const worst = [...report.identity.pairwise].sort((a, b) => a.overall - b.overall)[0];
    assert.equal(report.identity.weakest_pair.a, worst.a, `${family.family_id}: weakest_pair must be the lowest-overall pair`);
    assert.equal(report.identity.weakest_pair.b, worst.b);
    for (const variant of report.variants) {
      assert.equal(typeof variant.raw, 'number');
      assert.equal(typeof variant.target, 'number');
      assert.equal(variant.delta, Math.round((variant.target - variant.raw) * 10000) / 10000);
    }
  }
});

test('every target in the manifest is hash-pinned, rights-cleared and never trainable', () => {
  const manifestPath = join(ROOT, TARGETS_MANIFEST);
  assert.ok(existsSync(manifestPath), `${TARGETS_MANIFEST} is missing`);
  const rows = parseManifest(readFileSync(manifestPath, 'utf8'));
  assert.equal(rows.length, TARGET_FAMILIES.length);
  const { findings } = validateManifest(rows);
  assert.deepEqual(findings.filter((finding) => finding.severity === 'error'), [], 'the target manifest must pass provenance validation');

  for (const family of TARGET_FAMILIES) {
    const row = rows.find((candidate) => candidate.family_id === family.family_id);
    assert.ok(row, `${family.family_id} has no target`);
    assert.equal(row.arm, 'A6_evaluation');
    assert.equal(row.excluded_from_training, true);
    assert.equal(row.approved_for_training, false);
    assert.ok(row.license && row.origin && row.created_at && row.rights_ref, `${family.family_id} is missing provenance metadata`);
    assert.equal(row.contains_third_party_material, false);
    assert.equal(row.contains_owner_identifying_material, false);
    assert.ok(existsSync(join(ROOT, row.rights_ref)), `${family.family_id}: rights record is missing`);

    for (const [pathField, hashField, byteField] of [
      ['image_path', 'image_sha256', 'image_bytes'],
      ['signature_path', 'signature_sha256', null],
    ]) {
      const path = join(ROOT, row[pathField]);
      assert.ok(row[pathField].startsWith(`${TARGETS_STORAGE}/`), `${family.family_id}: ${pathField} must live in the evaluation arm`);
      assert.ok(existsSync(path), `${family.family_id}: ${row[pathField]} is missing`);
      const bytes = readFileSync(path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row[hashField], `${family.family_id}: ${pathField} sha256 does not match`);
      if (byteField) assert.equal(statSync(path).size, row[byteField], `${family.family_id}: image byte count does not match`);
    }

    const signatureData = JSON.parse(readFileSync(join(ROOT, row.signature_path), 'utf8'));
    assert.ok(signatureData.controls.length > 0, `${family.family_id}: the target renders with no controls`);
    assert.ok(signatureData.nodes.length > 0, `${family.family_id}: the target renders with no elements`);
  }
});

test('identityFindings refuses the axes object instead of reporting agreement', () => {
  // The plausible mistake, and the reason this test exists: `identityFindings` reads
  // `identity.identity[axis]` - the whole `variantIdentity` RESULT - but the axes are what a caller usually
  // has in hand, so handing them over is easy to do. It used to return an empty finding list, and an empty
  // list is indistinguishable from a family that agrees. Fail-open in a verdict function is the shape this
  // repository refuses elsewhere, so a wrong call must be loud.
  const axes = { structural: 0.1, geometry: 0.1, controls: 0.1, overall: 0.1 };
  assert.throws(
    () => identityFindings(axes, { structural: 0.75 }),
    /variantIdentity RESULT/,
    'the bare axes object must be refused, not read as universal agreement',
  );
  assert.throws(
    () => identityFindings(null, { structural: 0.75 }),
    /variantIdentity RESULT/,
    'a null argument must be refused rather than silently agreeing',
  );
  assert.throws(
    () => identityFindings({ identity: null }, { structural: 0.75 }),
    /variantIdentity RESULT/,
    'a result without its axes must be refused',
  );
  // The real shape must still be judged, so the guard cannot pass by rejecting everything.
  const real = { identity: axes, weakest_by_axis: {}, degenerate: false };
  assert.deepEqual(
    identityFindings(real, { structural: 0.75 }).map((finding) => finding.code),
    ['IDENTITY_BELOW_BUDGET'],
    'the genuine variantIdentity result must still be scored',
  );
});

test('one diverged variant is reported even when the family MEAN is inside the budget', () => {
  // Reproduces mwg-train-bmu with the values this fixture actually produces, measured: shift 0.25 gives a
  // mean geometry of 0.9643, comfortably inside the 0.9 budget, while the weakest pair sits at 0.875 - BELOW
  // it. The mean hides the outlier, so a function that judges only the mean reports a family containing a
  // badly diverged arm as being in agreement. variantIdentity's own docstring says "the outlier is the
  // finding"; this test is that sentence with an assertion attached.
  const box = (tag, x, y, w, h) => ({ tag, x, y, w, h });
  const page = (shift) => ({
    nodes: ['header', 'form', 'button'].map((tag) => ({ tag })),
    boxes: [box('form', 0.1 + shift, 0.2, 0.8, 0.5), box('button', 0.4 + shift, 0.75, 0.2, 0.1)],
    controls: [{ tag: 'input', type: 'text', name: 'name', label: 'Name' }],
  });
  const variants = ['a', 'b', 'c', 'd', 'e', 'f'].map((framework) => ({ framework, signature: page(0) }));
  variants.push({ framework: 'outlier', signature: page(0.25) });
  const identity = variantIdentity(page(0), variants);

  assert.ok(identity.identity.geometry > IDENTITY_BUDGET.geometry, 'the fixture must have a mean INSIDE the budget, or it proves nothing');
  assert.ok(identity.weakest_by_axis.geometry.geometry < IDENTITY_BUDGET.geometry, 'and a weakest pair BELOW it');
  assert.equal(identity.weakest_by_axis.geometry.a, 'a');

  const findings = identityFindings(identity, IDENTITY_BUDGET);
  assert.equal(findings.length, 1, 'the diverged pair must be reported even though the mean passes');
  assert.equal(findings[0].code, 'IDENTITY_PAIR_BELOW_BUDGET');
  assert.equal(findings[0].axis, 'geometry');
  assert.equal(findings[0].actual, identity.weakest_by_axis.geometry.geometry);
  assert.equal(findings[0].pair, 'a/outlier', 'the finding must NAME the pair responsible');
  assert.match(findings[0].message, /mean/, 'and must say the mean hid it');
});

test('a missing or empty budget is a caller-contract error, not universal agreement', () => {
  // The fail-open this exists for (mwg-train-zey): the judge iterates Object.entries(budget ?? {}), so
  // passing no budget, an empty object or null silently reports NO findings. A family that has genuinely
  // fallen below its floor on a pair then reads as total agreement, which is the one direction a parity
  // instrument must never fail in. Malformed caller contract throws here, the same rule the identity
  // argument's guard follows: what arrives is not data to judge, it is a caller mistake to refuse.
  const identity = { identity: { structural: 0.5 }, weakest_by_axis: {}, weakest_pair: null, degenerate: false };
  // The positive first: a real budget must still produce the finding, or the refusals below prove nothing.
  assert.equal(
    identityFindings(identity, { structural: 0.9 }).length,
    1,
    'a real budget must report the axis that is below it',
  );
  for (const budget of [undefined, null, {}, 'nope', 5]) {
    assert.throws(
      () => identityFindings(identity, budget),
      TypeError,
      `budget ${JSON.stringify(budget)} must be refused rather than read as agreement`,
    );
  }
});

test('a budget whose axes are not real numbers is refused too, not just a missing one', () => {
  // `requireBudget` originally filtered on typeof value === 'number', and `typeof NaN === 'number'`. So
  // { structural: NaN } passed the guard and then judged nothing, because `actual < NaN` is false for every
  // axis - the same forbidden direction as a missing budget, through a narrower door: a family below its
  // floor reports agreement. Infinity and -Infinity are the same class, in opposite directions, and
  // Object.entries([0.75]) is [['0', 0.75]], so an array would "judge" an axis literally named "0".
  const identity = { identity: { structural: 0.5 }, weakest_by_axis: {}, weakest_pair: null, degenerate: false };
  for (const budget of [{ structural: NaN }, { structural: Infinity }, { structural: -Infinity }, [0.75], { structural: '0.75' }]) {
    assert.throws(
      () => identityFindings(identity, budget),
      TypeError,
      `budget ${JSON.stringify(budget)} cannot judge an axis and must be refused rather than read as agreement`,
    );
  }
  // The positive still holds: a finite floor judges, and this identity is below it.
  assert.equal(identityFindings(identity, { structural: 0.9 }).length, 1, 'a finite floor must still report');
});

test('every axis the identity layer measures has a budget, or it is judged nowhere', () => {
  // mwg-train-om6. identityFindings judges against the axes the BUDGET names, not the axes that were measured,
  // so an axis present in IDENTITY_AXES but absent from IDENTITY_BUDGET is silently unjudged - the forbidden
  // direction. The lists are equal today, so this test passes as written; its value is that it FAILS the
  // moment an axis is added on one side only, which is how the hole would open.
  //
  // Proven by mutation rather than by this green run: remove one axis from IDENTITY_BUDGET and the test names
  // it as unjudged.
  const measured = [...IDENTITY_AXES].sort();
  const budgeted = Object.keys(IDENTITY_BUDGET).sort();
  // The OFFENDERS, not the whole lists. The first version of this joined `measured`, so removing one floor
  // made the failure message name all four axes as unjudged - a diagnostic that misreports what it
  // diagnosed, which is the same class of defect as the code it guards.
  const unjudged = measured.filter((axis) => !budgeted.includes(axis));
  const decorative = budgeted.filter((axis) => !measured.includes(axis));
  assert.deepEqual(unjudged, [], `these axes are measured but have no floor, so nothing judges them: ${unjudged.join(', ')}`);
  assert.deepEqual(decorative, [], `these axes have a floor but are never measured, so the floor is decorative: ${decorative.join(', ')}`);
});

test('an unmeasurable signature is refused, not scored a perfect 1.000', () => {
  // mwg-train-z92. structuralSimilarity literally begins `if (a.length === 0 && b.length === 0) return 1`
  // (conformance.mjs:119), geometrySimilarity ends `denominator === 0 ? 1` (:180) and controlSimilarity has
  // the same both-empty branch (:189). So a signature with NO nodes and NO boxes - an arm that failed to
  // render - scores a perfect 1.000 on every axis, and two such arms read as perfect agreement. That is the
  // "unmeasured must not read as agreement" direction this module tries to fail closed on elsewhere.
  //
  // variantIdentity KNOWS this: its own comment says two variants that measure nothing agree perfectly and
  // calls it "the most confidently wrong answer the axis can give". But its `degenerate` flag is computed
  // AFTER the scores are produced, so target_conformance still PUBLISHES 1.000 for an arm that measured
  // nothing, and a PARTIALLY blank family (one arm blank, the rest rendered) is not flagging at all.
  // The premise this test was written against - that conformanceScore({}, {}) returned
  // { structural: 1, geometry: 1, controls: 1, overall: 1 } - is now the behaviour being removed, so it is
  // recorded here rather than asserted: it was measured before the fix, and asserting it would make the test
  // require the bug.
  for (const [label, a, b] of [
    ['both empty', {}, {}],
    ['nullish', null, undefined],
    ['one side empty', { nodes: [{ tag: 'div' }] }, {}],
    ['boxes only on one side', { boxes: [{ tag: 'div' }] }, {}],
  ]) {
    assert.throws(
      () => conformanceScore(a, b),
      (error) => {
        assert.match(error.message, /conformanceScore/, 'the refusal must name the function');
        assert.match(error.message, /measur/i, 'and say that nothing was measured');
        return true;
      },
      `an unmeasurable signature must be refused rather than scored: ${label}`,
    );
  }
  // The positive, in the REAL signature shape: nodes are an array of {tag}, boxes carry x/y/w/h. My first
  // version of this fixture used width/height, which made boxScore return NaN - and the assertion was
  // `typeof overall === 'number'`, which NaN satisfies. So the test passed while measuring nothing. Assert
  // FINITE, not merely numeric: that is the same weaker-property mistake this bead is about.
  const rendered = { nodes: [{ tag: 'div' }, { tag: 'p' }], boxes: [{ tag: 'div', x: 0, y: 0, w: 10, h: 10 }], controls: [] };
  const scored = conformanceScore(rendered, rendered);
  assert.equal(scored.structural, 1, 'a rendered signature compared with itself is still perfect');
  for (const axis of ['structural', 'geometry', 'controls', 'overall']) {
    assert.ok(Number.isFinite(scored[axis]), `${axis} must be a real number, got ${scored[axis]}`);
  }
});

test('a family that measured nothing reports that, rather than 1.000 identity', () => {
  // The all-blank family must stay a RECORDED fact rather than a crash, because it is exactly what the
  // degenerate finding is for. But the numbers must stop claiming perfect agreement.
  const blank = (framework) => ({ framework, signature: {} });
  const identity = variantIdentity({ nodes: ['div'], boxes: [], controls: [] }, [
    blank('a'), blank('b'), blank('c'),
  ]);
  assert.equal(identity.degenerate, true, 'an all-blank family is degenerate');
  assert.notEqual(identity.identity.overall, 1, 'an all-blank family must not report perfect identity');
  assert.deepEqual(identity.pairwise, [], 'there is no pairwise measurement to report');
});
