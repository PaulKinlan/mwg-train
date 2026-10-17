import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateStateJourney, validateStateJourney } from '../src/corpus/state-persistence.mjs';
import { archetypeFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { buildProjectFor } from '../pilot/frameworks.mjs';
import { resolve } from 'node:path';

const BASE = 'http://127.0.0.1:9000';
const contract = { startPath: '/workspace', detourPath: '/roadmap',
  actions: [{ type: 'pointer', selector: '#move' }],
  observations: [{ selector: '#issue-status', property: 'text', equals: 'In Progress' }] };

function fakePage({ keepReload = true, keepBack = true, keepSecondReload = true, initial = false } = {}) {
  const calls = []; const entries = []; let index = -1; let reloads = 0;
  let state = initial ? 'In Progress' : 'Triage'; let href = '';
  const page = {
    calls, network: [],
    async goto(url) {
      calls.push(`goto ${url}`); href = url;
      entries.splice(index + 1); entries.push({ id: entries.length + 1, url }); index = entries.length - 1;
      page.network.push({ url, status: 200 });
    },
    async url() { return href; },
    async reload() {
      calls.push('Page.reload'); reloads++;
      if (!keepReload || (!keepSecondReload && reloads === 2)) state = 'Triage';
    },
    async realPointer(x, y) { calls.push(`pointer ${x},${y}`); state = 'In Progress'; },
    async evaluate(source) {
      if (source.includes('getBoundingClientRect()')) return { x: 10, y: 20 };
      if (source.includes('map(({selector, property')) return [{ found: true, matches: state === 'In Progress' }];
      if (source.includes('document.readyState')) return 'complete';
      throw new Error(`unexpected evaluate: ${source.slice(0, 80)}`);
    },
    async send(method, args) {
      calls.push(method);
      if (method === 'Page.getNavigationHistory') return { currentIndex: index, entries: structuredClone(entries) };
      if (method === 'Page.navigateToHistoryEntry') {
        index = entries.findIndex(({ id }) => id === args.entryId);
        href = entries[index]?.url ?? '';
        if (!keepBack) state = 'Triage';
        return {};
      }
      throw new Error(`unexpected CDP method ${method}`);
    },
  };
  return page;
}

test('non-form CDP contract requires a changed state, new document, browser Back, and another new document', async () => {
  const page = fakePage();
  const result = await evaluateStateJourney(page, BASE, contract);
  assert.equal(result.status, 'PASS', result.detail);
  assert.deepEqual(page.calls.filter((call) => call === 'Page.reload'), ['Page.reload', 'Page.reload']);
  assert.ok(page.calls.includes('Page.navigateToHistoryEntry'));
  assert.ok(page.calls.includes('pointer 10,20'));
  assert.deepEqual(result.observed, { checks: 1, source: 'CDP trusted input + rendered DOM' });
});

test('a live DOM-only change cannot pass the true reload assertion', async () => {
  const result = await evaluateStateJourney(fakePage({ keepReload: false }), BASE, contract);
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /true document reload/);
});

test('browser Back losing progress fails even when the first reload retained it', async () => {
  const result = await evaluateStateJourney(fakePage({ keepBack: false }), BASE, contract);
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /browser Back/);
});

test('a bfcache-only restored page fails the behavioural check after the second new document', async () => {
  const page = fakePage({ keepSecondReload: false });
  const result = await evaluateStateJourney(page, BASE, contract);
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /survived Back only in a cached document, not after reload: #issue-status.text mismatched/);
  assert.deepEqual(result.observed.failed, [{ selector: '#issue-status', property: 'text', reason: 'mismatched' }]);
  assert.equal(page.calls.filter((call) => call === 'Page.reload').length, 2);
});

test('a failed observation reports the selector and whether it is missing or mismatched', async () => {
  const page = fakePage();
  const evaluate = page.evaluate.bind(page);
  page.evaluate = async (source) => source.includes('map(({selector, property') ?
    [{ found: false, matches: false }, { found: true, matches: false }] : evaluate(source);
  const result = await evaluateStateJourney(page, BASE, { ...contract, observations: [
    { selector: '#missing', property: 'value', equals: 'A' },
    { selector: '#visible', property: 'attribute', attribute: 'aria-pressed', equals: 'true' },
  ] });
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /#missing.value missing or not rendered.*#visible.attribute mismatched/);
  assert.deepEqual(result.observed.failed, [
    { selector: '#missing', property: 'value', reason: 'missing or not rendered' },
    { selector: '#visible', property: 'attribute', attribute: 'aria-pressed', reason: 'mismatched' },
  ]);
});

test('a static result already present before input cannot claim persistence', async () => {
  const page = fakePage({ initial: true });
  const result = await evaluateStateJourney(page, BASE, contract);
  assert.equal(result.status, 'ERROR');
  assert.match(result.detail, /before any action/);
  assert.equal(page.calls.some((call) => call.startsWith('pointer')), false);
});

test('missing contract, cross-origin routes and non-observable steps refuse before browsing', () => {
  assert.throws(() => validateStateJourney({ ...contract, detourPath: '//evil.example/' }, BASE), /root-relative/);
  assert.throws(() => validateStateJourney({ ...contract, detourPath: '/\\evil.example/' }, BASE), /escapes the measured origin/);
  assert.throws(() => validateStateJourney({ ...contract, detourPath: '/workspace' }, BASE), /different route/);
  assert.throws(() => validateStateJourney({ ...contract, actions: [] }, BASE), /actions/);
  assert.throws(() => validateStateJourney({ ...contract, observations: [{ selector: '#x', property: 'text' }] }, BASE), /observation/);
  assert.throws(() => validateStateJourney({ ...contract, actions: [{ type: 'pointer', selector: '' }] }, BASE), /action/);
});

test('an opt-in spec survives validation, archetype conversion and generated spec writing without changing old form-only specs', () => {
  const source = specForFamily('booking', resolve(import.meta.dirname, '..'));
  const opted = { ...source, state_journey: contract };
  assert.deepEqual(validateSpec(opted), []);
  assert.deepEqual(archetypeFromSpec(opted).stateJourney, contract);
  assert.deepEqual(buildProjectFor(archetypeFromSpec(opted), { frameworkName: 'raw' }).spec.state_journey, contract);
  assert.equal('state_journey' in buildProjectFor(archetypeFromSpec(source), { frameworkName: 'raw' }).spec, false);
  assert.match(validateSpec({ ...source, state_journey: { ...contract, detourPath: '//bad.example' } }).join(' '), /state_journey/);
});

test('the state check does not let a missing detour response masquerade as navigation evidence', async () => {
  const page = fakePage();
  const navigate = page.goto.bind(page);
  page.goto = async (url) => { await navigate(url); if (url.endsWith('/roadmap')) page.network.pop(); };
  const result = await evaluateStateJourney(page, BASE, contract);
  assert.equal(result.status, 'ERROR');
  assert.match(result.detail, /not observed as an HTTP success/);
});
