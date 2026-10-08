/**
 * Derive the search / update / carried multi-step declarations for tr-* families.
 *
 * Usage:
 *   node scripts/set-brief-flows.mjs [--families tr-01,tr-26] [--out patch.json] [--manifest <path>]
 *
 * This writes a PATCH, not the manifest: the patch is handed to `scripts/set-brief-schema.mjs`, which
 * validates every family with `src/train/brief-schema.mjs` and refuses to write anything unless all of
 * them pass. Two reasons for the split rather than writing the manifest here - the writer already has the
 * both-variants-must-agree proof, and a generated patch is reviewable as data instead of being a diff of
 * 60 rewritten JSON lines.
 *
 * THE DECLARATIONS ARE DERIVED, NOT INVENTED, and each is tied to something the brief already states:
 *
 *   search.query        a word the brief's own create step submits, so the record this brief produces is
 *                       one its own query matches. (The schema enforces this too.)
 *   search.expectIncludes  the echoed value, which is what the read page shows and what lands in the row.
 *   search.expectAbsent    a token the harness seeds into a decoy record - the negative that separates a
 *                       filter from a list that ignores its query.
 *   update.field        the echoed field: the one value the read page is known to show, so an update to it
 *                       is observable rather than assumed.
 *   update.newValue     the echoed value with a suffix, which the schema requires to differ from what the
 *                       create step submitted - otherwise the update could pass without writing.
 *   steps[0]            a control the brief already declares, chosen on the first page of the flow, and
 *                       SUBMITTED - a step that only sets a control in the DOM carries nothing, and the
 *                       next page has no state to show. Without the submit the flow looks like a step and
 *                       proves nothing, which is exactly how this was found: the live run reported 0 of 80
 *                       carries passing while the first page answered 200.
 *   steps[1].expectText the value steps[0] chose, which must be visible on the NEXT page: the schema
 *                       refuses an expectation no earlier step supplied, because two static pages are not
 *                       a carried state.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { completeSelectorFieldName } from '../src/train/brief-schema.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const manifestPath = flag('--manifest', 'docs/train/briefs/manifest.jsonl');
const outPath = flag('--out', 'docs/train/briefs/flows.patch.json');
const only = flag('--families', null);
const wanted = only ? new Set(only.split(',').map((id) => id.trim())) : null;

const rows = readFileSync(manifestPath, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

/** The value the journey types into the field the read page echoes. */
function echoedSelectorFor(row) {
  const { fields = [], journey = {} } = row;
  const echoed = fields.find(
    (field) =>
      journey.fill &&
      Object.entries(journey.fill).some(
        ([selector, value]) => completeSelectorFieldName(selector) === field.name && String(value) === journey.expectText,
      ),
  );
  if (!echoed) return null;
  const selector = Object.keys(journey.fill).find((candidate) => completeSelectorFieldName(candidate) === echoed.name);
  return selector ? { field: echoed, selector } : null;
}

/** A word from the echoed value that the create step therefore submits. */
function queryFor(expectedText) {
  const words = String(expectedText ?? '').split(/\s+/).filter((word) => word.length >= 3);
  return words[0] ?? String(expectedText ?? '');
}

const patch = {};
const skipped = [];
for (const row of rows) {
  if (wanted && !wanted.has(row.family_id)) continue;
  if (patch[row.family_id]) continue;
  if (!row.fields || !row.journey) {
    skipped.push(`${row.family_id}: rides the archetype, nothing authored to extend`);
    continue;
  }
  const echoed = echoedSelectorFor(row);
  if (!echoed) {
    skipped.push(`${row.family_id}: no echoed field to change, so an update would not be observable`);
    continue;
  }
  const selectField = row.fields.find((field) => field.type === 'select');
  const selectSelector = selectField
    ? Object.keys(row.journey.select ?? {}).find((selector) => completeSelectorFieldName(selector) === selectField.name)
    : undefined;
  const chosenOption = selectSelector ? row.journey.select[selectSelector] : undefined;

  // An update needs a record page to edit. Families whose read is a session page (no parameterised
  // route) cannot have one: the generator injects the edit form on the read-by-reference route, so the
  // declaration would be driveable nowhere - the schema refuses it too, and this is the reasoned skip
  // rather than letting that refusal fail the whole patch.
  const hasRecordPage = (row.routes ?? []).some((route) => /^\/.*:[A-Za-z]/.test(String(route)));
  if (!hasRecordPage) {
    skipped.push(
      `${row.family_id}: read is a session page, not a record read by reference (${JSON.stringify(row.routes ?? [])}), so the update flow has no page to edit`,
    );
  }

  const steps = selectSelector && chosenOption
    ? [
        { path: '/intake', select: { [selectSelector]: chosenOption }, submit: 'form' },
        { path: '/intake/confirm', expectText: chosenOption },
      ]
    : [
        { path: '/intake', fill: { [echoed.selector]: row.journey.expectText }, submit: 'form' },
        { path: '/intake/confirm', expectText: row.journey.expectText },
      ];

  // Built explicitly rather than spread-then-overlaid: a family that cannot carry an update may still have
  // one left in the manifest from an earlier pass, and a spread would faithfully re-emit it.
  const journey = {
    ...row.journey,
    search: {
      path: '/search',
      queryParam: 'q',
      query: queryFor(row.journey.expectText),
      resultsSelector: '#search-results',
      expectIncludes: [row.journey.expectText],
      expectAbsent: ['zzz-decoy'],
    },
    steps,
  };
  if (hasRecordPage) journey.update = { field: echoed.field.name, newValue: `${row.journey.expectText} (updated)` };
  else delete journey.update;

  patch[row.family_id] = { fields: row.fields, journey };
}

writeFileSync(outPath, `${JSON.stringify(patch, null, 2)}\n`);
console.log(`set-brief-flows: ${Object.keys(patch).length} family(s) declared -> ${outPath}`);
for (const note of skipped) console.log(`set-brief-flows: skipped ${note}`);
