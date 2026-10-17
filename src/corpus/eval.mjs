/* Bounded, diagnostic browser measurements. These are lab samples, not field CWV or proof
 * that a page is leak-free. They never change the preregistered acceptance denominator. */

const OBSERVER_SOURCE = `(() => {
  const sample = { lcp: [], events: [], support: typeof PerformanceObserver === 'undefined' ? [] : PerformanceObserver.supportedEntryTypes ?? [] };
  Object.defineProperty(window, '__mwgRuntimeSample', { value: sample, configurable: true });
  if (sample.support.includes('largest-contentful-paint')) {
    new PerformanceObserver((list) => { for (const entry of list.getEntries())
      sample.lcp.push({ startTime: entry.startTime, size: entry.size });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  }
  if (sample.support.includes('event')) {
    new PerformanceObserver((list) => { for (const entry of list.getEntries())
      if (entry.interactionId > 0) sample.events.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId });
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  }
})()`;

export async function installRuntimeObservers(page) {
  return page.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SOURCE });
}

export function classifyRuntimeSample({ lcp, events, memory, interactionsDriven = 0 }) {
  const lcpEntry = lcp?.filter((entry) => Number.isFinite(entry.startTime) && entry.size > 0).at(-1);
  const lcpProxy = lcpEntry
    ? { status: lcpEntry.startTime > 2500 ? 'SLOW_SAMPLE' : 'OBSERVED', milliseconds: Math.round(lcpEntry.startTime), source: 'largest-contentful-paint observer; local hard navigation only' }
    : { status: 'NOT_MEASURED', milliseconds: null, reason: 'no non-empty LCP candidate observed' };
  const interactions = events?.filter((entry) => entry.interactionId > 0 && Number.isFinite(entry.duration)) ?? [];
  const worst = interactions.length ? Math.max(...interactions.map((entry) => entry.duration)) : null;
  const inpSample = worst === null
    ? { status: interactionsDriven ? 'NOT_MEASURED' : 'NOT_APPLICABLE', milliseconds: null,
        interactionsDriven, reason: interactionsDriven ? 'trusted clicks ran but Event Timing recorded no interaction of at least 16 ms' : 'no interaction was driven' }
    : { status: worst > 200 ? 'SLOW_SAMPLE' : 'OBSERVED', milliseconds: Math.round(worst), interactionsDriven,
        interactions: new Set(interactions.map((entry) => entry.interactionId)).size,
        source: 'largest observed Event Timing interaction in this lab probe; not field INP' };
  const samples = Array.isArray(memory) ? memory : [];
  const stableDocuments = samples.length === 4 && samples.every((entry) => entry.documents === 1);
  const retained = samples.map((entry) => entry.nodes - entry.liveNodes);
  const monotonic = retained.length === 4 && retained.every((value, index) => index === 0 || value >= retained[index - 1]);
  const liveStable = samples.length === 4 && samples.every((entry) => entry.liveNodes === samples[0].liveNodes);
  const growth = samples.length === 4 ? retained[3] - retained[0] : null;
  const heapGrowth = samples.length === 4 ? samples[3].heapBytes - samples[0].heapBytes : null;
  const detachedDom = !stableDocuments || !samples.every((entry) => Number.isFinite(entry.nodes) && Number.isFinite(entry.liveNodes) && Number.isFinite(entry.heapBytes))
    ? { status: 'INCONCLUSIVE', reason: 'four comparable post-GC single-document samples were not available' }
    : !liveStable ? { status: 'INCONCLUSIVE', reason: 'connected DOM node count changed across interactions; retained-node growth cannot be isolated',
      liveNodeGrowth: samples[3].liveNodes - samples[0].liveNodes }
      : { status: monotonic && growth >= 30 && heapGrowth >= 65_536 ? 'SUSPECTED_RETENTION' : 'NO_GROWTH_OBSERVED',
          retainedNodeProxyGrowth: growth, heapByteGrowth: heapGrowth, samples: samples.length,
          note: 'CDP DOM-node count minus connected document nodes is a retained-node proxy, not an exact detached-node count; short sampling cannot prove absence of leaks' };
  return { lcp_proxy: lcpProxy, inp_sample: inpSample, detached_dom: detachedDom };
}

async function memorySample(page) {
  await page.send('HeapProfiler.collectGarbage');
  const [dom, heap, liveNodes] = await Promise.all([
    page.send('Memory.getDOMCounters'), page.send('Runtime.getHeapUsage'),
    page.evaluate(`
      // Include connected text/comment nodes: element-only counts mistake newly added text
      // in a healthy live app for retained detached DOM.
      const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
      let count = 0;
      while (walker.nextNode()) count += 1;
      return count + 1;
    `),
  ]);
  return { documents: dom.documents, nodes: dom.nodes, liveNodes, heapBytes: heap.usedSize };
}

/** Run after the functional and security checks, on the same isolated page. */
export async function measureRuntimeQuality(page, { url, interactionSelector }) {
  await page.goto(url);
  await page.waitForSettled();
  const lcp = await page.evaluate(`return window.__mwgRuntimeSample?.lcp ?? []`);
  const target = interactionSelector ? await page.evaluate(`
    const el = document.querySelector(${JSON.stringify(interactionSelector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  `) : null;
  if (!target) return { ...classifyRuntimeSample({ lcp, events: [], memory: [] }),
    note: 'interaction selector absent or not visible; no same-document memory cycles were driven' };
  // Four post-GC samples across repeated trusted interactions. Nothing is inferred from one
  // allocation: GC noise and legitimate live DOM changes would look like a leak otherwise.
  const memory = [];
  let interactionsDriven = 0;
  const initialUrl = await page.url();
  try {
    memory.push(await memorySample(page));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.realPointer(target.x, target.y);
      interactionsDriven += 1;
      if (await page.url() !== initialUrl) throw new Error('interaction navigated away from the sampled document');
      memory.push(await memorySample(page));
    }
  } catch (error) {
    return { ...classifyRuntimeSample({ lcp, events: [], memory, interactionsDriven }), note: `runtime sampling stopped: ${error.message}` };
  }
  const events = await page.evaluate(`return window.__mwgRuntimeSample?.events ?? []`);
  return classifyRuntimeSample({ lcp, events, memory, interactionsDriven });
}
