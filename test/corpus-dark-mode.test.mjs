import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, evaluateDarkMode } from '../src/corpus/eval.mjs';

const LIGHT = { prefersDark: false, rootScheme: 'light dark', background: 'rgb(255, 255, 255)',
  tokens: { '--bg-page': 'rgb(255, 255, 255)', '--text-primary': 'rgb(17, 24, 39)' },
  samples: [{ tag: 'p', color: 'rgb(17, 24, 39)', background: 'rgb(255, 255, 255)', fontSize: 16, fontWeight: 400 }] };
const DARK = { prefersDark: true, rootScheme: 'light dark', background: 'rgb(15, 23, 42)',
  tokens: { '--bg-page': 'rgb(15, 23, 42)', '--text-primary': 'rgb(248, 250, 252)' },
  samples: [{ tag: 'p', color: 'rgb(248, 250, 252)', background: 'rgb(15, 23, 42)', fontSize: 16, fontWeight: 400 }] };

function fakePage(light, dark, { toggle = false } = {}) {
  const calls = []; let scheme = 'light'; let toggled = false;
  const page = {
    calls,
    async send(method, args) {
      calls.push({ method, args });
      scheme = args.features[0]?.value ?? 'restored';
    },
    async goto(url) { calls.push({ url }); toggled = false; },
    async evaluate(source) {
      if (source.includes('toggle.click()')) { toggled = !toggled; return toggle; }
      return { ...(scheme === 'dark' || toggled ? dark : light), prefersDark: scheme === 'dark' };
    },
  };
  return page;
}

test('dark CDP check proves media activation, effective tokens and readable text, then restores emulation', async () => {
  const page = fakePage(LIGHT, DARK);
  const result = await evaluateDarkMode(page, 'http://127.0.0.1:7000/');
  assert.equal(result.status, 'PASS');
  assert.equal(result.source, 'preference');
  assert.deepEqual(result.observed.changedTokens, ['--bg-page', '--text-primary']);
  assert.ok(result.observed.minContrast > 4.5);
  assert.deepEqual(page.calls.filter(({ method }) => method === 'Emulation.setEmulatedMedia').map(({ args }) => args.features[0]?.value ?? null), ['light', 'dark', null]);
});

test('a color-scheme declaration alone does not pass without real dark colors and changed tokens', async () => {
  const page = fakePage(LIGHT, { ...LIGHT, prefersDark: true });
  const result = await evaluateDarkMode(page, 'http://127.0.0.1:7000/');
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /did not visibly darken.*no effective authored color token changed/);
  assert.equal(page.calls.at(-1).args.features.length, 0);
});

test('a dark-looking page with light native controls or unreadable text fails instead of passing the palette alone', async () => {
  const page = fakePage(LIGHT, { ...DARK, rootScheme: 'light',
    samples: [{ tag: 'p', color: 'rgb(50, 59, 74)', background: DARK.background, fontSize: 16, fontWeight: 400 }] });
  const result = await evaluateDarkMode(page, 'http://127.0.0.1:7000/');
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /root color-scheme.*contrast/);
  assert.equal(result.observed.contrastFailures[0].threshold, 4.5);
});

test('no solid background or sampled text is unmeasured rather than a manufactured pass', async () => {
  assert.equal((await evaluateDarkMode(fakePage(LIGHT, { ...DARK, background: null }), 'http://127.0.0.1/')).status, 'ERROR');
  assert.equal((await evaluateDarkMode(fakePage(LIGHT, { ...DARK, samples: [] }), 'http://127.0.0.1/')).status, 'ERROR');
});

test('an explicit one-click theme toggle can activate dark when system preference cannot, and must restore', async () => {
  const nonAdaptiveDark = { ...LIGHT, prefersDark: true };
  const toggleDark = { ...DARK, prefersDark: false, rootScheme: 'dark' };
  const page = fakePage(LIGHT, nonAdaptiveDark, { toggle: true });
  let clicks = 0; let media = 'light';
  const send = page.send.bind(page);
  page.send = async (method, args) => { media = args.features[0]?.value ?? 'restored'; await send(method, args); };
  page.evaluate = async (source) => {
    if (source.includes('toggle.click()')) { clicks++; return true; }
    return clicks % 2 ? toggleDark : media === 'dark' ? nonAdaptiveDark : LIGHT;
  };
  const result = await evaluateDarkMode(page, 'http://127.0.0.1/');
  assert.equal(result.status, 'PASS');
  assert.equal(result.source, 'toggle');
  assert.equal(clicks, 2, 'restore the switch before the page is reused');
  assert.equal(page.calls.at(-1).args.features.length, 0);
});

test('contrast is luminance-based and does not claim unknown/translucent colors', () => {
  assert.ok(contrastRatio('rgb(255, 255, 255)', 'rgb(0, 0, 0)') >= 21);
  assert.equal(contrastRatio('rgb(120, 120, 120)', 'rgb(120, 120, 120)'), 1);
  assert.equal(contrastRatio('rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)'), null);
  assert.equal(contrastRatio('currentColor', 'rgb(0, 0, 0)'), null);
});
