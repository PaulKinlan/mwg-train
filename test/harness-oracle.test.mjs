import test from 'node:test';
import assert from 'node:assert/strict';

import { driveUpdateJourney } from '../src/corpus/harness.mjs';

function makePage(formId) {
  const stored = { ref: 'r-1', customer: 'Before' };
  const writes = [];
  const form = {
    id: formId,
    elements: [{ name: 'customer' }],
    querySelectorAll: () => [{ textContent: 'Save changes' }],
    setAttribute(name) { this.marker = name; },
  };
  const document = { forms: [form], body: { get innerText() { return `Booking ${stored.customer}`; } } };
  const fetch = async (url) => {
    if (url === '/records') return new Response(JSON.stringify([stored]));
    if (url === '/records/r-1') return new Response(JSON.stringify(stored));
    throw new Error(`undeclared route ${url}`);
  };
  return {
    writes,
    form,
    async goto(url) { assert.equal(url, 'http://example.test/bookings/r-1'); },
    async evaluate(source) {
      return Function('document', 'fetch', `return (async () => { ${source} })()`)(document, fetch);
    },
    async type(selector, value) {
      assert.equal(form.marker, 'data-mwg-oracle-update');
      assert.equal(selector, 'form[data-mwg-oracle-update] [name="customer"]');
      writes.push({ selector, value });
    },
    async submit(selector) {
      assert.equal(selector, 'form[data-mwg-oracle-update]');
      stored.customer = writes.at(-1).value;
    },
  };
}

const journey = { fill: { 'form [name="customer"]': 'Before' } };
const update = { field: 'customer', newValue: 'After' };
const interfaceContract = { records: '/records', record: '/records/{ref}', current: '/me' };

test('the same update journey passes for unrelated wrapper IDs without a scaffold selector or route', async () => {
  for (const id of ['edit-form', 'booking-update-form', 'an-arbitrary-wrapper']) {
    const page = makePage(id);
    const result = await driveUpdateJourney(page, 'http://example.test', journey, update, {
      recordUrl: 'http://example.test/bookings/r-1', interfaceContract,
    });
    assert.equal(result.verdict.passed, true, `${id}: ${JSON.stringify(result.verdict.detail)}`);
    assert.equal(page.writes.length, 1);
    assert.equal(page.writes[0].value, 'After');
  }
});

test('an ambiguous update form is refused rather than selecting a scaffold ID or the first match', async () => {
  const page = makePage('first');
  page.form.querySelectorAll = () => [];
  page.evaluate = async (source) => {
    if (source.includes('document.forms')) return { count: 2 };
    return { status: 200, body: JSON.stringify([{ ref: 'r-1', customer: 'Before' }]) };
  };
  await assert.rejects(
    driveUpdateJourney(page, 'http://example.test', journey, update, {
      recordUrl: 'http://example.test/bookings/r-1', interfaceContract,
    }),
    /expected one update form for customer, found 2/,
  );
});
