/**
 * Functional local-browser check for the workspace capability (mwg-train-ksn).
 *
 * The bead's acceptance bar is a driven journey, and the parts that only a browser can settle are: that the
 * onboarding form can actually be filled and submitted, that signing out really ends the session, that a
 * WRONG credential is refused on the login page a person sees, that the right one gets back in, and that a
 * member's own request to the owner-only route is refused from their own page in their own browser.
 *
 * The last one is why this script exists rather than trusting the HTTP suite: it fetches the admin route
 * from the member's page, with the member's cookie and the member's OWN token read out of the DOM, so the
 * refusal is the permission check seen from a real browser session.
 *
 * Usage: node scripts/verify-workspace.mjs   (WORKSPACE_ARM=vue to check another arm)
 * Evidence (screenshots + a JSON report) is written to /tmp/workspace-shots.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { buildProjectFromSpec } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { MEMBER, OWNER, PLAN, SETTING, USE_CASE, workspaceSpec } from './lib/workspace-spec.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = process.env.WORKSPACE_SHOTS ?? '/tmp/workspace-shots';
const PORT = Number(process.env.WORKSPACE_PORT ?? 7941);
const ARM = process.env.WORKSPACE_ARM ?? 'raw';
mkdirSync(SHOTS, { recursive: true });

const WORKSPACE_NAME = 'Acme tools';
const checks = [];
function check(name, truth, detail) {
  checks.push({ name, ok: Boolean(truth), detail });
  console.log(`${truth ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}

const { projectId, files, spec } = buildProjectFromSpec({ spec: workspaceSpec(), frameworkName: ARM });
const dir = mkdtempSync(join(tmpdir(), `workspace-belief-${ARM}-`));
writeProject(dir, { projectId, files, spec, includeDependencies: true });
symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
const server = spawn('node', ['server.mjs', '--port', String(PORT), '--db', join(dir, 'belief.sqlite')], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
let browser;
const base = `http://127.0.0.1:${PORT}`;
// `evaluate` wraps its argument in an async function BODY, so a bare expression is a statement and comes
// back undefined: every read has to `return`. The first version of this file read undefined for six checks
// in a row because of it.
const text = (page, selector) => page.evaluate(`return document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ''`);
const has = (page, selector) => page.evaluate(`return Boolean(document.querySelector(${JSON.stringify(selector)}))`);
/**
 * Type a value into a field that may already hold one. The onboarding form PREFILLS the workspace name, so
 * plain typing appends: the first version of this gate produced a workspace called "Acme toolsAcme tools"
 * with an h1 reading the name twice. That was reported as a page defect by the DOM assertion below, and it
 * was the gate's own typing - a screenshot alone would have left me guessing between the two. A person
 * selects the contents and replaces them; End + Backspace is that, from a real keyboard.
 */
const fillField = async (page, selector, value) => {
  // Focus it the way realType does (`el.focus()`): a synthetic `el.click()` does NOT focus an input, so
  // the first version of this helper sent End and Backspace to the document and cleared nothing.
  await page.realType(selector, '');
  const existing = await page.evaluate(`return document.querySelector(${JSON.stringify(selector)}).value.length`);
  await page.realKey('End');
  for (let index = 0; index < existing; index += 1) await page.realKey('Backspace');
  await page.realType(selector, value);
  const landed = await page.evaluate(`return document.querySelector(${JSON.stringify(selector)}).value`);
  if (landed !== value) throw new Error(`fillField(${selector}) left ${JSON.stringify(landed)} instead of ${JSON.stringify(value)}`);
};
const fillAndSubmit = async (page, values, submitSelector) => {
  for (const [selector, value] of Object.entries(values)) await page.realType(selector, value);
  await page.click(submitSelector);
  await page.waitForSettled();
};

