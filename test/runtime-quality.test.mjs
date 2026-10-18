import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { classifyRuntimeSample, countConnectedDomNodes, installRuntimeObservers, measureRuntimeQuality } from '../src/corpus/eval.mjs';

test('runtime samples refuse missing observations and distinguish retention suspicion from proof', () => {
  const empty = classifyRuntimeSample({ lcp: [], events: [], memory: [] });
  assert.equal(empty.status, 'NOT_MEASURED');
  assert.equal(typeof empty.reason, 'string');
  assert.equal(empty.lcp_proxy.status, 'NOT_MEASURED');
  assert.equal(empty.inp_sample.status, 'NOT_APPLICABLE');
  assert.equal(classifyRuntimeSample({ lcp: [], events: [], memory: [], interactionsDriven: 3 }).inp_sample.status, 'NOT_MEASURED');
  assert.equal(empty.detached_dom.status, 'INCONCLUSIVE');
  const samples = [0, 20, 40, 60].map((extra, index) => ({ documents: 1, expectedDocuments: 1, browsingContexts: 1,
    nodes: 100 + extra, liveNodes: 60, heapBytes: 100_000 + index * 40_000 }));
  const measured = classifyRuntimeSample({ lcp: [{ startTime: 175, size: 1000 }], events: [{ interactionId: 3, duration: 240 }], memory: samples });
  assert.equal(measured.lcp_proxy.status, 'OBSERVED');
  assert.equal(measured.inp_sample.status, 'SLOW_SAMPLE');
  assert.equal(measured.detached_dom.status, 'SUSPECTED_RETENTION');
  assert.equal(measured.status, 'MEASURED');
  assert.equal(measured.reason, null);
  const template = samples.map((row) => ({ ...row, documents: 2, expectedDocuments: 2 }));
  const templateResult = classifyRuntimeSample({ lcp: [], events: [], memory: template });
  assert.equal(templateResult.detached_dom.status, 'SUSPECTED_RETENTION');
  assert.deepEqual(templateResult.detached_dom.documentCounts, [2, 2, 2, 2]);
  assert.equal(classifyRuntimeSample({ lcp: [], events: [], memory: samples.map((row) => ({ ...row, documents: 2 })) }).detached_dom.status, 'INCONCLUSIVE',
    'an unexplained extra Document remains non-comparable');
  assert.equal(classifyRuntimeSample({ lcp: [], events: [], memory: template.map((row, index) => ({ ...row, documents: index ? 2 : 1 })) }).detached_dom.status, 'INCONCLUSIVE',
    'the first snapshot must not race the template owner-document materialisation');
  assert.equal(classifyRuntimeSample({ lcp: [], events: [], memory: template.map((row) => ({ ...row, browsingContexts: 2 })) }).detached_dom.status, 'INCONCLUSIVE',
    'a genuine child browsing context cannot masquerade as a template owner');
  const liveGrowth = samples.map((row, index) => ({ ...row, liveNodes: 60 + index * 20 }));
  const partial = classifyRuntimeSample({ lcp: [], events: [], memory: liveGrowth });
  assert.equal(partial.detached_dom.status, 'INCONCLUSIVE',
    'a growing live page is not evidence of a retained detached subtree');
  assert.equal(partial.status, 'NOT_MEASURED');
  assert.equal(classifyRuntimeSample({ lcp: [{ startTime: 10, size: 100 }], events: [], memory: liveGrowth }).status, 'PARTIAL');
});

test('connected-node count includes light DOM, open/closed shadow roots and template content', () => {
  const tree = { children: [{ shadowRoots: [
    { shadowRootType: 'open', children: [{ nodeName: 'B' }] },
    { shadowRootType: 'closed', children: [{ nodeName: 'I' }] },
  ], templateContent: { children: [{ nodeName: 'SPAN' }] } }] };
  assert.equal(countConnectedDomNodes(tree), 8);
});

