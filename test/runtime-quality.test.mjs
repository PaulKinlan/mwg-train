import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { classifyRuntimeSample, installRuntimeObservers, measureRuntimeQuality } from '../src/corpus/eval.mjs';

test('runtime samples refuse missing observations and distinguish retention suspicion from proof', () => {
  const empty = classifyRuntimeSample({ lcp: [], events: [], memory: [] });
  assert.equal(empty.lcp_proxy.status, 'NOT_MEASURED');
  assert.equal(empty.inp_sample.status, 'NOT_APPLICABLE');
  assert.equal(classifyRuntimeSample({ lcp: [], events: [], memory: [], interactionsDriven: 3 }).inp_sample.status, 'NOT_MEASURED');
  assert.equal(empty.detached_dom.status, 'INCONCLUSIVE');
  const samples = [0, 20, 40, 60].map((extra, index) => ({ documents: 1, nodes: 100 + extra, liveNodes: 60, heapBytes: 100_000 + index * 40_000 }));
  const measured = classifyRuntimeSample({ lcp: [{ startTime: 175, size: 1000 }], events: [{ interactionId: 3, duration: 240 }], memory: samples });
  assert.equal(measured.lcp_proxy.status, 'OBSERVED');
  assert.equal(measured.inp_sample.status, 'SLOW_SAMPLE');
  assert.equal(measured.detached_dom.status, 'SUSPECTED_RETENTION');
  assert.equal(classifyRuntimeSample({ lcp: [], events: [], memory: samples.map((row) => ({ ...row, documents: 2 })) }).detached_dom.status, 'INCONCLUSIVE');
  const liveGrowth = samples.map((row, index) => ({ ...row, liveNodes: 60 + index * 20 }));
  assert.equal(classifyRuntimeSample({ lcp: [], events: [], memory: liveGrowth }).detached_dom.status, 'INCONCLUSIVE',
    'a growing live page is not evidence of a retained detached subtree');
});

test('a real browser records hard-navigation paint, trusted interaction timing and retained detached DOM proxy', async (t) => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    const action = request.url === '/growing'
      ? `for (let i = 0; i < 90; i++) { const row = document.createElement('p'); row.textContent = 'Connected content ' + i; document.body.append(row); }`
      : `const detached = document.createElement('div');
        for (let i = 0; i < 90; i++) detached.append(document.createElement('span'));
        (window.retained ||= []).push(detached, new Array(12000).fill('retained'));`;
    response.end(`<!doctype html><html><body><h1>Runtime probe with visible content</h1>
      <button id="probe">Run interaction</button><script>
      document.getElementById('probe').addEventListener('click', () => {
        ${action}
        const until = performance.now() + 65;
        while (performance.now() < until) {};
      });</script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  let chrome;
  try {
    chrome = await launchChrome();
    const page = await chrome.newPage();
    await installRuntimeObservers(page);
    const result = await measureRuntimeQuality(page, { url: `http://127.0.0.1:${server.address().port}/`, interactionSelector: '#probe' });
    assert.equal(result.lcp_proxy.status, 'OBSERVED', JSON.stringify(result));
    assert.ok(['OBSERVED', 'SLOW_SAMPLE'].includes(result.inp_sample.status), JSON.stringify(result));
    assert.ok(result.inp_sample.milliseconds >= 16, JSON.stringify(result));
    assert.equal(result.detached_dom.status, 'SUSPECTED_RETENTION', JSON.stringify(result));
    const growing = await measureRuntimeQuality(page, { url: `http://127.0.0.1:${server.address().port}/growing`, interactionSelector: '#probe' });
    assert.equal(growing.detached_dom.status, 'INCONCLUSIVE', JSON.stringify(growing));
    assert.ok(growing.detached_dom.liveNodeGrowth > 0, JSON.stringify(growing));
    await page.close();
  } finally { if (chrome) await chrome.close(); }
});
