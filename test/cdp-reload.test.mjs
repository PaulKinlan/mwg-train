import assert from 'node:assert/strict';
import test from 'node:test';
import { Page } from '../src/corpus/cdp.mjs';

function pageForReload({ settle = true, changeLoader = true } = {}) {
  let loader = 'old'; let ready = 'complete';
  const calls = [];
  const connection = { on() {}, async send(method, params) {
    calls.push(method);
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { loaderId: loader } } };
    if (method === 'Page.reload') {
      if (changeLoader) { loader = 'new'; ready = settle ? 'complete' : 'loading'; }
      return {};
    }
    if (method === 'Runtime.evaluate') return { result: { value: ready } };
    throw new Error(`unexpected CDP method ${method}`);
  } };
  return { page: new Page({ sessionId: 'trusted-fixture', connection }, { width: 800, height: 600 }), calls };
}

test('Page.reload waits for a changed loader ID and a complete new document', async () => {
  const { page, calls } = pageForReload();
  await page.reload({ timeout: 100 });
  assert.deepEqual(calls, ['Page.getFrameTree', 'Page.reload', 'Page.getFrameTree', 'Runtime.evaluate']);
});

test('Page.reload cannot mistake the old readyState=complete for a completed reload', async () => {
  const { page, calls } = pageForReload({ changeLoader: false });
  await assert.rejects(() => page.reload({ timeout: 75 }), /new main-frame document/);
  assert.equal(calls.includes('Runtime.evaluate'), false, 'old document readyState is not consulted until loader changed');
});

test('Page.reload cannot claim a new document while its readyState is still loading', async () => {
  const { page, calls } = pageForReload({ settle: false });
  await assert.rejects(() => page.reload({ timeout: 75 }), /new main-frame document/);
  assert.equal(calls.includes('Runtime.evaluate'), true);
});
