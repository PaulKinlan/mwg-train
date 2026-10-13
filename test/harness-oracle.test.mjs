import test from 'node:test';
import assert from 'node:assert/strict';

import { driveUpdateJourney } from '../src/corpus/harness.mjs';

function makePage(formId, { createAction = null, editAction = 'Save changes', visibleAfterReload = true } = {}) {
  const stored = { ref: 'r-1', customer: 'Before' };
  const writes = [];
  const form = {
    id: formId,
    // A reloaded edit input reflects the persisted record, even when the page has no text echo.
    elements: [{ name: 'customer', get value() { return stored.customer; } }],
    querySelectorAll: () => [{ textContent: editAction }],
    setAttribute(name) { this.marker = name; },
  };
  const createForm = createAction === null ? null : {
    id: 'booking-create-form',
    elements: [{ name: 'customer' }],
    querySelectorAll: () => [{ textContent: createAction }],
    setAttribute(name) { this.marker = name; },
  };
  const document = { forms: createForm ? [createForm, form] : [form],
    body: { get innerText() { return visibleAfterReload ? `Booking ${stored.customer}` : 'Booking details'; } } };
  const fetch = async (url) => {
    if (url === '/records') return new Response(JSON.stringify([stored]));
    if (url === '/records/r-1') return new Response(JSON.stringify(stored));
    throw new Error(`undeclared route ${url}`);
  };
  return {
    writes,
    form,
    createForm,
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

test('record page with create and edit forms sharing the update field chooses the named edit action', async () => {
  for (const editId of ['booking-update-form', 'unrelated-wrapper']) {
    const page = makePage(editId, { createAction: 'Submit', editAction: 'Update' });
    const result = await driveUpdateJourney(page, 'http://example.test', journey, update, {
      recordUrl: 'http://example.test/bookings/r-1', interfaceContract,
    });
    assert.equal(result.verdict.passed, true, `${editId}: ${JSON.stringify(result.verdict.detail)}`);
    assert.equal(page.writes.length, 1);
    assert.equal(page.form.marker, 'data-mwg-oracle-update');
    assert.equal(page.createForm.marker, undefined, 'the create form must not be chosen for an edit');
  }
});

test('two matching form actions refuse ambiguity even if a wrapper id looks like the edit form', async () => {
  const page = makePage('edit-form', { createAction: 'Save booking', editAction: 'Update' });
  await assert.rejects(
    driveUpdateJourney(page, 'http://example.test', journey, update, {
      recordUrl: 'http://example.test/bookings/r-1', interfaceContract,
    }),
    /expected one update form for customer, found 2/,
  );
  assert.equal(page.writes.length, 0);
  assert.equal(page.createForm.marker, undefined);
  assert.equal(page.form.marker, undefined);
});

test('stored field visible only in an edit input does not satisfy the post-reload visible-text rule', async () => {
  const page = makePage('booking-update-form', { createAction: 'Submit', editAction: 'Update', visibleAfterReload: false });
  const result = await driveUpdateJourney(page, 'http://example.test', journey, update, {
    recordUrl: 'http://example.test/bookings/r-1', interfaceContract,
  });
  assert.equal(result.verdict.detail.newValueStored, true, 'the server-side update succeeded');
  assert.equal(page.form.elements[0].value, 'After', 'the reloaded edit input really contains the new value');
  assert.equal(await page.evaluate('return document.body.innerText'), 'Booking details',
    'the new value appears only in the input, not visible body text');
  assert.equal(result.verdict.detail.visibleAfterReload, false, 'an input value alone is not body.innerText');
  assert.equal(result.verdict.passed, false);
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
