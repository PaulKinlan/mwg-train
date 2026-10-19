// Drive one already-generated, quarantined tr-01 server. No generation/provider request or source rewrite.
// node scripts/verify-tr01-live-slice.mjs <read-only project directory> <private evidence directory>
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startServer } from '../src/corpus/harness.mjs';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { liveSliceTimeoutVerdict } from '../src/eval/live-slice-verdict.mjs';

// Inject only the two containment launchers for offline fault tests; the CLI uses their real defaults.
export async function verifyTr01LiveSlice({ project, evidenceDir, start = startServer, launch = launchChrome }) {
if (!project || !evidenceDir) throw new Error('usage: verify-tr01-live-slice.mjs <project> <evidenceDir>');
if (process.platform !== 'linux') throw new Error('Linux-only evidence run: macOS requires its own independent host');
mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
// Reusing an evidence directory must not leave a prior ACCEPT or screenshot as evidence for this run.
for (const name of ['verdict.json', 'desktop-form.png', 'mobile-form.png', 'desktop-validation.png',
  'desktop-confirmation.png', 'mobile-confirmation.png']) rmSync(join(evidenceDir, name), { force: true });
const reservation = createServer();
const port = await new Promise((resolve, reject) => {
  reservation.on('error', reject);
  reservation.listen(0, '127.0.0.1', () => {
    const availablePort = reservation.address().port;
    reservation.close((error) => error ? reject(error) : resolve(availablePort));
  });
});
let server;
let chrome;
const checks = {};
const base = `http://127.0.0.1:${port}`;
const text = (page) => page.evaluate('return document.body.innerText');
try {
  server = await start(project, { port });
  assert.equal(server.mechanism, 'bubblewrap');
  chrome = await launch();
  const page = await chrome.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/`);
  assert.match(await text(page), /VeloFix/);
  await page.screenshot(join(evidenceDir, 'desktop-form.png'));
  const mobile = await chrome.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${base}/`);
  await mobile.screenshot(join(evidenceDir, 'mobile-form.png'));
  const mobileFormOverflow = await mobile.evaluate('return document.documentElement.scrollWidth > window.innerWidth');
  assert.equal(mobileFormOverflow, false, 'mobile form must not overflow viewport');
  checks.viewports = { desktop: '1280x900', mobile: '390x844', mobileFormOverflow };
  await page.goto(`${base}/intake`);
  await page.selectOption('select[name=package]', 'Full service');
  await page.submit('form');
  assert.match(await page.url(), /\/intake\/confirm/);
  assert.match(await text(page), /Selected tune-up package\s+Full service/);
  checks.intake = 'Full service carried to /intake/confirm';
  await page.goto(`${base}/`);
  await page.type('input[name=customer]', 'Ada Lovelace');
  await page.type('input[name=address]', '14 Alder Road, Bristol');
  await page.selectOption('select[name=package]', 'Full service');
  await page.selectOption('select[name=slot]', 'Afternoon (12-5)');
  await page.submit('#service-booking-form');
  assert.equal(new URL(await page.url()).pathname, '/book', 'invalid POST stays on the validation response');
  assert.match(await text(page), /Phone number is required/);
  assert.equal(await page.evaluate("return document.querySelector('input[name=phone]')?.getAttribute('aria-invalid')"), 'true');
  assert.deepEqual(await (await fetch(`${base}/api/records`)).json(), []);
  await page.screenshot(join(evidenceDir, 'desktop-validation.png'));
  checks.validation = 'phone inline aria-invalid=true, zero records after refused POST';
  await page.type('input[name=phone]', '+44 7700 900123');
  await page.type('textarea[name=notes]', 'Gate code 4471');
  await page.submit('#service-booking-form');
  const recordPath = new URL(await page.url()).pathname;
  assert.match(recordPath, /^\/bookings\/VF-/);
  assert.match(await text(page), /Ada Lovelace/);
  assert.match(await text(page), /14 Alder Road, Bristol/);
  assert.match(await text(page), /Full service/);
  await page.screenshot(join(evidenceDir, 'desktop-confirmation.png'));
  await page.reload();
  assert.equal(new URL(await page.url()).pathname, recordPath);
  assert.match(await text(page), /Ada Lovelace/);
  assert.equal((await (await fetch(`${base}/api/records`)).json()).length, 1);
  checks.booking = `${recordPath} retained after browser reload, server record count 1`;
  // A negative search result means nothing unless a matching decoy is actually stored first.
  await page.goto(`${base}/`);
  await page.type('input[name=customer]', 'zzz-decoy');
  await page.type('input[name=phone]', '+44 7700 900999');
  await page.type('input[name=address]', '99 Decoy Road, Bristol');
  await page.selectOption('select[name=package]', 'Basic tune-up');
  await page.selectOption('select[name=slot]', 'Morning (8-12)');
  await page.submit('#service-booking-form');
  const decoyPath = new URL(await page.url()).pathname;
  assert.match(decoyPath, /^\/bookings\/VF-/);
  assert.notEqual(decoyPath, recordPath, 'decoy must be a separate persisted record');
  const allRecords = await (await fetch(`${base}/api/records`)).json();
  assert.equal(allRecords.length, 2);
  assert.ok(allRecords.some((record) => record.customer === 'zzz-decoy'));
  await page.goto(`${base}/search?q=Ada`);
  const searchResults = await page.evaluate("return document.querySelector('#search-results')?.innerText ?? null");
  assert.match(searchResults, /Ada Lovelace/);
  assert.doesNotMatch(searchResults, /zzz-decoy/);
  checks.search = 'two server records including zzz-decoy; #search-results contains Ada but excludes stored decoy';
  await page.goto(`${base}${recordPath}`);
  await page.type('input[name=customer]', 'Ada Lovelace (updated)');
  await page.submit('#edit-booking-form');
  assert.equal(new URL(await page.url()).pathname, recordPath);
  await page.reload();
  assert.match(await text(page), /Ada Lovelace \(updated\)/);
  assert.equal((await (await fetch(`${base}/api/records`)).json()).length, 2);
  checks.update = 'same reference, updated name retained after browser reload, record count 2 including decoy';
  await mobile.goto(`${base}${recordPath}`);
  assert.match(await text(mobile), /Ada Lovelace \(updated\)/);
  const mobileConfirmationOverflow = await mobile.evaluate('return document.documentElement.scrollWidth > window.innerWidth');
  assert.equal(mobileConfirmationOverflow, false, 'mobile confirmation must not overflow viewport');
  checks.viewports.mobileConfirmationOverflow = mobileConfirmationOverflow;
  await mobile.screenshot(join(evidenceDir, 'mobile-confirmation.png'));
  checks.environment = { platform: process.platform, node: process.version,
    chrome: execFileSync('/usr/bin/google-chrome', ['--version'], { encoding: 'utf8', timeout: 3000 }).trim(),
    sandbox: server.mechanism, browserEgress: 'default contained' };
  writeFileSync(join(evidenceDir, 'verdict.json'), `${JSON.stringify({ verdict: 'ACCEPT_LINUX_FUNCTION', checks }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ verdict: 'ACCEPT_LINUX_FUNCTION', checks }));
} catch (error) {
  const inconclusive = liveSliceTimeoutVerdict(error, checks);
  if (!inconclusive) throw error;
  writeFileSync(join(evidenceDir, 'verdict.json'), `${JSON.stringify(inconclusive, null, 2)}\n`, { mode: 0o600 });
  console.error(JSON.stringify(inconclusive));
  process.exitCode = 2; // unmeasured (including unattributed no-ack), distinct from behaviour/assertion exit 1
} finally {
  await chrome?.close();
  await server?.stop();
}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyTr01LiveSlice({ project: process.argv[2], evidenceDir: process.argv[3] });
}
