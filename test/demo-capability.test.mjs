import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { archetypeFromSpec, buildProjectFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { demoSpec } from '../scripts/lib/demo-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

// 42 + 20.8 = 62.8 exactly. The corpus uses an expression that is deliberately not a whole number so that the two
// modes must disagree, which is the bead's requirement that a configuration choice materially changes the run.
const EXACT = 62.8;
const WHOLE = 63;

const availablePort = () =>
  new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });

// Tag-insensitive and window-limited, so it does not assume the generator's element is flat and cannot reach the
// next element's number. (Same helper the explainer's suite uses.)
const near = (html, id, width = 160) => {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) return null;
  return html.slice(at, at + width).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const withDemo = (patch) => {
  const spec = demoSpec();
  return { ...spec, demo: { ...spec.demo, ...patch } };
};
const says = (spec, needle) => validateSpec(spec).some((problem) => problem.includes(needle));

test('spec gate: the demo declares what it runs, how it rounds, and the limits it runs under', () => {
  assert.deepEqual(validateSpec(demoSpec()), [], 'the corpus validates clean');
  assert.ok(says({ ...demoSpec(), demo: undefined }, 'no demo block'), 'the capability on without a block is refused');
  assert.ok(says({ ...demoSpec(), capabilities: {} }, 'only meaningful with capabilities.demo'), 'a block without the capability is refused');
  assert.ok(says(withDemo({ mode: 'decimal' }), 'must be one of exact, whole'), 'a mode the page cannot honour is refused');
  assert.ok(says({ ...demoSpec(), demo: { ...demoSpec().demo, limits: undefined } }, 'must state the containment limits'), 'the limits cannot be omitted - they are the point');
  // The initial expression must fit its own character limit, or the page opens on an error.
  assert.ok(says(withDemo({ expression: '1 + '.repeat(60) + '1' }), "longer than the demo's own character limit"), 'an initial expression its own limits refuse is refused');
  const shadow = { ...demoSpec(), routes: [...demoSpec().routes, { method: 'GET', path: '/demo', kind: 'page', effect: 'shadow the capability' }] };
  assert.ok(says(shadow, "the demo capability's own route"), 'a specification that declares the demo page is refused');
});

