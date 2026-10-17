import assert from 'node:assert/strict';
import test from 'node:test';
import { driveJourney, stepStateVerdict } from '../src/corpus/harness.mjs';
import { journeyWorks } from '../src/corpus/accept.mjs';

const BASE = 'http://127.0.0.1:9000';
const journey = {
  startPath: '/start', formSelector: 'form#finish', fill: { 'input[name=owner]': 'Ari' },
  steps: [
    { path: '/step', fill: { 'input[name=choice]': 'PERSISTED-CHOICE' }, submit: 'form#draft' },
    { path: '/step2', expectText: 'PERSISTED-CHOICE' },
  ],
};

function fakePage({ loseOnRevisit = false, loseOnReload = false, recordLost = false, preseeded = false } = {}) {
  let url = ''; let choice = preseeded ? 'PERSISTED-CHOICE' : ''; let visitingAgain = false; let didReloadStep = false;
  const page = {
    calls: [], network: [],
    async goto(target) {
      page.calls.push(`goto ${target}`);
      if (target === `${BASE}/step` && choice) visitingAgain = true;
      url = target; page.network.push({ url, status: 200 });
    },
    async url() { return url; },
    async type(selector, value) { page.calls.push(`type ${selector}`); if (selector === 'input[name=choice]') choice = value; },
    async submit(selector) {
      page.calls.push(`submit ${selector}`);
      url = url === `${BASE}/step` ? `${BASE}/step2` : `${BASE}/record`;
      page.network.push({ url, status: 200 }); return { valid: true };
    },
    async reload() { page.calls.push(`reload ${url}`); if (url === `${BASE}/step`) didReloadStep = true; },
    async waitFor() { return true; },
    async evaluate(source) {
      if (source.includes('const checks =')) return { url, checks: [{ selector: 'input[name=choice]',
        ok: Boolean(choice) && !(loseOnRevisit && visitingAgain) && !(loseOnReload && didReloadStep) }] };
      if (source === 'return document.body.innerText') return url.endsWith('/step2') ? `Selected ${choice}` : '';
      if (source.includes('return { url: location.href, text:')) return { url, text: recordLost ? '' : `Record: ${choice}`, echoed: choice };
      if (source.includes("document.getElementById('record-echo')?.innerText")) return choice;
      throw new Error(`unexpected page expression ${source.slice(0, 80)}`);
    },
  };
  return page;
}

test('the production journey driver reads a submitted draft after re-navigation and a true reload, and the gate requires it', async () => {
  const page = fakePage();
  const result = await driveJourney(page, BASE, journey);
  assert.equal(result.state.passed, true);
  assert.equal(result.carry.passed, true);
  assert.deepEqual(result.state.checks.map(({ navigated, reloaded }) => [navigated, reloaded]), [[true, true], [true, true]]);
  assert.ok(page.calls.includes(`goto ${BASE}/step`));
  assert.ok(page.calls.includes(`reload ${BASE}/step`));
  assert.ok(page.calls.includes(`reload ${BASE}/step2`));
  assert.ok(page.calls.includes(`reload ${BASE}/record`));
  const record = { journeys: [{ name: 'server-persistence', ...result }, { name: 'validation-failure' }],
    echo_expect: 'PERSISTED-CHOICE', expected_step_persistence: true };
  assert.equal(journeyWorks(record).ok, true);
});

test('a static prefilled fixture cannot pass when no field changed from baseline', async () => {
  const result = await driveJourney(fakePage({ preseeded: true }), BASE, journey);
  assert.equal(result.carry.passed, true);
  assert.equal(result.state.checks.find(({ kind }) => kind === 'draft control').baselineDifferent, false);
  assert.equal(result.state.passed, false);
});

test('a draft that disappears on returning to its step fails the persisted-state gate even if the final record echoes it', async () => {
  const result = await driveJourney(fakePage({ loseOnRevisit: true }), BASE, journey);
  assert.equal(result.carry.passed, true);
  assert.equal(result.state.passed, false);
  assert.match(journeyWorks({ journeys: [{ name: 'server-persistence', ...result }, { name: 'validation-failure' }],
    echo_expect: 'PERSISTED-CHOICE', expected_step_persistence: true }).problems.join(' '), /step re-navigation/);
});

test('a draft that survives navigation but disappears on new document fails', async () => {
  const result = await driveJourney(fakePage({ loseOnReload: true }), BASE, journey);
  const field = result.state.checks.find(({ kind }) => kind === 'draft control');
  assert.equal(field.navigated, true);
  assert.equal(field.reloaded, false);
  assert.equal(result.state.passed, false);
});

test('carry cannot be excused by a valid reload of a draft when the final record drops it', async () => {
  const result = await driveJourney(fakePage({ recordLost: true }), BASE, journey);
  assert.equal(result.state.passed, true);
  assert.equal(result.carry.passed, false);
  assert.match(journeyWorks({ journeys: [{ name: 'server-persistence', ...result }, { name: 'validation-failure' }],
    echo_expect: 'PERSISTED-CHOICE', expected_step_persistence: true }).problems.join(' '), /carried through/);
});

test('an empty state vector is unmeasured and a declared non-form state must have a PASS verdict', () => {
  assert.equal(stepStateVerdict([]).passed, false);
  const result = journeyWorks({ journeys: [{ name: 'server-persistence', steps: [{ step: 'reload' }], echoedText: 'seed' },
    { name: 'validation-failure' }, { name: 'state-persistence', status: 'ERROR', detail: 'CDP unavailable' }],
  echo_expect: 'seed', expected_state_journey: true });
  assert.equal(result.ok, false);
  assert.match(result.problems.join(' '), /CDP unavailable/);
});
