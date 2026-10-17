// An opt-in browser contract for complex, non-form journeys. A static reference board, URL
// string or storage key is never itself evidence: we drive an action and observe rendered state.
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const selector = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;

function localUrl(base, path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('#')) {
    throw new Error('state journey paths must be root-relative, without fragments');
  }
  const url = new URL(path, base);
  if (url.origin !== new URL(base).origin) throw new Error('state journey path escapes the measured origin');
  return url.href;
}

export function validateStateJourney(contract, base) {
  if (!contract || typeof contract !== 'object') throw new Error('state journey needs a declared contract');
  const startUrl = localUrl(base, contract.startPath);
  const detourUrl = localUrl(base, contract.detourPath);
  if (startUrl === detourUrl) throw new Error('state journey detour must be a different route');
  if (!Array.isArray(contract.actions) || !contract.actions.length || contract.actions.length > 16 ||
      !Array.isArray(contract.observations) || !contract.observations.length || contract.observations.length > 16) {
    throw new Error('state journey needs 1–16 actions and 1–16 rendered-state observations');
  }
  for (const action of contract.actions) {
    if (!selector(action.selector) || !['pointer', 'type', 'select', 'key'].includes(action.type)) {
      throw new Error('state journey action needs a selector and a supported trusted input type');
    }
    if (['type', 'select'].includes(action.type) && (typeof action.value !== 'string' || action.value.length > 512)) {
      throw new Error('state journey type/select needs a bounded string value');
    }
    if (action.type === 'key' && !['Enter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(action.key)) {
      throw new Error('state journey key must be an explicitly supported browser key');
    }
  }
  for (const observation of contract.observations) {
    if (!selector(observation.selector) || !['text', 'value', 'checked', 'attribute'].includes(observation.property) ||
        (observation.property === 'checked' ? typeof observation.equals !== 'boolean' : typeof observation.equals !== 'string') ||
        (observation.property === 'attribute' && !selector(observation.attribute))) {
      throw new Error('state journey observation needs a selector, supported property and expected value');
    }
  }
  return { startUrl, detourUrl };
}

async function observe(page, expectations, { waitMs = 1200 } = {}) {
  const expression = `
    return ${JSON.stringify(expectations)}.map(({selector, property, attribute, equals}) => {
      const el = document.querySelector(selector);
      if (!el || el.closest('[hidden]') || !el.getClientRects().length ||
          getComputedStyle(el).visibility !== 'visible') return { found: false, matches: false };
      const actual = property === 'text' ? el.innerText.trim() : property === 'value' ? el.value :
        property === 'checked' ? el.checked : el.getAttribute(attribute);
      return { found: true, matches: property === 'text' ? typeof actual === 'string' && actual.includes(equals) : actual === equals };
    });
  `;
  const started = Date.now();
  for (;;) {
    const found = await page.evaluate(expression);
    if (!Array.isArray(found) || found.length !== expectations.length) throw new Error('state observation returned no complete CDP result');
    if (found.every(({ matches }) => matches) || Date.now() - started >= waitMs) return found;
    await pause(60);
  }
}

async function drive(page, action) {
  if (action.type === 'type') return page.realType(action.selector, action.value);
  if (action.type === 'select') return page.selectOption(action.selector, action.value);
  if (action.type === 'key') {
    const focused = await page.evaluate(`
      const el = document.querySelector(${JSON.stringify(action.selector)});
      if (!el) return false;
      el.focus(); return true;
    `);
    if (!focused) throw new Error('state journey key target was not found');
    return page.realKey(action.key);
  }
  const point = await page.evaluate(`
    const el = document.querySelector(${JSON.stringify(action.selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (!r.width || !r.height || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    return { x, y };
  `);
  if (!point) throw new Error('state journey pointer target was not visible');
  return page.realPointer(point.x, point.y);
}

async function backTo(page, entry, url) {
  await page.send('Page.navigateToHistoryEntry', { entryId: entry });
  const started = Date.now();
  for (;;) {
    try {
      const history = await page.send('Page.getNavigationHistory');
      const active = history.entries?.[history.currentIndex];
      if (active?.id === entry && await page.url() === url &&
          await page.evaluate('return document.readyState') === 'complete') return;
    } catch {
      // The old execution context may disappear on cross-document navigation.
    }
    if (Date.now() - started > 10_000) throw new Error('browser history did not return to the measured state');
    await pause(60);
  }
}

/** No PASS unless the action changes state, the new document retains it, and Back returns to it. */
export async function evaluateStateJourney(page, base, contract) {
  try {
    const { startUrl, detourUrl } = validateStateJourney(contract, base);
    await page.goto(startUrl);
    const baseline = await observe(page, contract.observations, { waitMs: 0 });
    if (baseline.every(({ matches }) => matches)) {
      return { name: 'state-persistence', status: 'ERROR', detail: 'all expected state was present before any action; change cannot be attributed' };
    }
    for (const action of contract.actions) await drive(page, action);
    const observed = await observe(page, contract.observations);
    if (observed.some(({ matches }) => !matches)) return { name: 'state-persistence', status: 'FAIL', detail: 'interaction did not produce the declared rendered state' };
    const activeUrl = await page.url();
    await page.reload();
    if (await page.url() !== activeUrl || (await observe(page, contract.observations)).some(({ matches }) => !matches)) {
      return { name: 'state-persistence', status: 'FAIL', detail: 'declared rendered state was lost on a true document reload' };
    }
    const before = await page.send('Page.getNavigationHistory');
    const returnEntry = before.entries?.[before.currentIndex]?.id;
    if (typeof returnEntry !== 'number') throw new Error('browser did not expose a return history entry');
    if (detourUrl === activeUrl) throw new Error('detour cannot be the state page');
    await page.goto(detourUrl);
    const detourStatus = page.network?.filter(({ url }) => url === detourUrl).at(-1)?.status;
    if (!Number.isInteger(detourStatus) || detourStatus >= 400) throw new Error(`detour route was not observed as an HTTP success (${detourStatus ?? 'unknown'})`);
    const detour = await page.send('Page.getNavigationHistory');
    if (detour.currentIndex <= before.currentIndex) throw new Error('detour did not create a browser history entry');
    await backTo(page, returnEntry, activeUrl);
    if ((await observe(page, contract.observations)).some(({ matches }) => !matches)) {
      return { name: 'state-persistence', status: 'FAIL', detail: 'browser Back lost the declared rendered state' };
    }
    // A bfcache restoration alone can look correct even when no state was saved. Require another
    // new document after Back before claiming the journey persisted.
    await page.reload();
    if ((await observe(page, contract.observations)).some(({ matches }) => !matches)) {
      return { name: 'state-persistence', status: 'FAIL', detail: 'state survived Back only in a cached document, not after reload' };
    }
    return { name: 'state-persistence', status: 'PASS', detail: 'state changed after trusted input and survived reload, browser Back and a second reload',
      observed: { checks: contract.observations.length, source: 'CDP trusted input + rendered DOM' } };
  } catch (error) {
    return { name: 'state-persistence', status: 'ERROR', detail: error.message };
  }
}
