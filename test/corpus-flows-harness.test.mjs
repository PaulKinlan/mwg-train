/**
 * The harness's search / update / carried-step verdicts are pure functions precisely so they can be
 * tested exhaustively without a browser. These tests are mostly about the CONTROL cases - the ones
 * where a naive check would pass a broken flow:
 *   - an "absent from the results" token that the server never held proves nothing about filtering;
 *   - an "edit" that creates a second row passes the visible/stored checks and must fail on the row
 *     count;
 *   - a step whose value never reaches the record is two static pages, not a workflow.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { carryVerdict, recordRowCount, searchVerdict, seededMatchRefs, updateVerdict } from '../src/corpus/harness.mjs';

test('recordRowCount counts a JSON array of records', () => {
  assert.equal(recordRowCount('[{"ref":"a"},{"ref":"b"}]'), 2);
  assert.equal(recordRowCount('[]'), 0);
});

test('recordRowCount counts an object wrapping a records array', () => {
  assert.equal(recordRowCount('{"records":[{"ref":"a"}]}'), 1);
});

test('recordRowCount is null for a body it cannot count, so the count check fails rather than waives', () => {
  assert.equal(recordRowCount('not json'), null);
  assert.equal(recordRowCount('{"total": 3}'), null);
  assert.equal(recordRowCount(''), null);
});

test('seededMatchRefs binds the echoed value to the record identity the server issued', () => {
  const refs = seededMatchRefs({
    beforeText: '[]',
    afterText: '[{"ref":"r-match","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]',
    field: 'customer',
    value: 'Ada Lovelace',
  });
  assert.deepEqual(refs, ['r-match']);
});

test('seededMatchRefs binds only the record that appeared AFTER the before listing, so a pre-existing row with the same value cannot stand in (mwg-train-rssc)', () => {
  // The harness's own create journey writes the brief's record first, WITH the echoed value. If the
  // search seed then fails to persist, the listing still holds a row carrying that value - and taking
  // every matching row let that stale record answer for the seed.
  const refs = seededMatchRefs({
    beforeText: '[{"ref":"r-old","customer":"Ada Lovelace"}]',
    afterText: '[{"ref":"r-old","customer":"Ada Lovelace"},{"ref":"r-new","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]',
    field: 'customer',
    value: 'Ada Lovelace',
  });
  assert.deepEqual(refs, ['r-new']);
});

test('seededMatchRefs binds nothing when the seed did not persist, even though a pre-existing row holds the value', () => {
  const refs = seededMatchRefs({
    beforeText: '[{"ref":"r-old","customer":"Ada Lovelace"}]',
    afterText: '[{"ref":"r-old","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]',
    field: 'customer',
    value: 'Ada Lovelace',
  });
  assert.deepEqual(refs, []);
});

test('seededMatchRefs binds nothing from a listing it cannot read, a value no row holds, or no seeded value', () => {
  assert.deepEqual(seededMatchRefs({ beforeText: 'not json', afterText: '[{"ref":"r-match","customer":"Ada Lovelace"}]', field: 'customer', value: 'Ada Lovelace' }), []);
  assert.deepEqual(seededMatchRefs({ beforeText: '[]', afterText: 'not json', field: 'customer', value: 'Ada Lovelace' }), []);
  assert.deepEqual(seededMatchRefs({ beforeText: '[]', afterText: '[{"ref":"r-decoy","customer":"zzz-decoy-X"}]', field: 'customer', value: 'Ada Lovelace' }), []);
  assert.deepEqual(seededMatchRefs({ beforeText: '[]', afterText: '[{"ref":"r-match","customer":"Ada Lovelace"}]', field: 'customer', value: '' }), []);
});

test('seededMatchRefs falls back to the whole row when the listing renames the echoed field, and reads a wrapped body', () => {
  const refs = seededMatchRefs({
    beforeText: '{"records":[]}',
    afterText: '{"records":[{"id":"r-2","label":"Ada Lovelace"}]}',
    field: 'customer',
    value: 'Ada Lovelace',
  });
  assert.deepEqual(refs, ['r-2']);
});

test('searchVerdict passes when the container holds the expected tokens, hides the excluded one, and the server holds it', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Results: organic-apples-abc123',
    filteredRefs: ['ref-1'],
    unfilteredText: '[{"note":"organic-apples-abc123"},{"note":"zzz-unmatched-abc123"}]',
    includes: ['organic-apples-abc123'],
    excludes: ['zzz-unmatched-abc123'],
    matchRefs: ['ref-1'],
  });
  assert.equal(verdict.passed, true, JSON.stringify(verdict.detail));
  assert.deepEqual(verdict.detail.includesMissing, []);
  assert.deepEqual(verdict.detail.excludesLeaked, []);
  assert.deepEqual(verdict.detail.controlMissing, []);
  assert.deepEqual(verdict.detail.filteredRefs, ['ref-1']);
});

test('searchVerdict fails closed when the seeded record identity is unbound (mwg-train-rssc)', () => {
  // An unreadable listing, a seed that did not persist, or a results container the driver could not
  // bind to a stored record all leave matchRefs empty. The old verdict then fell through to
  // "non-empty results contain the query words", which a page echoing the query satisfies.
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Search for Ada Lovelace: Ada Lovelace',
    filteredRefs: ['r-any'],
    unfilteredText: '[{"ref":"r-match","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]',
    includes: ['Ada Lovelace'],
    excludes: ['zzz-decoy-X'],
    matchRefs: [],
  });
  assert.equal(verdict.passed, false, 'a search whose seeded record was never bound is not proven');
  assert.equal(verdict.detail.matchRefBound, false);
  assert.equal(verdict.detail.matchRefMissing, false);
  assert.deepEqual(verdict.detail.matchRefHits, []);
});

test('searchVerdict fails when a pre-existing record with the seeded value comes back instead of the newly seeded one (mwg-train-rssc)', () => {
  // before/after listings prove WHICH record this journey seeded: r-new. The results page returns the
  // record an earlier journey already stored (r-old), which carries the same echoed value.
  const beforeText = '[{"ref":"r-old","customer":"Ada Lovelace"}]';
  const afterText = '[{"ref":"r-old","customer":"Ada Lovelace"},{"ref":"r-new","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]';
  const matchRefs = seededMatchRefs({ beforeText, afterText, field: 'customer', value: 'Ada Lovelace' });
  assert.deepEqual(matchRefs, ['r-new']);
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Search for Ada Lovelace: Ada Lovelace',
    filteredRefs: ['r-old'],
    unfilteredText: afterText,
    includes: ['Ada Lovelace'],
    excludes: ['zzz-decoy-X'],
    matchRefs,
  });
  assert.equal(verdict.passed, false, 'an earlier record is not evidence that the search seed persisted');
  assert.equal(verdict.detail.matchRefBound, true);
  assert.equal(verdict.detail.matchRefMissing, true);
  assert.deepEqual(verdict.detail.matchRefHits, []);
});

test('searchVerdict fails when an expected token is missing from the filtered results', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Results: nothing relevant',
    filteredRefs: ['r-1'],
    unfilteredText: 'wanted-token zzz-unmatched',
    includes: ['wanted-token'],
    excludes: ['zzz-unmatched'],
    matchRefs: ['r-1'],
  });
  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.detail.includesMissing, ['wanted-token']);
});

test('searchVerdict fails when an excluded token leaks into the filtered results', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'organic-apples zzz-unmatched',
    filteredRefs: ['r-1'],
    unfilteredText: 'organic-apples zzz-unmatched',
    includes: ['organic-apples'],
    excludes: ['zzz-unmatched'],
    matchRefs: ['r-1'],
  });
  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.detail.excludesLeaked, ['zzz-unmatched']);
});

test('searchVerdict fails when the excluded token is absent from the UNFILTERED listing: the control that makes exclusion evidence', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'organic-apples',
    filteredRefs: ['r-1'],
    unfilteredText: 'organic-apples only',
    includes: ['organic-apples'],
    excludes: ['zzz-unmatched'],
    matchRefs: ['r-1'],
  });
  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.detail.controlMissing, ['zzz-unmatched']);
  assert.deepEqual(verdict.detail.controlPresent, []);
});

test('searchVerdict fails when the results container never rendered, even if the text would otherwise line up', () => {
  const verdict = searchVerdict({
    containerFound: false,
    filteredText: 'organic-apples',
    filteredRefs: ['r-1'],
    unfilteredText: 'organic-apples zzz-unmatched',
    includes: ['organic-apples'],
    excludes: ['zzz-unmatched'],
    matchRefs: ['r-1'],
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.containerFound, false);
});

test('searchVerdict fails with no excluded token at all: a search with nothing to hide is not shown to filter', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'organic-apples',
    filteredRefs: ['r-1'],
    unfilteredText: 'organic-apples',
    includes: ['organic-apples'],
    excludes: [],
    matchRefs: ['r-1'],
  });
  assert.equal(verdict.passed, false);
});

test('searchVerdict reports every missing and leaked token when several are declared', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'alpha beta-out',
    filteredRefs: ['r-1'],
    unfilteredText: 'alpha beta-out gamma-out',
    includes: ['alpha', 'beta', 'gamma'],
    excludes: ['beta-out', 'gamma-out'],
    matchRefs: ['r-1'],
  });
  assert.equal(verdict.passed, false);
  // Substring matching: 'beta-out' contains 'beta', so only 'gamma' is reported missing.
  assert.deepEqual(verdict.detail.includesMissing, ['gamma']);
  assert.deepEqual(verdict.detail.excludesLeaked, ['beta-out']);
  assert.deepEqual(verdict.detail.controlPresent, ['beta-out', 'gamma-out']);
});

test('searchVerdict fails on an empty result list under a page that echoes the query (mwg-train-rssc)', () => {
  // The exact reproduction: the results container shows the query and nothing else, both records exist
  // on the server, and the includes/excludes/control assertions all line up. Before the identity check,
  // this passed - the query echo was doing all the work.
  const unfilteredText = '[{"ref":"r-match","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]';
  const matchRefs = seededMatchRefs({ beforeText: '[]', afterText: unfilteredText, field: 'customer', value: 'Ada Lovelace' });
  assert.deepEqual(matchRefs, ['r-match']);
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Search for Ada Lovelace',
    filteredRefs: [],
    unfilteredText,
    includes: ['Ada Lovelace'],
    excludes: ['zzz-decoy-X'],
    matchRefs,
  });
  assert.equal(verdict.passed, false, 'a query echo with no returned record is not a search result');
  assert.deepEqual(verdict.detail.includesMissing, []);
  assert.deepEqual(verdict.detail.excludesLeaked, []);
  assert.deepEqual(verdict.detail.controlMissing, []);
  assert.equal(verdict.detail.refsObserved, false);
  assert.deepEqual(verdict.detail.matchRefs, ['r-match']);
});

test('searchVerdict fails when the results container exposes no returned record identity at all', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Search for Ada Lovelace',
    filteredRefs: [],
    unfilteredText: '[{"ref":"r-match","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]',
    includes: ['Ada Lovelace'],
    excludes: ['zzz-decoy-X'],
    matchRefs: ['r-match'],
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.refsObserved, false);
});

test('searchVerdict fails when the results carry a record identity, but not the seeded matching one', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Search for Ada Lovelace: Ada Lovelace',
    filteredRefs: ['r-decoy'],
    unfilteredText: '[{"ref":"r-match","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]',
    includes: ['Ada Lovelace'],
    excludes: ['zzz-decoy-X'],
    matchRefs: ['r-match'],
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.refsObserved, true);
  assert.equal(verdict.detail.matchRefMissing, true);
  assert.deepEqual(verdict.detail.matchRefHits, []);
});

test('searchVerdict passes when the seeded matching record identity comes back in the results', () => {
  const verdict = searchVerdict({
    containerFound: true,
    filteredText: 'Search for Ada Lovelace: Ada Lovelace',
    filteredRefs: [' r-match '],
    unfilteredText: '[{"ref":"r-match","customer":"Ada Lovelace"},{"ref":"r-decoy","customer":"zzz-decoy-X"}]',
    includes: ['Ada Lovelace'],
    excludes: ['zzz-decoy-X'],
    matchRefs: ['r-match'],
  });
  assert.equal(verdict.passed, true, JSON.stringify(verdict.detail));
  assert.deepEqual(verdict.detail.filteredRefs, ['r-match']);
  assert.deepEqual(verdict.detail.matchRefHits, ['r-match']);
  assert.equal(verdict.detail.matchRefMissing, false);
});

test('updateVerdict passes when the new value is visible and stored, the old one is gone, and the row count is unchanged', () => {
  const verdict = updateVerdict({
    ref: 'abc123',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Byron',
    pageText: 'Booking for Ada Byron',
    apiStatus: 200,
    apiText: '{"ref":"abc123","customer":"Ada Byron"}',
    rowsBefore: 1,
    rowsAfter: 1,
  });
  assert.equal(verdict.passed, true);
  assert.equal(verdict.detail.rowCountUnchanged, true);
  assert.equal(verdict.detail.oldValueGone, true);
  assert.equal(verdict.detail.newValueStored, true);
  assert.equal(verdict.detail.visibleAfterReload, true);
});

test('updateVerdict compares the FIELD, so a new value containing the old one still counts as replaced', () => {
  // 'Ada Lovelace (updated)' contains 'Ada Lovelace'. A substring test over the whole payload reports the
  // old value as still present in exactly the case where it was replaced - which failed every one of 76
  // live updates while the updates themselves had worked.
  const verdict = updateVerdict({
    ref: 'r1',
    field: 'customer',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Lovelace (updated)',
    pageText: 'Ada Lovelace (updated)',
    apiStatus: 200,
    apiText: JSON.stringify({ ref: 'r1', customer: 'Ada Lovelace (updated)' }),
    rowsBefore: 3,
    rowsAfter: 3,
  });
  assert.equal(verdict.passed, true, JSON.stringify(verdict.detail));
  assert.equal(verdict.detail.comparedAsField, true);
  assert.equal(verdict.detail.newValueStored, true);
  assert.equal(verdict.detail.oldValueGone, true);
});

test('updateVerdict still fails when the field genuinely kept the old value', () => {
  const verdict = updateVerdict({
    ref: 'r1',
    field: 'customer',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Lovelace (updated)',
    pageText: 'Ada Lovelace (updated)',
    apiStatus: 200,
    apiText: JSON.stringify({ ref: 'r1', customer: 'Ada Lovelace' }),
    rowsBefore: 3,
    rowsAfter: 3,
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.oldValueGone, false);
  assert.equal(verdict.detail.newValueStored, false);
});

test('updateVerdict falls back to the textual comparison, and says so, when the API is not JSON', () => {
  const verdict = updateVerdict({
    ref: 'r1',
    field: 'customer',
    oldValue: 'Ada Lovelace',
    newValue: 'Grace Hopper',
    pageText: 'Grace Hopper',
    apiStatus: 200,
    apiText: '<p>Grace Hopper</p>',
    rowsBefore: 1,
    rowsAfter: 1,
  });
  assert.equal(verdict.passed, true);
  assert.equal(verdict.detail.comparedAsField, false);
});

test('updateVerdict fails when the row count increased: a second row with the new value passes the other checks (tr-26 failure mode)', () => {
  const verdict = updateVerdict({
    ref: 'abc123',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Byron',
    pageText: 'Booking for Ada Byron',
    apiStatus: 200,
    apiText: '{"ref":"abc123","customer":"Ada Byron"}',
    rowsBefore: 1,
    rowsAfter: 2,
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.visibleAfterReload, true);
  assert.equal(verdict.detail.rowCountUnchanged, false);
});

test('updateVerdict fails when the server still holds the old value for the ref', () => {
  const verdict = updateVerdict({
    ref: 'abc123',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Byron',
    pageText: 'Booking for Ada Byron',
    apiStatus: 200,
    apiText: '{"ref":"abc123","customer":"Ada Lovelace"}',
    rowsBefore: 1,
    rowsAfter: 1,
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.oldValueGone, false);
  assert.equal(verdict.detail.newValueStored, false);
});

test('updateVerdict fails when the API does not answer 200: a missing endpoint makes "old value gone" vacuous', () => {
  const verdict = updateVerdict({
    ref: 'abc123',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Byron',
    pageText: 'Booking for Ada Byron',
    apiStatus: 404,
    apiText: 'not found',
    rowsBefore: 1,
    rowsAfter: 1,
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.oldValueGone, false);
  assert.equal(verdict.detail.newValueStored, false);
});

test('updateVerdict fails when the new value is not visible on the reloaded record page', () => {
  const verdict = updateVerdict({
    ref: 'abc123',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Byron',
    pageText: 'Booking for Ada Lovelace',
    apiStatus: 200,
    apiText: '{"ref":"abc123","customer":"Ada Byron"}',
    rowsBefore: 1,
    rowsAfter: 1,
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.visibleAfterReload, false);
});

test('updateVerdict fails when no ref could be obtained, rather than updating "some record"', () => {
  const verdict = updateVerdict({
    ref: null,
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Byron',
    pageText: 'Booking for Ada Byron',
    apiStatus: 200,
    apiText: '{"customer":"Ada Byron"}',
    rowsBefore: 1,
    rowsAfter: 1,
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.ref, null);
});

test('updateVerdict fails when the row count could not be read, instead of waiving the count check', () => {
  const verdict = updateVerdict({
    ref: 'abc123',
    oldValue: 'Ada Lovelace',
    newValue: 'Ada Byron',
    pageText: 'Booking for Ada Byron',
    apiStatus: 200,
    apiText: '{"ref":"abc123","customer":"Ada Byron"}',
    rowsBefore: null,
    rowsAfter: 1,
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.rowCountUnchanged, false);
});

test('carryVerdict passes when every expected text is visible on its landed page and carried into the record', () => {
  const verdict = carryVerdict({
    expectations: [
      { index: 0, expectText: 'Saturday 10am', pageText: 'You chose Saturday 10am' },
      { index: 1, expectText: 'Plot 7', pageText: 'Slot Saturday 10am for Plot 7' },
    ],
    recordText: 'Confirmed: Saturday 10am, Plot 7',
  });
  assert.equal(verdict.passed, true);
  assert.deepEqual(
    verdict.detail.steps,
    [
      { index: 0, expectText: 'Saturday 10am', visible: true, carriedToRecord: true },
      { index: 1, expectText: 'Plot 7', visible: true, carriedToRecord: true },
    ],
  );
});

test('carryVerdict fails when the expected text is not on the page the step landed on', () => {
  const verdict = carryVerdict({
    expectations: [{ index: 0, expectText: 'Saturday 10am', pageText: 'Choose a slot' }],
    recordText: 'Confirmed: Saturday 10am',
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.steps[0].visible, false);
  assert.equal(verdict.detail.steps[0].carriedToRecord, true);
});

test('carryVerdict fails when the carried value never reaches the final record: two static pages, not a workflow', () => {
  const verdict = carryVerdict({
    expectations: [{ index: 0, expectText: 'Saturday 10am', pageText: 'You chose Saturday 10am' }],
    recordText: 'Confirmed: your booking',
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.steps[0].visible, true);
  assert.equal(verdict.detail.steps[0].carriedToRecord, false);
});

test('carryVerdict reports each step independently when one of several fails', () => {
  const verdict = carryVerdict({
    expectations: [
      { index: 0, expectText: 'Saturday 10am', pageText: 'You chose Saturday 10am' },
      { index: 1, expectText: 'Plot 7', pageText: 'Nothing here' },
    ],
    recordText: 'Confirmed: Saturday 10am',
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.detail.steps[0].visible, true);
  assert.equal(verdict.detail.steps[0].carriedToRecord, true);
  assert.equal(verdict.detail.steps[1].visible, false);
  assert.equal(verdict.detail.steps[1].carriedToRecord, false);
});

test('carryVerdict with no expectations does not pass: a carry with nothing carried asserts nothing', () => {
  const verdict = carryVerdict({ expectations: [], recordText: 'anything' });
  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.detail.steps, []);
});