test('missing trigger and sampling errors retain the same top-level status/reason contract', async () => {
  const page = { goto: async () => {}, waitForSettled: async () => {}, url: async () => 'http://localhost/',
    evaluate: async (source) => source.includes('__mwgRuntimeSample?.lcp') ? [{ startTime: 20, size: 100 }]
      : source.includes('querySelector(') ? { x: 1, y: 1 } : null,
    send: async () => { throw new Error('GC unavailable'); } };
  const absent = await measureRuntimeQuality(page, { url: 'http://localhost/', interactionSelector: null });
  assert.equal(absent.status, 'PARTIAL');
  assert.equal(typeof absent.reason, 'string');
  assert.equal(absent.inp_sample.status, 'NOT_APPLICABLE');
  const failed = await measureRuntimeQuality(page, { url: 'http://localhost/', interactionSelector: '#field' });
  assert.equal(failed.status, 'PARTIAL');
  assert.equal(typeof failed.reason, 'string');
  assert.match(failed.note, /GC unavailable/);
});

test('a real browser records hard-navigation paint, trusted interaction timing and retained detached DOM proxy', async (t) => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    const action = request.url === '/growing' || request.url === '/growing-template'
      ? `for (let i = 0; i < 90; i++) { const row = document.createElement('p'); row.textContent = 'Connected content ' + i; document.body.append(row); }`
      : request.url === '/shadow'
        ? `for (let i = 0; i < 90; i++) { const row = document.createElement('span'); row.textContent = 'Live shadow ' + i; window.connectedShadow.append(row); }`
        : `const detached = document.createElement('div');
        for (let i = 0; i < 90; i++) detached.append(document.createElement('span'));
        (window.retained ||= []).push(detached, new Array(12000).fill('retained'));`;
    const template = request.url?.includes('template') ? '<template id="inert"></template>' : '';
    const frame = request.url === '/iframe' ? '<iframe srcdoc="<p>child document</p>"></iframe>' : '';
    response.end(`<!doctype html><html><body><h1>Runtime probe with visible content</h1>
      <button id="probe">Run interaction</button><div id="host"></div>${template}${frame}<script>
      if (location.pathname === '/shadow') window.connectedShadow = document.querySelector('#host').attachShadow({ mode: 'closed' });
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
    assert.equal(result.status, 'MEASURED', JSON.stringify(result));
    const growing = await measureRuntimeQuality(page, { url: `http://127.0.0.1:${server.address().port}/growing`, interactionSelector: '#probe' });
    assert.equal(growing.detached_dom.status, 'INCONCLUSIVE', JSON.stringify(growing));
    assert.equal(growing.status, 'PARTIAL', JSON.stringify(growing));
    assert.ok(growing.detached_dom.liveNodeGrowth > 0, JSON.stringify(growing));
    const shadow = await measureRuntimeQuality(page, { url: `http://127.0.0.1:${server.address().port}/shadow`, interactionSelector: '#probe' });
    assert.equal(shadow.detached_dom.status, 'INCONCLUSIVE', JSON.stringify(shadow));
    assert.ok(shadow.detached_dom.liveNodeGrowth > 0, JSON.stringify(shadow));
    const templateLeak = await measureRuntimeQuality(page, { url: `http://127.0.0.1:${server.address().port}/leak-template`, interactionSelector: '#probe' });
    assert.equal(templateLeak.detached_dom.status, 'SUSPECTED_RETENTION', JSON.stringify(templateLeak));
    assert.equal(templateLeak.status, 'MEASURED', JSON.stringify(templateLeak));
    assert.ok(templateLeak.detached_dom.retainedNodeProxyGrowth >= 30, JSON.stringify(templateLeak));
    assert.deepEqual(templateLeak.detached_dom.documentCounts, [2, 2, 2, 2]);
    const growingTemplate = await measureRuntimeQuality(page, { url: `http://127.0.0.1:${server.address().port}/growing-template`, interactionSelector: '#probe' });
    assert.equal(growingTemplate.detached_dom.status, 'INCONCLUSIVE', JSON.stringify(growingTemplate));
    assert.ok(growingTemplate.detached_dom.liveNodeGrowth > 0, JSON.stringify(growingTemplate));
    const iframe = await measureRuntimeQuality(page, { url: `http://127.0.0.1:${server.address().port}/iframe`, interactionSelector: '#probe' });
    assert.equal(iframe.detached_dom.status, 'INCONCLUSIVE', JSON.stringify(iframe));
    assert.match(iframe.detached_dom.reason, /single-browsing-context/);
    assert.ok(iframe.detached_dom.browsingContexts.some((n) => n > 1), JSON.stringify(iframe));
    await page.close();
  } finally { if (chrome) await chrome.close(); }
});
