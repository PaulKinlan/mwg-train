import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { MODERN_RULES } from '../src/corpus/modern-rules.mjs';

const cases = {
  preclick: {
    style: '',
    body: '<div class="vt">Panel</div><button id="transition">Animate</button>',
    before: 'document.querySelector(".vt").style.backgroundColor = "rgb(0, 128, 255)";',
    update: '() => {}',
  },
  animated: {
    style: '@keyframes pulse { from { opacity: .15; } to { opacity: .9; } } .vt { animation: pulse 250ms linear infinite alternate; }',
    body: '<div class="vt">Panel</div><button id="transition">Animate</button>',
    update: '() => {}',
  },
  style: {
    style: '',
    body: '<div class="vt">Panel</div><button id="transition">Animate</button>',
    update: '() => { document.querySelector(".vt").style.backgroundColor = "red"; }',
  },
  async: {
    style: '',
    body: '<div class="vt">Before</div><button id="transition">Animate</button>',
    update: 'async () => { await Promise.resolve(); document.querySelector(".vt").textContent = "After"; }',
  },
};

test('only changes witnessed inside a View Transition update count, not pre-click or passive animation', async () => {
  const server = createServer((request, response) => {
    const fixture = cases[request.url.slice(1)];
    response.setHeader('content-type', 'text/html');
    if (!fixture) { response.writeHead(404); response.end('not found'); return; }
    response.end(`<!doctype html><html><head><style>.vt { view-transition-name: demo-item; padding: 8px; background: white; } ${fixture.style}</style></head><body>
      ${fixture.body}<script>document.querySelector('#transition').addEventListener('click', () => { ${fixture.before ?? ''} document.startViewTransition(${fixture.update}); });</script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let chrome;
  try {
    chrome = await launchChrome();
    const page = await chrome.newPage();
    const rule = MODERN_RULES['ui-behaviors/same-document-transitions'];
    for (const [name, expected] of [['preclick', 'ERROR'], ['animated', 'ERROR'], ['style', 'PASS'], ['async', 'PASS']]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/${name}`);
      const result = await rule.check(page, { viewTransitionTrigger: '#transition' });
      assert.equal(result.status, expected, `${name}: ${JSON.stringify(result)}`);
      assert.equal(result.observed.observed.started, 1, `${name}: actual browser transition must execute`);
      assert.equal(result.observed.observed.updates[0].mutated, expected === 'PASS', `${name}: callback mutation witness`);
      if (name === 'preclick' || name === 'style') {
        const color = await page.evaluate('return getComputedStyle(document.querySelector(".vt")).backgroundColor');
        assert.equal(color, name === 'style' ? 'rgb(255, 0, 0)' : 'rgb(0, 128, 255)', `${name}: visible panel color`);
        if (process.env.MWG_TRANSITION_EVIDENCE_DIR)
          await page.screenshot(`${process.env.MWG_TRANSITION_EVIDENCE_DIR}/${name}.png`);
      }
      if (name === 'preclick') {
        assert.notEqual(result.observed.before.signatures['demo-item'], result.observed.after.signatures['demo-item'],
          'a pre-callback style change must make the old wall-clock signature false-PASS');
        assert.equal(result.observed.observed.updates[0].before.signatures['demo-item'],
          result.observed.observed.updates[0].after.signatures['demo-item'],
          'the named element must stay unchanged inside the no-op update callback');
      }
    }
    await page.close();
  } finally {
    if (chrome) await chrome.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
