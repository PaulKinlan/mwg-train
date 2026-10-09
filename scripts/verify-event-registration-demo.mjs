// Functional local-browser check for the static Event Registration visual target. No purchase is made.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { startStaticServer } from './lib/static-server.mjs';

const family = process.env.XVD_ARCHETYPE_DIR
  ? resolve(process.env.XVD_ARCHETYPE_DIR)
  : join(import.meta.dirname, '..', 'docs/design/archetypes/event-registration');
const control = Boolean(process.env.XVD_ARCHETYPE_DIR);
const shots = control ? '/tmp/xvd-event-shots-control' : '/tmp/xvd-event-shots';
const report = control ? '/tmp/xvd-event-verify-control.json' : '/tmp/xvd-event-verify.json';
mkdirSync(shots, { recursive: true });
const checks = [];
const errors = [];
function check(name, truth, detail) {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const server = await startStaticServer({ mounts: { '/event/': family } });
const base = `${server.origin}/event/demo`;
let chrome;
try {
  chrome = await launchChrome({});
  for (const width of [390, 768, 1280]) {
    const page = await chrome.newPage({ viewport: { width, height: 900 }, mobile: width === 390 });
    await page.goto(`${base}/index.html`);
    const first = JSON.parse(await page.evaluate(`return JSON.stringify({
      form: !document.querySelector('#registration-view').hidden,
      pass: document.querySelector('#pass-view').hidden,
      counts: [document.querySelector('#general').value, document.querySelector('#workshop').value],
      estimate: document.querySelector('#estimate').textContent,
      styled: getComputedStyle(document.body).backgroundColor,
      action: getComputedStyle(document.querySelector('#continue')).backgroundColor,
      overflow: document.documentElement.scrollWidth - innerWidth,
      ready: !document.querySelector('#continue').disabled,
      untouched: !document.querySelector('#attendee').matches(':user-invalid')
    })`));
    check(`board palette and enabled interactive form at ${width}`, first.form && first.pass && first.ready && first.untouched && first.styled === 'rgb(15, 23, 42)' && first.action === 'rgb(16, 185, 129)', JSON.stringify(first));
    check(`default General Admission quantity and estimate at ${width}`, first.counts.join(',') === '1,0' && /£120 for 1 ticket · not a charge/.test(first.estimate), JSON.stringify(first));
    check(`form has zero horizontal overflow at ${width}`, first.overflow <= 1, `${first.overflow}px`);
    await page.screenshot(join(shots, `form-${width}.png`));

    await page.click('[data-tier="workshop"][data-step="1"]');
    const both = JSON.parse(await page.evaluate(`return JSON.stringify({ workshop: document.querySelector('#workshop').value, estimate: document.querySelector('#estimate').textContent })`));
    check(`Workshop + calculates combined illustrative amount at ${width}`, both.workshop === '1' && /£340 for 2 tickets/.test(both.estimate), JSON.stringify(both));
    for (let n = 1; n < 10; n += 1) await page.click('[data-tier="workshop"][data-step="1"]');
    const upper = JSON.parse(await page.evaluate(`return JSON.stringify({ workshop: document.querySelector('#workshop').value, plusDisabled: document.querySelector('[data-tier="workshop"][data-step="1"]').disabled, estimate: document.querySelector('#estimate').textContent })`));
    check(`Workshop + stops at demo-local upper bound at ${width}`, upper.workshop === '10' && upper.plusDisabled && /£2320 for 11 tickets/.test(upper.estimate), JSON.stringify(upper));
    for (let n = 1; n < 10; n += 1) await page.click('[data-tier="workshop"][data-step="-1"]');
    await page.click('[data-tier="general"][data-step="-1"]');
    const single = JSON.parse(await page.evaluate(`return JSON.stringify({ general: document.querySelector('#general').value, minusDisabled: document.querySelector('[data-tier="general"][data-step="-1"]').disabled, estimate: document.querySelector('#estimate').textContent })`));
    check(`General − clamps at zero and updates amount at ${width}`, single.general === '0' && single.minusDisabled && /£220 for 1 ticket/.test(single.estimate), JSON.stringify(single));
    await page.evaluate(`document.querySelector('#registration-form').requestSubmit(); return true;`);
    await sleep(65);
    const missing = JSON.parse(await page.evaluate(`return JSON.stringify({ pass: document.querySelector('#pass-view').hidden, nameInvalid: document.querySelector('#attendee').matches(':user-invalid'), aria: document.querySelector('#attendee').getAttribute('aria-invalid'), focus: document.activeElement.id })`));
    check(`missing required attendee is refused with focus at ${width}`, missing.pass && missing.nameInvalid && missing.aria === 'true' && missing.focus === 'attendee', JSON.stringify(missing));
    await page.realType('#attendee', 'Katherine Johnson');
    await page.realType('#email', 'wrong-email');
    await page.evaluate(`document.querySelector('#registration-form').requestSubmit(); return true;`);
    await sleep(65);
    const invalidEmail = JSON.parse(await page.evaluate(`return JSON.stringify({ pass: document.querySelector('#pass-view').hidden, invalid: document.querySelector('#email').matches(':user-invalid'), aria: document.querySelector('#email').getAttribute('aria-invalid'), focus: document.activeElement.id })`));
    check(`bad email is refused and announced at ${width}`, invalidEmail.pass && invalidEmail.invalid && invalidEmail.aria === 'true' && invalidEmail.focus === 'email', JSON.stringify(invalidEmail));
    await page.evaluate(`document.querySelector('#email').select(); return true;`);
    await page.realType('#email', 'kj@example.test');
    await sleep(65);
    const repaired = JSON.parse(await page.evaluate(`return JSON.stringify({ valid: document.querySelector('#email').checkValidity(), aria: document.querySelector('#email').hasAttribute('aria-invalid') })`));
    check(`corrected email clears invalid ARIA state at ${width}`, repaired.valid && !repaired.aria, JSON.stringify(repaired));
    await page.click('[data-tier="workshop"][data-step="-1"]');
    await page.click('#continue');
    const zero = JSON.parse(await page.evaluate(`return JSON.stringify({ stillForm: !document.querySelector('#registration-view').hidden, pass: document.querySelector('#pass-view').hidden, error: !document.querySelector('#tier-error').hidden, focused: document.activeElement.id, estimate: document.querySelector('#estimate').textContent })`));
    check(`zero tickets block preview with specific error at ${width}`, zero.stillForm && zero.pass && zero.error && zero.focused === 'general' && /£0 for 0 tickets/.test(zero.estimate), JSON.stringify(zero));
    await page.click('[data-tier="workshop"][data-step="1"]');
    await page.click('#continue');
    const pass = JSON.parse(await page.evaluate(`return JSON.stringify({
      formHidden: document.querySelector('#registration-view').hidden,
      passVisible: !document.querySelector('#pass-view').hidden,
      name: document.querySelector('#attendee-name').textContent,
      tickets: document.querySelector('#pass-tickets').textContent,
      amount: document.querySelector('#pass-total').textContent,
      focus: document.activeElement.id,
      warning: document.querySelector('.preview-warning').textContent,
      badge: document.querySelector('.qr-badge').textContent,
      disabled: [...document.querySelectorAll('.pass-actions button')].every((x) => x.disabled),
      overflow: document.documentElement.scrollWidth - innerWidth,
      url: location.pathname + location.search
    })`));
    check(`valid submit previews only an uncharged non-scannable pass at ${width}`, pass.formHidden && pass.passVisible && pass.name === 'Katherine Johnson' && /Workshop Pass × 1/.test(pass.tickets) && /£220 · not charged/.test(pass.amount) && pass.focus === 'pass-heading' && /no payment or reservation occurred/i.test(pass.warning) && /DEMO/.test(pass.badge) && pass.disabled && pass.url === '/event/demo/index.html', JSON.stringify(pass));
    check(`pass has zero horizontal overflow and no outbound POST at ${width}`, pass.overflow <= 1 && page.network.every((entry) => entry.method === 'GET'), `${pass.overflow}px; network=${JSON.stringify(page.network.map((entry) => [entry.method, new URL(entry.url).pathname]))}`);
    await page.screenshot(join(shots, `pass-${width}.png`));
    await page.click('#edit-details');
    const edit = JSON.parse(await page.evaluate(`return JSON.stringify({ form: !document.querySelector('#registration-view').hidden, pass: document.querySelector('#pass-view').hidden, name: document.querySelector('#attendee').value, qty: document.querySelector('#workshop').value, focus: document.activeElement.id })`));
    check(`edit returns with attendee and tier preserved at ${width}`, edit.form && edit.pass && edit.name === 'Katherine Johnson' && edit.qty === '1' && edit.focus === 'attendee', JSON.stringify(edit));
    await page.click('#continue');
    await page.click('#start-over');
    const restart = JSON.parse(await page.evaluate(`return JSON.stringify({ form: !document.querySelector('#registration-view').hidden, name: document.querySelector('#attendee').value, qty: [document.querySelector('#general').value,document.querySelector('#workshop').value], estimate: document.querySelector('#estimate').textContent })`));
    check(`start over clears form and restores default tier at ${width}`, restart.form && restart.name === '' && restart.qty.join(',') === '1,0' && /£120/.test(restart.estimate), JSON.stringify(restart));
    check(`no page exceptions at ${width}`, page.console.every((entry) => entry.type !== 'exception'), JSON.stringify(page.console));
    await page.close();

    const compare = await chrome.newPage({ viewport: { width, height: 900 }, mobile: width === 390 });
    await compare.goto(`${base}/compare.html`);
    await compare.evaluate(`document.querySelectorAll('.comparison')[1].scrollIntoView(); return true;`);
    await sleep(350);
    const views = JSON.parse(await compare.evaluate(`return JSON.stringify({ images:[...document.querySelectorAll('.comparison img')].map((x)=>[x.naturalWidth,x.naturalHeight]), frames:[...document.querySelectorAll('.comparison iframe')].map((x)=>({ready:x.contentDocument?.readyState,pass:x.contentDocument?.querySelector('#pass-view')?.hidden,warning:x.contentDocument?.querySelector('.preview-warning')?.textContent})),overflow:document.documentElement.scrollWidth - innerWidth })`));
    check(`compare loads two actual boards and interactive iframes at ${width}`, views.images.length === 2 && views.images.every(([w,h])=>w===1376&&h===768) && views.frames.length === 2 && views.frames.every((x)=>x.ready==='complete') && views.frames[0].pass === true && views.frames[1].pass === false && /not a confirmed registration/i.test(views.frames[1].warning), JSON.stringify(views));
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
console.log(`${checks.length - failed.length}/${checks.length} checks passed; screenshots ${shots}; JSON ${report}`);
for (const entry of failed) console.error('FAILED', entry.name, entry.detail);
for (const error of errors) console.error('ERROR', error);
process.exitCode = failed.length || errors.length ? 1 : 0;
