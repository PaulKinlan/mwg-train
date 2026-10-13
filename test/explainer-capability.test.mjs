import test from 'node:test';
import assert from 'node:assert/strict';
import { startArmServer } from './helpers/arm-server.mjs';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { archetypeFromSpec, buildProjectFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { explainerSpec } from '../scripts/lib/explainer-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

// The spec's corpus costs 1200 at a horizon of 24 months, so the derived figure for any amount is arithmetic:
// ceil(1200 / amount). Three amounts whose answers differ are what makes "the output is derived" falsifiable - a
// hard-coded pair of states cannot satisfy all three, and cannot satisfy the reset.
const MONTHS = { 60: 20, 150: 8, 40: 30, 500: 3 };

const availablePort = () =>
  new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });

// Tag-insensitive: reads a short window after the hook and strips markup, so it does not assume the generator's
// element is flat. The window is deliberately short so it cannot reach the next element's number.
const near = (html, id, width = 140) => {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) return null;
  return html.slice(at, at + width).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const withControl = (patch) => {
  const spec = explainerSpec();
  return { ...spec, explainer: { ...spec.explainer, control: { ...spec.explainer.control, ...patch } } };
};
const says = (spec, needle) => validateSpec(spec).some((problem) => problem.includes(needle));

test('spec gate: the explainer is one control, a target, and a reset value the control can actually hold', () => {
  assert.deepEqual(validateSpec(explainerSpec()), [], 'the corpus validates clean');

  // The two directions of the block/capability agreement: a capability with no control would render a page with
  // nothing to change, and a block with no capability would validate and emit nothing.
  assert.ok(says({ ...explainerSpec(), explainer: undefined }, 'no explainer block'), 'the capability on without a block is refused');
  assert.ok(says({ ...explainerSpec(), capabilities: {} }, 'only meaningful with capabilities.explainer'), 'a block without the capability is refused');

  assert.ok(says(withControl({ name: 'Monthly' }), 'must be a field name'), 'a control name that is not a field name is refused');
  assert.ok(says(withControl({ unit: '' }), 'must state the unit'), 'a control with no unit is refused');
  assert.ok(says(withControl({ min: 100, max: 100 }), 'nothing to explain'), 'a range with nothing in it is refused');
  // The reset returns to `initial`, so an initial outside the range would be a reset into a state the control
  // cannot hold - the one rule in this capability that exists because of what reset means.
  assert.ok(says(withControl({ initial: 1 }), 'because resetting returns here'), 'an initial below the range is refused');
  assert.ok(says(withControl({ initial: 900 }), 'because resetting returns here'), 'an initial above the range is refused');
  assert.ok(says({ ...explainerSpec(), explainer: { ...explainerSpec().explainer, horizon: 2 } }, 'between 4 and 60'), 'a horizon too small to draw a path is refused');
  assert.ok(says({ ...explainerSpec(), explainer: { ...explainerSpec().explainer, target: { label: 'The repair', amount: 0 } } }, 'not a figure'), 'a target of zero is refused');

  const shadow = { ...explainerSpec(), routes: [...explainerSpec().routes, { method: 'GET', path: '/explain', kind: 'page', effect: 'shadow the capability' }] };
  assert.ok(says(shadow, "the explainer capability's own route"), 'a specification that declares the explainer page is refused');
});

test('wiring guard: the block reaches the builder archetype, and byte-invariance holds without it', () => {
  // `archetypeFromSpec` is an explicit list: a block it does not name validates cleanly and is then dropped
  // while the capability flag still arrives, so the capability would be on and emit nothing.
  const spec = explainerSpec();
  assert.deepEqual(archetypeFromSpec(spec).explainer, spec.explainer, 'the block survives archetypeFromSpec');

  // And the drift trap: a specification that never opted in must not gain a byte. A capability that emits
  // unconditionally moves every recorded tree hash - one did exactly that to all 210 training trees.
  for (const frameworkName of ARMS) {
    const { files } = buildProjectFromSpec({ spec: specForFamily('booking', ROOT), frameworkName });
    assert.equal(
      /EXPLAINER|explainerOf|explainerPages|\/explain/.test(files['server.mjs']),
      false,
      `${frameworkName} emitted explainer code for a specification that never opted in`,
    );
  }
});