test('containment guard: the capability own emitted code cannot execute arbitrary code or resolve a callee by name', () => {
  // The bead is the security-relevant type on the axis: "never eval of user input". These are the constructs that
  // would make it possible, and the way to assert them absent without blaming the framework for its own code is to
  // look at the lines this capability adds: build each arm with the demo and without it, and diff.
  const forbidden = [/\beval\s*\(/, /new\s+Function\s*\(/, /\bMath\s*\[/, /\bbuiltins\s*\[/, /\bfunctions\s*\[/, /child_process/];
  for (const arm of ARMS) {
    const withCapability = buildProjectFromSpec({ spec: demoSpec(), frameworkName: arm }).files['server.mjs'].split('\n');
    const without = new Set(buildProjectFromSpec({ spec: specForFamily('booking', ROOT), frameworkName: arm }).files['server.mjs'].split('\n'));
    const added = withCapability.filter((line) => !without.has(line));
    assert.ok(added.length > 0, `${arm}: the capability added nothing, which cannot be right`);
    const emitted = added.join('\n');
    for (const pattern of forbidden) {
      const hit = added.filter((line) => pattern.test(line))[0];
      assert.equal(pattern.test(emitted), false, `${arm} emitted ${pattern} in the code this capability adds: ${hit}`);
    }
    // And the whitelist has to be there at all. Deliberately not asserting the *shape* of the dispatch: a switch and
    // an if/else chain are equally safe, and asserting one would fail a correct implementation of the other. What
    // matters is that a callee is never indexed by a variable, which the list above already asserts.
    for (const name of ['round', 'abs', 'min', 'max']) {
      assert.match(emitted, new RegExp(`\\b${name}\\b`), `${arm} has no '${name}' in the code it adds, so the whitelist is not there`);
    }
    // The block has to reach the builder archetype, or the capability turns on and emits nothing at all.
    assert.deepEqual(archetypeFromSpec(demoSpec()).demo, demoSpec().demo, `${arm}: the block survives archetypeFromSpec`);
  }
});

test('drift guard: a specification that never opted in keeps every byte', () => {
  for (const arm of ARMS) {
    const { files } = buildProjectFromSpec({ spec: specForFamily('booking', ROOT), frameworkName: arm });
    assert.equal(
      /DEMO|demoOf|demoPages|\/demo|tokenize/.test(files['server.mjs']),
      false,
      `${arm} emitted demo code for a specification that never opted in`,
    );
  }
});

test('functional: configure, run, read the output, then read the error - in all seven arms', async (t) => {
  const spec = demoSpec();
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `demo-${arm}-`));
      const port = await availablePort();
      const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: arm });
      writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
      symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
      const child = spawn('node', ['server.mjs', '--port', String(port), '--db', join(dir, 'test.sqlite')], {
        cwd: dir,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);

        const page = async (query = '') => {
          const response = await fetch(`${base}/demo${query}`);
          assert.equal(response.status, 200, `${arm} serves /demo${query}`);
          return response.text();
        };
        // The run is a POST that redirects to a GET carrying the configuration, so the result is reproducible from a
        // URL rather than remembered anywhere.
        const run = async ({ expression, mode = 'exact' }) => {
          const response = await fetch(`${base}/demo/run`, {
            method: 'POST',
            body: new URLSearchParams({ expression, mode }),
            redirect: 'manual',
          });
          assert.equal(response.status, 303, `${arm} the run action redirects`);
          const location = response.headers.get('location');
          assert.ok(location, `${arm} the run action says where the result is`);
          const followed = await fetch(new URL(location, base));
          assert.equal(followed.status, 200, `${arm} the result page renders`);
          return followed.text();
        };

        const initial = await page();
        assert.ok(initial.includes('id="demo-config"'), `${arm} shows the configuration surface`);
        assert.ok(initial.includes('id="demo-expression"'), `${arm} shows the expression, editable`);
        assert.ok(initial.includes('id="demo-mode"'), `${arm} shows the mode choice`);
        assert.ok(initial.includes('id="demo-run"'), `${arm} shows the run action`);
        assert.ok(/characters|tokens|depth/i.test(near(initial, 'demo-limits') ?? ''), `${arm} states the limits it runs under (found: ${near(initial, 'demo-limits')})`);
        assert.ok(near(initial, 'demo-output')?.includes(String(EXACT)), `${arm} runs its initial configuration (observed: ${near(initial, 'demo-output')})`);
        assert.ok((initial.match(/class="demo-step/g) ?? []).length > 0, `${arm} shows the tokens the value came from`);
        assert.equal(/id="demo-error"/.test(initial), false, `${arm} shows no error for a good configuration`);

        // The choice has to materially change the run, not decorate it.
        const exact = await run({ expression: spec.demo.expression, mode: 'exact' });
        const whole = await run({ expression: spec.demo.expression, mode: 'whole' });
        assert.ok(near(exact, 'demo-output')?.includes(String(EXACT)), `${arm} exact mode keeps the decimals (observed: ${near(exact, 'demo-output')})`);
        assert.ok(near(whole, 'demo-output')?.includes(String(WHOLE)), `${arm} whole mode rounds (observed: ${near(whole, 'demo-output')})`);
        assert.notEqual(near(exact, 'demo-output'), near(whole, 'demo-output'), `${arm} the mode choice changes the result`);

        // Deterministic and self-contained, which is what makes the pair reproducible offline.
        assert.equal(await page(`?expression=${encodeURIComponent(spec.demo.expression)}&mode=exact`), await page(`?expression=${encodeURIComponent(spec.demo.expression)}&mode=exact`), `${arm} the same configuration gives the same page twice`);
        assert.equal(/<script/i.test(initial), false, `${arm} runs without a client script`);
        assert.equal(/\bfetch\s*\(|XMLHttpRequest/.test(initial), false, `${arm} makes no network call from the page`);

        // The arities of the whitelisted functions, which is a grammar decision rather than a bug fix
        // (mwg-train-7tl). `round` and `abs` are unary and say so; `min` and `max` took one or more, so `min(1)`
        // evaluated to 1 - the identity, which no demo author writes. They now need at least two. Two rather than
        // exactly two, because refusing three would refuse `max(1, 2, 3)`, which is what Math.max means and what a
        // demo may plausibly ask for; only the one-argument form is refused.
        const unary = await run({ expression: 'min(1)' });
        assert.ok(near(unary, 'demo-error')?.includes('at least 2 arguments'), `${arm} refuses min(1) and says why (found: ${near(unary, 'demo-error')})`);
        const singleMax = await run({ expression: 'max(4)' });
        assert.ok(near(singleMax, 'demo-error')?.includes('at least 2 arguments'), `${arm} refuses max(4) as well`);

        const binary = await run({ expression: 'min(7, 2)' });
        assert.equal(/id="demo-error"/.test(binary), false, `${arm} still runs min(7, 2)`);
        assert.ok(near(binary, 'demo-output')?.includes('2'), `${arm} min(7, 2) is 2 (observed: ${near(binary, 'demo-output')})`);
        const variadic = await run({ expression: 'max(1, 2, 3)' });
        assert.equal(/id="demo-error"/.test(variadic), false, `${arm} still runs max(1, 2, 3): three arguments are not refused`);
        assert.ok(near(variadic, 'demo-output')?.includes('3'), `${arm} max(1, 2, 3) is 3 (observed: ${near(variadic, 'demo-output')})`);

        // The failure path, which the bead requires to be as readable as the success path. Every one of these must
        // come back as a message rather than a crash or a blank panel - including the deeply nested one, where the
        // absence of a depth limit would be a stack overflow in the generated server rather than an error.
        const failures = [
          ['an unknown function', 'sqr(9)', /unknown|sqr/i],
          ['an unbalanced parenthesis', '(1 + 2', /\(|paren|unbalanced|expected/i],
          ['an unexpected character', '1 + 2 $ 3', /unexpected|character|position/i],
          ['an expression past the character limit', '1+'.repeat(150), /limit|long|characters/i],
          ['an expression past the token limit', '1+'.repeat(61) + '1', /token|limit/i],
          ['an expression nested past the depth limit', '('.repeat(12) + '1' + ')'.repeat(12), /depth|deep|nested/i],
          ['division by zero', '1 / 0', /zero|divid/i],
        ];
        for (const [what, expression, pattern] of failures) {
          const html = await run({ expression });
          const error = near(html, 'demo-error', 600);
          assert.ok(error, `${arm} reports ${what} instead of rendering nothing`);
          assert.match(error, pattern, `${arm} the message for ${what} explains itself (read: "${error}")`);
          assert.ok(error.length < 400, `${arm} the message for ${what} is a message, not a stack trace (${error.length} characters)`);
          assert.equal(/at Object\.|at Module\.|node:internal/.test(html), false, `${arm} no stack trace reaches the page for ${what}`);
        }
      } finally {
        child.kill('SIGTERM');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
