/**
 * Functional local-browser check for the pricing-tiers capability (mwg-train-4lk).
 *
 * The acceptance bar the bead names is a journey, not a rendered page: read the monthly prices, toggle
 * to annual, see the displayed prices change to the DERIVED values, select the middle tier, and reach
 * the next step where the chosen tier is recorded. A card that resets on navigation is decoration, so
 * this drives the real project - built from the specification, served by its own generated server.
 *
 * Usage: node scripts/verify-pricing-tiers.mjs   (PRICING_ARM=vue to check another arm)
 * Evidence (screenshots + a JSON report) is written to /tmp/pricing-tiers-shots.
 */
import { spawn } from 'node:child_process';
import { generatedServerEnv } from '../src/eval/generated-server.mjs';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { pricingSpec } from './lib/pricing-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.PRICING_SHOTS ?? '/tmp/pricing-tiers-shots';
const PORT = Number(process.env.PRICING_PORT ?? 7921);
const ARM = process.env.PRICING_ARM ?? 'raw';
mkdirSync(SHOTS, { recursive: true });

const checks = [];
function check(name, truth, detail) {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const spec = pricingSpec();
const tiers = spec.pricing_tiers.tiers;
const policy = spec.pricing_tiers.annual_months;
const middle = tiers[1];
const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: ARM });
const dir = mkdtempSync(join(tmpdir(), `pricing-verify-${ARM}-`));
writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
const base = `http://127.0.0.1:${PORT}`;
const server = spawn('node', ['server.mjs', '--port', String(PORT), '--db', join(dir, 'verify.sqlite')], {
  cwd: dir,
  stdio: ['ignore', 'ignore', 'pipe'],
  env: generatedServerEnv(),
});
let chrome;
try {
  let up = false;
  for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
    await sleep(250);
    up = await fetch(`${base}/__health`).then((response) => response.ok, () => false);
  }
  check('the generated server is ready', up, `${ARM} on ${base}`);
  chrome = await launchChrome({});
  const page = await chrome.newPage({ viewport: { width: 1280, height: 1100 } });

  const text = async (selector) => page.evaluate(`return document.querySelector('${selector}')?.textContent ?? null;`);

  // 1. Read the monthly prices.
  await page.goto(`${base}/pricing`);
  const monthlyShot = join(SHOTS, `pricing-monthly-${ARM}.png`);
  await page.screenshot(monthlyShot);
  const monthlyLabels = [];
  for (const [index, tier] of tiers.entries()) {
    const label = await text(`#price-${index}`);
    monthlyLabels.push(label);
    check(`${tier.name} shows its monthly figure`, label === `GBP ${tier.monthly} per month`, String(label));
  }
  check('the period on screen is stated', (await text('#billing-period'))?.includes('monthly'), await text('#billing-period'));
  check('the recommended tier is a recommendation', (await text('.recommendation'))?.trim() === 'Recommended', await text('.recommendation'));

  // 2. Toggle to annual - by clicking the toggle, not by typing the URL - and assert the DERIVED values.
  await page.click('a[href="/pricing?period=annual"]');
  const afterToggle = await page.url();
  check('the toggle switches the billing period', afterToggle.includes('period=annual'), afterToggle);
  for (const [index, tier] of tiers.entries()) {
    const yearly = tier.monthly * policy;
    const saving = tier.monthly * 12 - yearly;
    const label = await text(`#price-${index}`);
    check(`${tier.name} toggles to the derived annual figure`, label === `GBP ${yearly} per year`, `${label} (monthly was ${monthlyLabels[index]})`);
    const savingLabel = await text(`#saving-${index}`);
    check(`${tier.name} shows the computed saving`, savingLabel === `Saves GBP ${saving} a year`, String(savingLabel));
  }
  const tableCheck = await page.evaluate(
    `return JSON.stringify({ rows: document.querySelectorAll('table tbody tr').length, included: document.body.textContent.includes('Included'), excluded: document.body.textContent.includes('Not included') });`,
  );
  const table = JSON.parse(tableCheck);
  check('the tiers compare as a table, in words', table.rows > 0 && table.included && table.excluded, tableCheck);
  const annualShot = join(SHOTS, `pricing-annual-${ARM}.png`);
  await page.screenshot(annualShot);

  // 3. Select the middle tier and reach the next step, where the choice was recorded.
  await page.click('section[aria-labelledby="tier-1"] button[type=submit]');
  const confirmationUrl = await page.url();
  check('choosing a tier reaches the next step', /\/pricing\/.+/.test(confirmationUrl), confirmationUrl);
  const chosenTier = await text('#chosen-tier');
  const chosenPeriod = await text('#chosen-period');
  const chosenPrice = await text('#chosen-price');
  check('the next step names the chosen tier', chosenTier === middle.name, String(chosenTier));
  check('the next step names the period chosen', chosenPeriod === 'annual', String(chosenPeriod));
  check('the next step names the derived price', chosenPrice === `GBP ${middle.monthly * policy}`, String(chosenPrice));
  const confirmationShot = join(SHOTS, `pricing-confirmation-${ARM}.png`);
  await page.screenshot(confirmationShot);

  // 4. The choice is server state: a reload still shows it.
  await page.goto(confirmationUrl);
  check('the selection survives a reload', (await text('#chosen-tier')) === middle.name, String(await text('#chosen-tier')));

  writeFileSync(join(SHOTS, `report-${ARM}.json`), `${JSON.stringify({ arm: ARM, base, checks, shots: [monthlyShot, annualShot, confirmationShot] }, null, 2)}\n`);
} catch (error) {
  check('the browser journey ran to completion', false, error.stack ?? String(error));
} finally {
  if (chrome) await chrome.close();
  server.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
}
const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed (evidence in ${SHOTS})`);
if (failed.length > 0) process.exitCode = 1;
