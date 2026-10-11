/**
 * The pricing-tiers capability (mwg-train-4lk): three tiers across a monthly/annual toggle, whose
 * inclusions differ by more than price, and a selection that survives into the next step.
 *
 * Two halves, like the other capability suites: the spec gate (a closed set that fails closed, and a
 * data block the capability cannot be declared without), and the functional half - all seven arms
 * built, started and driven over HTTP: read the monthly prices, toggle to annual and see the DERIVED
 * figures, choose the middle tier, and reach the next step where the choice was recorded.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildProjectFromSpec, specForFamily, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { pricingSpec } from '../scripts/lib/pricing-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);

// The policy the fixture states: ten months charged for twelve months of service.
const ANNUAL_MONTHS = 10;

async function availablePort() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
    return socket.address().port;
  } finally {
    await new Promise((resolve) => socket.close(resolve));
  }
}

test('spec gate: the pricing-tiers capability and its data block fail closed', () => {
  assert.deepEqual(validateSpec(pricingSpec()), [], 'a legitimate pricing specification validates');
  // The capability and its data block are one fact: neither is meaningful alone.
  const withoutBlock = { ...pricingSpec() };
  delete withoutBlock.pricing_tiers;
  assert.ok(validateSpec(withoutBlock).some((p) => p.includes('no pricing_tiers block states the tiers')));
  assert.ok(
    validateSpec(pricingSpec({ capabilities: {} })).some((p) => p.includes('only meaningful with capabilities.pricing_tiers')),
  );
  // The policy, not a second price list: the annual figure is derived from a months figure in 10..12.
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, annual_months: 9 } })).some((p) => p.includes('between 10 and 12')));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, annual_months: 12.5 } })).some((p) => p.includes('between 10 and 12')));
  // Three tiers, ascending, with names and features, and an unknown key refused rather than ignored.
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, tiers: pricingSpec().pricing_tiers.tiers.slice(0, 2) } })).some((p) => p.includes('at least three tiers')));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, colour: 'red' } })).some((p) => p.includes('unknown key')));
  const duplicated = pricingSpec().pricing_tiers.tiers.map((tier) => ({ ...tier, name: 'Same' }));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, tiers: duplicated } })).some((p) => p.includes('duplicate tier name')));
  const flat = pricingSpec().pricing_tiers.tiers.map((tier) => ({ ...tier, monthly: 9 }));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, tiers: flat } })).some((p) => p.includes('must be higher than the tier before it')));
  const noneRecommended = pricingSpec().pricing_tiers.tiers.map((tier) => ({ ...tier, recommended: false }));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, tiers: noneRecommended } })).some((p) => p.includes('exactly one tier as recommended')));
  // "Differ in more than price": identical inclusion sets make the comparison a price list.
  const sameFeatures = pricingSpec().pricing_tiers.tiers.map((tier) => ({ ...tier, features: ['Community support'] }));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, tiers: sameFeatures } })).some((p) => p.includes('at least one feature the lower tier does not')));
  // Money finer than a minor unit prints a monthly price the derived annual column disagrees with.
  const subCent = pricingSpec().pricing_tiers.tiers.map((tier) => ({ ...tier, monthly: tier.monthly + 0.0009 }));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, tiers: subCent } })).some((p) => p.includes('whole number of minor units')));
  // A repeat inside one tier renders twice on the card and once in the table.
  const repeated = pricingSpec().pricing_tiers.tiers.map((tier) => ({ ...tier, features: [...tier.features, tier.features[0]] }));
  assert.ok(validateSpec(pricingSpec({ pricing_tiers: { ...pricingSpec().pricing_tiers, tiers: repeated } })).some((p) => p.includes('must not list the same feature twice')));
  // The capability's own routes are served first, so declaring them as well is refused rather than
  // shadowed - and the same rule protects the cart capability's routes.
  const pricingRoutes = [...pricingSpec().routes, { method: 'GET', path: '/pricing', kind: 'page' }];
  assert.ok(validateSpec(pricingSpec({ routes: pricingRoutes })).some((p) => p.includes("the pricing_tiers capability's own route")));
});

test('hostile data: the currency is escaped, and a policy that saves nothing shows no saving line', async () => {
  const policy = pricingSpec().pricing_tiers;
  const spec = pricingSpec({ pricing_tiers: { ...policy, currency: 'GBP & <b>Co</b>', annual_months: 12 } });
  assert.deepEqual(validateSpec(spec), [], 'a currency with metacharacters is still a currency');
  const dir = mkdtempSync(join(tmpdir(), 'pricing-hostile-'));
  const port = await availablePort();
  const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: 'raw' });
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
      up = await fetch(`${base}/__health`).then((response) => response.ok, () => false);
    }
    assert.ok(up, 'server did not come up');
    const annual = await (await fetch(`${base}/pricing?period=annual`)).text();
    assert.match(annual, /GBP &amp; &lt;b&gt;Co&lt;\/b&gt;/, 'the currency is HTML-escaped, not injected');
    assert.equal(annual.includes('<b>Co</b>'), false, 'no raw metacharacter reaches the page');
    for (const tier of policy.tiers) {
      assert.match(annual, new RegExp(`GBP &amp; &lt;b&gt;Co&lt;/b&gt; ${tier.monthly * 12} per year`), 'the annual figure is still derived from the policy');
    }
    assert.equal(/id="saving-\d+"/.test(annual), false, 'a policy that saves nothing shows no saving line');
  } finally {
    child.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('byte-invariance: a specification that does not opt in emits no pricing code', () => {
  for (const family of ['booking', 'catalogue', 'account-recovery']) {
    for (const arm of ARMS) {
      const { files } = buildProjectFromSpec({ spec: specForFamily(family, ROOT), frameworkName: arm });
      assert.equal(
        /PRICING|pricingPage|pricingAnnual|pricingSaving|pricingConfirmationPage/.test(files['server.mjs']),
        false,
        `${family}/${arm} emitted pricing code without opting in`,
      );
    }
  }
});

test('functional: the toggle derives the annual figures, and the chosen tier is recorded', async (t) => {
  const spec = pricingSpec();
  const tiers = spec.pricing_tiers.tiers;
  assert.deepEqual(ARMS.slice().sort(), ['hono', 'preact', 'raw', 'react', 'svelte', 'vue', 'webcomponents']);
  for (const arm of ARMS) {
    await t.test(arm, async () => {
      const dir = mkdtempSync(join(tmpdir(), `pricing-${arm}-`));
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
          up = await fetch(`${base}/__health`).then((response) => response.ok, () => false);
        }
        assert.ok(up, `${arm} server did not come up`);
        const post = (path, body) =>
          fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body).toString(),
            redirect: 'manual',
          });

        // Monthly: the tier figures themselves, and a toggle that says which period is showing.
        const monthly = await (await fetch(`${base}/pricing`)).text();
        assert.match(monthly, /Showing monthly prices/, `${arm} states the billing period it is showing`);
        for (const [index, tier] of tiers.entries()) {
          assert.match(monthly, new RegExp(`GBP ${tier.monthly} per month`), `${arm} shows ${tier.name} at its monthly figure`);
          assert.match(monthly, new RegExp(`id="price-${index}"`), `${arm} renders a price for tier ${index}`);
        }
        assert.match(monthly, /aria-current="page"[^>]*>Monthly/, `${arm} marks the current period for assistive tech`);
        assert.match(monthly, /<p class="recommendation">Recommended<\/p>/, `${arm} marks the recommended tier as a recommendation`);
        assert.equal((monthly.match(/<p class="recommendation">/g) ?? []).length, 1, `${arm} recommends exactly one tier`);
        assert.match(monthly, /<table><caption>What each tier includes<\/caption>/, `${arm} compares the tiers as a table`);
        assert.match(monthly, /<th scope="col">/, `${arm} scopes the comparison headers`);
        assert.match(monthly, /Included<\/td>/, `${arm} states inclusion in words, not by colour`);
        assert.match(monthly, /Not included<\/td>/, `${arm} states exclusion in words`);

        // Annual: DERIVED from the monthly figure and the policy, not restated as a second number.
        const annual = await (await fetch(`${base}/pricing?period=annual`)).text();
        assert.match(annual, /Showing annual prices/, `${arm} toggles the period`);
        for (const [index, tier] of tiers.entries()) {
          const yearly = tier.monthly * ANNUAL_MONTHS;
          const saving = tier.monthly * 12 - yearly;
          assert.match(annual, new RegExp(`GBP ${yearly} per year`), `${arm} derives ${tier.name} at ${yearly} a year`);
          assert.match(annual, new RegExp(`Saves GBP ${saving} a year`), `${arm} derives the ${tier.name} saving as ${saving}`);
          assert.notEqual(monthly, annual, `${arm} the toggle changes the page`);
          assert.match(annual, new RegExp(`name="period" value="annual"`), `${arm} the choice carries the period being viewed`);
          assert.match(annual, new RegExp(`id="saving-${index}"`), `${arm} shows a saving for tier ${index}`);
        }

        // The selection is recorded, and the next step reads it back.
        const chosen = tiers[1];
        const selection = await post('/pricing/select', { tier: chosen.name, period: 'annual' });
        assert.equal(selection.status, 303, `${arm} accepts a listed tier`);
        const location = selection.headers.get('location');
        assert.match(location, /^\/pricing\/.+/, `${arm} redirects to the recorded selection`);
        const confirmation = await (await fetch(`${base}${location}`)).text();
        assert.match(confirmation, new RegExp(`id="chosen-tier">${chosen.name}<`), `${arm} the next step names the chosen tier`);
        assert.match(confirmation, /id="chosen-period">annual</, `${arm} the next step names the period`);
        assert.match(confirmation, new RegExp(`id="chosen-price">GBP ${chosen.monthly * ANNUAL_MONTHS}<`), `${arm} the next step names the derived price it recorded`);
        const reloaded = await (await fetch(`${base}${location}`)).text();
        assert.equal(reloaded, confirmation, `${arm} the selection survives a reload`);

        // A tier nobody offers is refused, and an unknown reference is not a selection.
        const badTier = await post('/pricing/select', { tier: 'Enterprise', period: 'annual' });
        assert.equal(badTier.status, 422, `${arm} refuses a tier it does not list`);
        const unknown = await fetch(`${base}/pricing/no-such-ref`);
        assert.equal(unknown.status, 404, `${arm} refuses an unknown selection reference`);
      } finally {
        child.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('the pricing capability is registered, not silently dead', () => {
  const frameworks = readFileSync(join(ROOT, 'pilot/frameworks.mjs'), 'utf8');
  assert.match(frameworks, /auth: false, cart: false, pricing_tiers: false/);
});