try {
  let up = false;
  for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
  }
  check(`${ARM}: the server is up`, up, `GET ${base}/__health`);
  if (!up) throw new Error('server never came up');

  browser = await launchChrome();
  const owner = await browser.newPage();

  // THE OWNER'S JOURNEY, through the form a person uses.
  await owner.goto(`${base}/onboarding`);
  check(`${ARM}: the onboarding form is reachable`, await owner.waitFor('#onboarding-form').then(() => true, () => false), 'GET /onboarding renders #onboarding-form');
  await owner.selectOption('#use_case', USE_CASE);
  await owner.selectOption('#plan', PLAN);
  // Read back what the form will actually submit, so a check about the CHOSEN use case cannot pass because
  // the select silently kept its default.
  check(`${ARM}: the onboarding form holds the chosen use case and plan`,
    (await owner.evaluate("return document.querySelector('#use_case').value")) === USE_CASE && (await owner.evaluate("return document.querySelector('#plan').value")) === PLAN,
    `${await owner.evaluate("return document.querySelector('#use_case').value")} / ${await owner.evaluate("return document.querySelector('#plan').value")}`);
  await fillField(owner, '#workspace_name', WORKSPACE_NAME);
  await fillAndSubmit(owner,
    { '#email': OWNER.email, '#display_name': 'Ada Owner', '#password': OWNER.password },
    '#onboarding-form button[type=submit]');
  await owner.waitFor('#workspace-facts');
  check(`${ARM}: creating a workspace lands on it`, (await owner.url()).endsWith('/workspace'), await owner.url());
  check(`${ARM}: the custom workspace name is carried`, (await text(owner, 'h1')) === WORKSPACE_NAME, `h1 reads ${JSON.stringify(await text(owner, 'h1'))}`);
  check(`${ARM}: the creator owns it`, (await text(owner, '#workspace-role')) === 'owner', `role reads ${await text(owner, '#workspace-role')}`);
  check(`${ARM}: onboarding carried the use case`, (await text(owner, '#workspace-use-case')) === USE_CASE, `use case reads ${await text(owner, '#workspace-use-case')}`);
  check(`${ARM}: onboarding carried the plan`, (await text(owner, '#workspace-plan')) === PLAN, `plan reads ${await text(owner, '#workspace-plan')}`);
  // The screenshot is evidence, so what it is supposed to show is asserted: one heading, and the workspace
  // name in the visible text exactly once. A capture that painted it twice would otherwise be reported as a
  // page defect - or, worse, a real defect would hide behind the assumption that it is an artifact.
  const headings = await owner.evaluate('return document.querySelectorAll("h1").length');
  const visibleText = await owner.evaluate('return document.body.innerText');
  const nameMentions = visibleText.split(WORKSPACE_NAME).length - 1;
  check(`${ARM}: the owner page has one heading and renders the name once`,
    headings === 1 && nameMentions === 1 && visibleText.includes(WORKSPACE_NAME),
    `h1 count ${headings}, the name ${nameMentions} time(s): ${JSON.stringify(await owner.evaluate('return document.querySelector("main")?.innerHTML?.slice(0, 180) ?? document.body.innerHTML.slice(0, 180)'))}`);
  await owner.screenshot(join(SHOTS, `workspace-owner-${ARM}.png`));

  // The owner-only setting, chosen in the real select and saved through the real form.
  await owner.selectOption('#setting', SETTING.second);
  await owner.click('#workspace-setting-form button[type=submit]');
  await owner.waitForSettled();
  await owner.waitFor('#workspace-facts');
  check(`${ARM}: the owner changes the setting`, (await text(owner, '#workspace-setting')) === SETTING.second, `setting reads ${await text(owner, '#workspace-setting')}`);
  await owner.screenshot(join(SHOTS, `workspace-setting-${ARM}.png`));

  // Invite, then sign out, then the two logins.
  await fillAndSubmit(owner, { '#invite_email': MEMBER.email }, '#workspace-invite-form button[type=submit]');
  await owner.waitFor('#workspace-facts');
  await owner.click('#workspace-signout button[type=submit]');
  await owner.waitForSettled();
  // Signing out redirects to the home page, so the proof is that the workspace is no longer reachable
