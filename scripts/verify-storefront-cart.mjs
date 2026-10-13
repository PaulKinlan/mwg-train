/**
 * Functional local-browser check for the storefront cart capability (mwg-train-11d).
 *
 * The capability's acceptance bar is a browser journey, not a rendered page: open a product, choose a
 * variant, add it, go back, add a DIFFERENT product, and then see two lines in the cart with the
 * correct variant on each. A page that renders hard-coded cart lines is a failure, so this drives the
 * real project - built from the specification, served by its own generated server - in Chrome.
 *
 * Usage: node scripts/verify-storefront-cart.mjs   (CART_ARM=vue to check another arm)
 * Evidence (screenshots + a JSON report) is written to /tmp/storefront-cart-shots.
 */
import { startGeneratedServer } from '../src/eval/generated-server.mjs';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { cartSpec } from './lib/cart-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.CART_SHOTS ?? '/tmp/storefront-cart-shots';
const PORT = Number(process.env.CART_PORT ?? 7911);
const ARM = process.env.CART_ARM ?? 'raw';
mkdirSync(SHOTS, { recursive: true });

const checks = [];
function check(name, truth, detail) {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const spec = cartSpec();
const variants = spec.fields.find((field) => field.type === 'select').options;
const firstVariant = variants[1];
const secondVariant = variants[2];
const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec, frameworkName: ARM });
const dir = mkdtempSync(join(tmpdir(), `cart-verify-${ARM}-`));
writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
const base = `http://127.0.0.1:${PORT}`;
const server = startGeneratedServer({
  projectDir: dir,
  port: PORT,
  dbPath: join(dir, 'verify.sqlite'),
  stdio: ['ignore', 'ignore', 'pipe'],
  // Not detached: this script kills the sandbox by pid, and the kernel tears the whole PID
  // namespace down with it, so nothing is left behind either way.
  detached: false,
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
  const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });

  // The whole journey is the browser's: the products are created through the shop's own form.
  const addProduct = async (title, variant, quantity) => {
    await page.goto(`${base}/`);
    await page.type('input[name=title]', title);
    // The shop's own form requires a quantity too, so the browser's own validation is exercised here
    // rather than bypassed: an empty quantity blocks the submit and the journey never leaves `/`.
    await page.evaluate(`const quantityInput = document.querySelector('input[name=quantity]'); if (quantityInput) quantityInput.value = '1'; return true;`);
    const submitted = await page.submit('form');
    check(`the shop form accepts ${title}`, submitted?.valid !== false, `valid=${submitted?.valid}`);
    const productUrl = await page.url();
    check(`the product route serves ${title}`, productUrl.includes('/product/'), productUrl);
    await page.selectOption('select[name=variant]', variant);
    await page.evaluate(`document.querySelector('input[name=quantity]').value = '${quantity}'; return true;`);
    const submittedAdd = await page.submit('#add-to-cart');
    check(`the add form accepts ${variant}`, submittedAdd?.valid !== false, `valid=${submittedAdd?.valid}`);
    return page.url();
  };

  const firstCart = await addProduct('Dabinett Heritage bottle', firstVariant, 2);
  check('adding lands on the cart', firstCart.endsWith('/cart'), firstCart);
  const oneLine = await page.content();
  check('the cart accumulated the first line', /1 line\(s\), 2 item\(s\)/.test(oneLine), firstVariant);
  check('the line carries the chosen variant', oneLine.includes(`data-variant="${firstVariant}"`), firstVariant);
  const firstShot = join(SHOTS, `cart-one-line-${ARM}.png`);
  await page.screenshot(firstShot);

  const secondCart = await addProduct('Kingston Black Reserve bottle', secondVariant, 3);
  check('the second add lands on the cart', secondCart.endsWith('/cart'), secondCart);
  const twoLines = await page.content();
  check('the cart did NOT overwrite the first line', (twoLines.match(/<li data-ref=/g) ?? []).length === 2, twoLines.match(/<li data-ref=/g)?.length ?? 0);
  check('the counts changed with what was added', /2 line\(s\), 5 item\(s\)/.test(twoLines), '2 lines, 5 items');
  check('line one kept its variant', twoLines.includes(`data-variant="${firstVariant}"`), firstVariant);
  check('line two kept its variant', twoLines.includes(`data-variant="${secondVariant}"`), secondVariant);
  const secondShot = join(SHOTS, `cart-two-lines-${ARM}.png`);
  await page.screenshot(secondShot);

  // The cart is server state, so a reload must not lose it (mwg-train-11d's reload assertion).
  await page.goto(`${base}/cart`);
  const reloaded = await page.content();
  check('the cart survives a reload', /2 line\(s\), 5 item\(s\)/.test(reloaded), 'reload of /cart');
  check('the reloaded cart still carries both variants', reloaded.includes(firstVariant) && reloaded.includes(secondVariant), `${firstVariant} + ${secondVariant}`);

  writeFileSync(join(SHOTS, `report-${ARM}.json`), `${JSON.stringify({ arm: ARM, base, checks, shots: [firstShot, secondShot] }, null, 2)}\n`);
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