test('functional: the output is derived from the input, the narrative follows it, and reset returns to the start', async (t) => {
  const spec = explainerSpec();
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `explainer-${arm}-`));
      const port = await availablePort();
      const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
      writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
      symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
      const child = startArmServer({ projectDir: dir, port: port, dbPath: join(dir, 'test.sqlite'), stdio: ['ignore', 'ignore', 'pipe'] });
      try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);
        const page = async (query = '') => {
          const response = await fetch(`${base}/explain${query}`);
          assert.equal(response.status, 200, `${arm} serves /explain${query}`);
          return response.text();
        };
        const figure = (html) => near(html, 'explainer-output');
        const narrative = (html) => near(html, 'explainer-narrative');
        const steps = (html) => (html.match(/class="explainer-step/g) ?? []).length;

        const initial = await page();
        assert.ok(initial.includes('id="explainer-control"'), `${arm} renders the control`);
        assert.ok(initial.includes('id="explainer-reset"'), `${arm} renders a reset control`);
        // What the reader sees, not only what the attributes say. Counting steps proves a path is drawn, not that
        // it *looks* drawn: strip the markers and a count-based check still passes. (Review finding on this bead.)
        assert.ok(initial.includes('&#10003;'), `${arm} marks drawn months visibly rather than only with data-travelled`);
        // Every drawn month, not just the first: a check mark emitted only on Month 1 would satisfy the line above.
        assert.equal((initial.match(/&#10003;/g) ?? []).length, steps(initial), `${arm} every drawn month is marked, not just the first`);
        assert.ok(initial.includes('you are here'), `${arm} marks the month reached as the reader's position`);
        assert.ok(figure(initial)?.includes(String(MONTHS[60])), `${arm} derives the initial figure (observed: ${figure(initial)})`);

        // The output is DERIVED, not a hard-coded pair: three amounts, three answers that only arithmetic gives,
        // and the narrative changes with the one that runs past the horizon the page draws.
        const initialNarrative = narrative(initial);
        for (const [amount, months] of [[150, MONTHS[150]], [40, MONTHS[40]], [500, MONTHS[500]]]) {
          const html = await page(`?monthly=${amount}`);
          const observed = figure(html);
          assert.ok(observed?.includes(String(months)), `${arm} ${amount}/month is ${months} months (observed: ${observed})`);
          assert.notEqual(observed, figure(initial), `${arm} ${amount}/month differs from the initial figure`);
        }
        const beyond = await page('?monthly=40');
        assert.notEqual(narrative(beyond), initialNarrative, `${arm} the narrative changes when the path runs past the horizon`);
        // Inequality alone would pass on arbitrary text, so both branches are named: the ordinary path at 20 months,
        // and the advice the past-horizon branch is supposed to give.
        assert.ok(initialNarrative.includes('ordinary path'), `${arm} the initial narrative is the ordinary-path branch (read: "${initialNarrative.trim().slice(0, 60)}")`);
        assert.ok(narrative(beyond).includes('Consider a larger amount'), `${arm} the past-horizon narrative gives the advice it claims (read: "${narrative(beyond).trim().slice(0, 80)}")`);
        // The cap is asserted exactly, because an uncapped path would be 30 steps and `!==` would still pass it.
        // The horizon comes from the specification this test passed in, not from the builder's returned spec: that
        // one is the builder's own shape and does not carry the capability block, which is fine for generation and
        // wrong for asserting what the block says.
        assert.equal(steps(beyond), spec.explainer.horizon + 1, `${arm} the drawn path is exactly the horizon plus the summary step`);
        assert.ok(beyond.includes('past the horizon'), `${arm} marks the step past the horizon and says so in words`);

        // A query string is user input, so out-of-range and non-numeric values must fall back to something legal
        // rather than producing a broken figure - clamping to max is the arithmetic, not a default.
        const clamped = await page('?monthly=99999');
        assert.ok(figure(clamped)?.includes(String(MONTHS[500])), `${arm} a value above max clamps to max (observed: ${figure(clamped)})`);
        const nonsense = await page('?monthly=abc');
        assert.ok(figure(nonsense)?.includes(String(MONTHS[60])), `${arm} a non-numeric value falls back to the initial (observed: ${figure(nonsense)})`);

        // The reset: a route that answers 303 back to the bare path, which is the initial state.
        const reset = await fetch(`${base}/explain/reset`, { redirect: 'manual' });
        assert.equal(reset.status, 303, `${arm} reset redirects`);
        assert.equal(reset.headers.get('location'), '/explain', `${arm} reset returns to the bare path`);
        const afterReset = await page();
        assert.ok(figure(afterReset)?.includes(String(MONTHS[60])), `${arm} reset returns the derived figure to its initial value`);

        // Deterministic and self-contained: no client script and no model call, which is what makes the journey
        // reproducible and the output identical on a second read.
        assert.equal(/<script/i.test(initial), false, `${arm} explains without a client script`);
        assert.equal(figure(await page()), figure(initial), `${arm} the same input gives the same output twice`);
      } finally {
        child.kill('SIGTERM');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