// without a session: a fetch follows the redirect and reports where it ended up. (`goto` cannot express
// this - it treats a redirect away from the requested URL as a navigation timeout.)
const afterSignOut = await owner.evaluate(`return (await fetch('/workspace', { credentials: 'same-origin', redirect: 'follow' })).url`);
check(`${ARM}: signing out ended the session`, afterSignOut.includes('/login'), `asking for the workspace led to ${afterSignOut}`);


  await owner.goto(`${base}/login`);
  check(`${ARM}: the sign-in form is reachable`, await has(owner, 'form[action="/login"]'), 'GET /login renders the sign-in form');
  await fillAndSubmit(owner, { '#email': OWNER.email, '#password': 'not the password' }, 'form[action="/login"] button[type=submit]');
  await owner.waitFor('[role=alert]');
  check(`${ARM}: a wrong credential is refused on the page`, (await owner.url()).includes('/login') && (await text(owner, '[role=alert]')).length > 0, `still on ${await owner.url()} saying "${await text(owner, '[role=alert]')}"`);
  await owner.screenshot(join(SHOTS, `workspace-wrong-credential-${ARM}.png`));

  await owner.goto(`${base}/login`);
  await fillAndSubmit(owner, { '#email': OWNER.email, '#password': OWNER.password }, 'form[action="/login"] button[type=submit]');
  await owner.waitForSettled();
  check(`${ARM}: the right credential signs in`, (await owner.url()).endsWith('/workspace') || (await owner.url()).endsWith('/'), `landed on ${await owner.url()}`);
  await owner.goto(`${base}/workspace`);
  check(`${ARM}: the owner is back in as owner`, (await text(owner, '#workspace-role')) === 'owner', `role reads ${await text(owner, '#workspace-role')}`);

  // THE SECOND JOURNEY, in a browser of its own: an invited colleague.
  // A cookie jar of its own: a second page in the same context is still the owner's session.
  const member = await browser.newPage({ isolate: true });
  await member.goto(`${base}/onboarding`);
  await member.selectOption('#use_case', USE_CASE);
  await member.selectOption('#plan', PLAN);
  await fillField(member, '#workspace_name', 'A workspace of my own');
  await fillAndSubmit(member,
    { '#email': MEMBER.email, '#display_name': 'Grace Member', '#password': MEMBER.password },
    '#onboarding-form button[type=submit]');
  await member.waitFor('#workspace-facts');
  check(`${ARM}: the invited colleague is a member`, (await text(member, '#workspace-role')) === 'member', `role reads ${await text(member, '#workspace-role')}`);
  check(`${ARM}: the member joined the invitation's workspace`, (await text(member, '#workspace-use-case')) === USE_CASE && (await text(member, '#workspace-setting')) === SETTING.second, `use case ${await text(member, '#workspace-use-case')}, setting ${await text(member, '#workspace-setting')}`);
  check(`${ARM}: the member is told what they cannot do`, (await has(member, '#workspace-read-only')) === true, 'the read-only notice is rendered');
  check(`${ARM}: the member is not offered the admin forms`, (await member.evaluate("return !document.querySelector('#workspace-setting-form') && !document.querySelector('#workspace-invite-form')")) === true, 'no admin form in the member markup');
  await member.screenshot(join(SHOTS, `workspace-member-${ARM}.png`));

  // THE ACCEPTANCE BAR, from the member's own browser: their own token, their own cookie, the owner-only
  // route. The refusal must be the permission check.
  const refusal = await member.evaluate(`return (async () => {
    const token = document.querySelector('#workspace-signout input[name=csrf]').value;
    const response = await fetch('/workspace/setting', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ setting: ${JSON.stringify(SETTING.first)}, csrf: token }).toString(),
      credentials: 'same-origin',
    });
    return { status: response.status, body: await response.text() };
  })()`);
  check(`${ARM}: a member's own request to the owner-only route is refused`, refusal.status === 403 && refusal.body.includes('owner'), `${refusal.status} ${refusal.body}`);
  const afterwards = await member.evaluate(`return (await fetch('/workspace', { credentials: 'same-origin' })).text()`);
  check(`${ARM}: and the refused attempt changed nothing`, /id="workspace-setting"[^>]*>([^<]*)</.exec(afterwards)?.[1]?.trim() === SETTING.second, `setting still reads ${/id="workspace-setting"[^>]*>([^<]*)</.exec(afterwards)?.[1]?.trim()}`);
  await member.screenshot(join(SHOTS, `workspace-member-refused-${ARM}.png`));

  check(`${ARM}: no password is readable on any page the browser saw`, !(await member.content()).includes(MEMBER.password) && !(await owner.content()).includes(OWNER.password), 'the rendered markup never contains a credential');
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
writeFileSync(join(SHOTS, `workspace-${ARM}-report.json`), `${JSON.stringify({ arm: ARM, checks }, null, 2)}\n`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed (${ARM}); evidence in ${SHOTS}`);
process.exit(failed.length === 0 ? 0 : 1);
