// Browser acceptance for the standalone, non-sending Wave 2 account-recovery design demo.
// Local-only read-only server; screenshots are evidence in /tmp, never training inputs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { startStaticServer } from './lib/static-server.mjs';

const family = process.env.XVD_ARCHETYPE_DIR
  ? resolve(process.env.XVD_ARCHETYPE_DIR)
  : join(import.meta.dirname, '..', 'docs/design/archetypes/account-recovery');
const control = Boolean(process.env.XVD_ARCHETYPE_DIR);
const shots = control ? '/tmp/xvd-recovery-shots-control' : '/tmp/xvd-recovery-shots';
const report = control ? '/tmp/xvd-recovery-verify-control.json' : '/tmp/xvd-recovery-verify.json';
mkdirSync(shots, { recursive: true });
const checks = [];
const errors = [];
const check = (name, truth, detail) => {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const server = await startStaticServer({ mounts: { '/recovery/': family } });
const base = `${server.origin}/recovery/demo`;
let chrome;
try {
  chrome = await launchChrome({});
  for (const width of [390, 768, 1280]) {
    const page = await chrome.newPage({ viewport: { width, height: 844 }, mobile: width === 390 });
    await page.goto(`${base}/index.html`);
    const before = JSON.parse(await page.evaluate(`return JSON.stringify({
      request: !document.querySelector('#request-card').hidden,
      sent: document.querySelector('#sent-card').hidden,
      ready: !document.querySelector('#email').disabled && !document.querySelector('#send-link').disabled,
      untouched: !document.querySelector('#email').matches(':user-invalid') && !document.querySelector('#email').hasAttribute('aria-invalid'),
      background: getComputedStyle(document.body).backgroundColor,
      overflow: document.documentElement.scrollWidth - innerWidth
    })`));
    check(`request styled, ready and validation deferred at ${width}`, before.request && before.sent && before.ready && before.untouched && before.background === 'rgb(15, 23, 42)', JSON.stringify(before));
    check(`request has no horizontal overflow at ${width}`, before.overflow <= 1, `${before.overflow}px`);
    await page.screenshot(join(shots, `request-${width}.png`));
    await page.evaluate(`document.querySelector('#reset-form').requestSubmit(); return true;`);
    await sleep(70);
    const empty = JSON.parse(await page.evaluate(`return JSON.stringify({
      refused: document.querySelector('#sent-card').hidden,
      invalid: document.querySelector('#email').matches(':user-invalid'),
      aria: document.querySelector('#email').getAttribute('aria-invalid'),
      focused: document.activeElement.id
    })`));
    check(`empty native submission is refused at ${width}`, empty.refused && empty.invalid && empty.aria === 'true' && empty.focused === 'email', JSON.stringify(empty));
    await page.realType('#email', 'not-an-email');
    await page.realKey('Tab');
    await sleep(70);
    const bad = JSON.parse(await page.evaluate(`return JSON.stringify({
      refused: document.querySelector('#sent-card').hidden,
      invalid: document.querySelector('#email').matches(':user-invalid'),
      aria: document.querySelector('#email').getAttribute('aria-invalid'),
      error: getComputedStyle(document.querySelector('#email-error')).display,
      url: location.pathname
    })`));
    check(`invalid email announces error after interaction at ${width}`, bad.refused && bad.invalid && bad.aria === 'true' && bad.error !== 'none' && bad.url === '/recovery/demo/index.html', JSON.stringify(bad));
    await page.evaluate(`document.querySelector('#email').select(); return true;`);
    await page.realType('#email', 'operator@example.test');
    await sleep(70);
    const corrected = JSON.parse(await page.evaluate(`return JSON.stringify({ valid: document.querySelector('#email').checkValidity(), aria: document.querySelector('#email').hasAttribute('aria-invalid'), error: getComputedStyle(document.querySelector('#email-error')).display })`));
    check(`correcting email clears error at ${width}`, corrected.valid && !corrected.aria && corrected.error === 'none', JSON.stringify(corrected));
    await page.click('#send-link');
    const after = JSON.parse(await page.evaluate(`return JSON.stringify({
      requestHidden: document.querySelector('#request-card').hidden,
      sentVisible: !document.querySelector('#sent-card').hidden,
      echo: document.querySelector('#email-echo').textContent,
      warning: document.querySelector('#preview-warning').textContent,
      focus: document.activeElement.id,
      seconds: document.querySelector('#seconds').textContent,
      appDisabled: document.querySelector('#sent-card .primary-button').disabled,
      overflow: document.documentElement.scrollWidth - innerWidth,
      url: location.pathname + location.search
    })`));
    check(`valid submit displays honest local preview at ${width}`, after.requestHidden && after.sentVisible && after.echo === 'operator@example.test' && /no email or reset link was sent/i.test(after.warning) && after.focus === 'sent-title' && after.seconds === '60' && after.appDisabled && after.url === '/recovery/demo/index.html', JSON.stringify(after));
    check(`confirmation has no horizontal overflow at ${width}`, after.overflow <= 1, `${after.overflow}px`);
    await page.screenshot(join(shots, `sent-${width}.png`));
    await sleep(1200);
    const tick = Number(await page.evaluate(`return document.querySelector('#seconds').textContent`));
    check(`countdown ticks without sending at ${width}`, tick > 0 && tick < 60 && !page.network.some((r) => r.method !== 'GET'), `seconds=${tick}; network=${JSON.stringify(page.network.map((r) => [r.method, new URL(r.url).pathname]))}`);
    await page.click('#return-link');
    const returned = JSON.parse(await page.evaluate(`return JSON.stringify({ request: !document.querySelector('#request-card').hidden, sent: document.querySelector('#sent-card').hidden, cleared: document.querySelector('#email').value === '', focused: document.activeElement.id })`));
    check(`return restores the request form at ${width}`, returned.request && returned.sent && returned.cleared && returned.focused === 'email', JSON.stringify(returned));
    await page.realType('#email', 'second@example.test');
    await page.click('#send-link');
    const repeated = JSON.parse(await page.evaluate(`return JSON.stringify({ sent: !document.querySelector('#sent-card').hidden, echo: document.querySelector('#email-echo').textContent, noteHidden: document.querySelector('#return-note').hidden })`));
    check(`repeat request starts a clean local preview at ${width}`, repeated.sent && repeated.echo === 'second@example.test' && repeated.noteHidden && !page.network.some((r) => r.method !== 'GET'), JSON.stringify(repeated));
    check(`no page exceptions at ${width}`, page.console.every((entry) => entry.type !== 'exception'), JSON.stringify(page.console));
    await page.close();

    const compare = await chrome.newPage({ viewport: { width, height: 844 }, mobile: width === 390 });
    await compare.goto(`${base}/compare.html`);
    await compare.evaluate(`document.querySelectorAll('.comparison')[1].scrollIntoView(); return true;`);
    await sleep(300);
    const views = JSON.parse(await compare.evaluate(`return JSON.stringify({
      images: [...document.querySelectorAll('.comparison img')].map((i) => [i.naturalWidth, i.naturalHeight]),
      frames: [...document.querySelectorAll('.comparison iframe')].map((frame) => ({
        title: frame.title,
        ready: frame.contentDocument?.readyState,
        sent: frame.contentDocument?.querySelector('#sent-card')?.hidden,
        notice: frame.contentDocument?.querySelector('#preview-warning')?.textContent
      })),
      overflow: document.documentElement.scrollWidth - innerWidth
    })`));
    check(`comparison loads both genuine boards and live iframes at ${width}`, views.images.length === 2 && views.images.every(([w, h]) => w === 1376 && h === 768) && views.frames.length === 2 && views.frames.every((f) => f.ready === 'complete') && views.frames[0].sent === true && views.frames[1].sent === false && /no email or reset link was sent/i.test(views.frames[1].notice), JSON.stringify(views));
    check(`comparison has no horizontal overflow at ${width}`, views.overflow <= 1, `${views.overflow}px`);
    await compare.screenshot(join(shots, `compare-${width}.png`), { fullPage: true });
    check(`no comparison exceptions at ${width}`, compare.console.every((entry) => entry.type !== 'exception'), JSON.stringify(compare.console));
    await compare.close();
  }
} catch (error) {
  errors.push(String(error?.stack ?? error));
  console.error('VERIFY ERROR', error);
} finally {
  if (chrome) await chrome.close().catch(() => {});
  await server.close().catch(() => {});
}
const failed = checks.filter((item) => !item.ok);
writeFileSync(report, JSON.stringify({ checks, errors, failedCount: failed.length }, null, 2));
console.log(`${checks.length - failed.length}/${checks.length} checks passed (${report}); screenshots ${shots}`);
for (const item of failed) console.error('FAILED', item.name, item.detail);
for (const error of errors) console.error('ERROR', error);
process.exitCode = failed.length || errors.length ? 1 : 0;
