import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { Page } from '../src/corpus/cdp.mjs';

// Exercise the Darwin branch with a simulated platform and CDP receiver on Linux.
// This checks our protocol and cooldown, NOT the behavior of Chrome on a Mac.
function makePage(definitions, { applyKeys = true } = {}) {
  const selects = Object.fromEntries(Object.entries(definitions).map(([selector, labels]) => {
    const options = labels.map(([value, label]) => ({ value, label, textContent: label }));
    const element = {
      tagName: 'SELECT', options, selectedIndex: 0, focus() {},
      get value() { return options[this.selectedIndex]?.value ?? ''; },
    };
    return [selector, element];
  }));
  const events = [];
  let prefix = '';
  let typedAt = 0;
  let active = null;
  const session = {
    sessionId: 'fixture',
    connection: {
      on() {},
      async send(method, params) {
        events.push({ method, params, at: Date.now() });
        if (method !== 'Input.dispatchKeyEvent' || params.type !== 'keyDown' || !params.text || !applyKeys) return {};
        if (Date.now() - typedAt > 1000) prefix = '';
        prefix += params.text.toLowerCase();
        typedAt = Date.now();
        const match = active.options.findIndex((option) => option.label.toLowerCase().startsWith(prefix));
        if (match >= 0) active.selectedIndex = match;
        return {};
      },
    },
  };
  const page = new Page(session, { width: 800, height: 600 });
  page.evaluate = async (expression) => runInNewContext(`(async () => { ${expression} })()`, {
    document: { querySelector(selector) { active = selects[selector] ?? null; return active; } },
  });
  return { page, selects, events };
}

async function asDarwin(callback) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  try { return await callback(); } finally { Object.defineProperty(process, 'platform', original); }
}

test('Darwin select path types a unique label prefix with trusted CDP text, then resets before a second select', async () => {
  const { page, selects, events } = makePage({
    '#first': [['basic', 'Basic'], ['gold', 'Gold'], ['gold-plus', 'Gold Plus']],
    '#second': [['standard', 'Standard'], ['student', 'Student'], ['premium', 'Premium']],
  });
  await asDarwin(async () => {
    assert.equal(await page.selectOption('#first', 'gold-plus'), true);
    assert.equal(selects['#first'].value, 'gold-plus');
    assert.equal(await page.selectOption('#second', 'student'), true);
    assert.equal(selects['#second'].value, 'student');
  });
  const typed = events.filter(({ params }) => params.type === 'keyDown' && params.text);
  assert.deepEqual(typed.map(({ params }) => params.text).join(''), 'gold stu');
  assert.ok(typed.every(({ params }) => params.unmodifiedText === params.text), 'Chrome receives printable trusted key text');
  assert.ok(typed[5].at - typed[4].at >= 1000, 'wait past Chrome type-ahead buffer between selects');
});

test('Darwin select path refuses to claim success when trusted keys leave the option unchanged', async () => {
  const { page } = makePage({ '#choice': [['standard', 'Standard'], ['premium', 'Premium']] }, { applyKeys: false });
  await asDarwin(() => assert.rejects(page.selectOption('#choice', 'premium'), { code: 'SELECT_NOT_APPLIED' }));
});
