/**
 * The workspace capability (mwg-train-ksn): verified credentials, a workspace with a second role, and an
 * onboarding step that carries the chosen use case and plan into it.
 *
 * The bead's acceptance bar is a journey - create a workspace as owner, sign out, sign in with the right
 * credential, be REJECTED with a wrong one, and, as an invited member, have an admin-only action refused -
 * so that journey is what the functional half drives, in all seven arms.
 *
 * Two things about this file are deliberate. First, every refusal is asserted by its REASON, not only by its
 * status: a member's admin POST is refused by the permission check and not by the CSRF check, and a test
 * that only asserted 403 would have passed against the wrong one (it did, in the first probe). Second, the
 * security claims are read out of the DATABASE rather than off the page: the password must not be
 * recoverable from any row of any table, the legacy column must hold the disabled marker, and two accounts
 * must carry different salts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { buildProjectFromSpec, validateSpec } from '../src/eval/spec.mjs';
import { FRAMEWORKS, writeProject } from '../pilot/frameworks.mjs';
import { MEMBER, OWNER, PLAN, SETTING, USE_CASE, workspaceSpec } from '../scripts/lib/workspace-spec.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const NODE_MODULES = join(ROOT, 'node_modules');
const ARMS = Object.keys(FRAMEWORKS);
const CSRF_REFUSAL = 'That request did not come from your session.';
const OWNER_ONLY_REFUSAL = 'Only the workspace owner can change this setting.';

const textOf = (html, id) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1]?.trim();
const csrfOf = (html) => /name="csrf" value="([^"]*)"/.exec(html)?.[1];
const cookiesOf = (response) => (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).map((value) => value.split(';')[0]).join('; ');

async function availablePort() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
    return socket.address().port;
  } finally {
    await new Promise((resolve) => socket.close(resolve));
  }
}

test('spec gate: the workspace capability validates as a closed set, and fails closed', () => {
  assert.deepEqual(validateSpec(workspaceSpec()), [], 'a legitimate workspace specification validates');
  // The set stays closed now that it has an eighth member.
  assert.ok(validateSpec(workspaceSpec({ capabilities: { auth: true, workspace: true, billing: true } })).some((p) => p.includes('unknown capability')));
  // A workspace belongs to an account, and only `auth` knows which account is asking.
  assert.ok(validateSpec(workspaceSpec({ capabilities: { auth: false, workspace: true } })).some((p) => p.includes('needs capabilities.auth')));
  // On without a block, and a block without the capability.
  const noBlock = workspaceSpec();
  delete noBlock.workspace;
  assert.ok(validateSpec(noBlock).some((p) => p.includes('no workspace block states what is being created')));
  assert.ok(validateSpec(workspaceSpec({ capabilities: { auth: true, workspace: false } })).some((p) => p.includes('only meaningful with capabilities.workspace')));
  // Unknown keys, and every list that a form would render.
  assert.ok(validateSpec(workspaceSpec({ workspace: { ...workspaceSpec().workspace, seats: 5 } })).some((p) => p.includes('workspace.seats: unknown key')));
  assert.ok(validateSpec(workspaceSpec({ workspace: { ...workspaceSpec().workspace, name: '' } })).some((p) => p.includes('workspace.name')));
  assert.ok(validateSpec(workspaceSpec({ workspace: { ...workspaceSpec().workspace, use_cases: [] } })).some((p) => p.includes('workspace.use_cases')));
  assert.ok(validateSpec(workspaceSpec({ workspace: { ...workspaceSpec().workspace, plans: ['Team', 'Team'] } })).some((p) => p.includes('repeats Team')));
  // A setting with one option cannot be changed, and a change nobody can make is not a permission boundary.
  assert.ok(validateSpec(workspaceSpec({ workspace: { ...workspaceSpec().workspace, setting: { label: 'Who can join', options: ['only'] } } })).some((p) => p.includes('workspace.setting.options')));
  assert.ok(validateSpec(workspaceSpec({ workspace: { ...workspaceSpec().workspace, setting: { options: ['a', 'b'] } } })).some((p) => p.includes('workspace.setting.label')));
  // The capability's own routes are served first, so declaring one would leave a route nothing reaches -
  // matched by prefix, which is what makes `/workspace/setting/extra` a collision too.
  for (const path of ['/onboarding', '/workspace', '/workspace/setting', '/workspace/setting/extra']) {
    const route = { method: 'GET', path, kind: 'page', effect: 'render a page' };
    assert.ok(validateSpec(workspaceSpec({ routes: [...workspaceSpec().routes, route] })).some((p) => p.includes("the workspace capability's own route")), `${path} is refused`);
  }
  assert.deepEqual(validateSpec(workspaceSpec({ routes: [...workspaceSpec().routes, { method: 'GET', path: '/workspaces', kind: 'page', effect: 'render a page' }] })), [], 'a neighbouring path is still allowed');
});

test('wiring guard: the workspace block reaches the builder, and a spec that does not opt in emits nothing', () => {
  for (const frameworkName of ARMS) {
    const first = buildProjectFromSpec({ spec: workspaceSpec({ capabilities: { auth: true }, workspace: undefined }), frameworkName });
    const second = buildProjectFromSpec({ spec: workspaceSpec({ capabilities: { auth: true, workspace: false } }), frameworkName });
    for (const file of ['server.mjs', 'app/enhance.js']) {
      if (first.files[file] === undefined) continue;
      assert.equal(second.files[file], first.files[file], `${frameworkName} emitted different ${file} for a block whose capability is off`);
    }
    assert.equal(/workspaces|memberships|onboarding-form|workspaceCsrf/.test(first.files['server.mjs']), false, `${frameworkName} emitted workspace code without the capability`);
  }
});

for (const arm of ARMS) {
  test(`functional: ${arm} creates a workspace, verifies credentials, and refuses a member the admin action`, async () => {
    const dir = mkdtempSync(join(tmpdir(), `workspace-${arm}-`));
    const port = await availablePort();
    const { projectId, files, spec: projectSpec } = buildProjectFromSpec({ spec: workspaceSpec(), frameworkName: arm });
    writeProject(dir, { projectId, files, spec: projectSpec, includeDependencies: true });
    symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'dir');
    const dbPath = join(dir, 'test.sqlite');
    const child = spawn('node', ['server.mjs', '--port', String(port), '--db', dbPath], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
    try {
      const base = `http://127.0.0.1:${port}`;
      let up = false;
      for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        up = await fetch(`${base}/__health`).then((r) => r.ok, () => false);
      }
      assert.ok(up, `${arm} server did not come up`);
      const get = (path, cookie = '') => fetch(`${base}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
      const post = (path, body, cookie = '') =>
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
          body: new URLSearchParams(body).toString(),
          redirect: 'manual',
        });
      const onboard = (person, workspaceName = 'Acme tools') =>
        post('/onboarding', { email: person.email, display_name: person.email, password: person.password, workspace_name: workspaceName, use_case: USE_CASE, plan: PLAN });

      // Onboarding is a page before it is a POST: a form that cannot be reached cannot be filled in.
      const onboardingPage = await get('/onboarding');
      assert.equal(onboardingPage.status, 200, `${arm} serves the onboarding form`);
      assert.match(await onboardingPage.text(), /id="onboarding-form"/, `${arm} the onboarding form is a form`);

      // Refusals with a reason, before anything is created.
      const bad = [
        [await post('/onboarding', { email: 'not-an-email', password: OWNER.password, use_case: USE_CASE, plan: PLAN }), 422, 'an address that is not one'],
        [await post('/onboarding', { email: OWNER.email, password: 'short', use_case: USE_CASE, plan: PLAN }), 422, 'a password too short to be one'],
        [await post('/onboarding', { email: OWNER.email, password: OWNER.password, use_case: 'Nothing', plan: PLAN }), 422, 'a use case this workspace does not offer'],
        [await post('/onboarding', { email: OWNER.email, password: OWNER.password, use_case: USE_CASE, plan: 'Nothing' }), 422, 'a plan this workspace does not offer'],
      ];
      for (const [response, status, why] of bad) {
        assert.equal(response.status, status, `${arm} refuses ${why}`);
        assert.ok((await response.text()).length > 0, `${arm} refuses ${why} with a reason`);
      }

      // THE OWNER'S JOURNEY.
      const created = await onboard(OWNER);
      const ownerCookie = cookiesOf(created);
      assert.equal(created.status, 303, `${arm} onboarding creates the workspace`);
      assert.equal(created.headers.get('location'), '/workspace', `${arm} onboarding lands on the workspace`);
      assert.match(ownerCookie, /^sid=/, `${arm} onboarding issues a session`);

      const ownerView = await (await get('/workspace', ownerCookie)).text();
      assert.equal(textOf(ownerView, 'workspace-role'), 'owner', `${arm} the creator owns the workspace`);
      assert.equal(textOf(ownerView, 'workspace-use-case'), USE_CASE, `${arm} the chosen use case is carried into the workspace`);
      assert.equal(textOf(ownerView, 'workspace-plan'), PLAN, `${arm} the chosen plan is carried into the workspace`);
      assert.equal(textOf(ownerView, 'workspace-setting'), SETTING.first, `${arm} the setting starts at the first option`);
      assert.match(ownerView, /id="workspace-setting-form"/, `${arm} the owner is offered the admin setting`);
      assert.match(ownerView, /id="workspace-invite-form"/, `${arm} the owner is offered the invite form`);
      const ownerToken = csrfOf(ownerView);
      assert.ok(ownerToken, `${arm} the owner's page carries a session token`);

      // The token is load-bearing: without it, or with another, the write is refused before anything else.
      for (const [body, why] of [[{ setting: SETTING.second }, 'no token'], [{ setting: SETTING.second, csrf: 'nonsense' }, 'a token that is not this session’s']]) {
        const refused = await post('/workspace/setting', body, ownerCookie);
        assert.equal(refused.status, 403, `${arm} the setting is refused with ${why}`);
        assert.equal(await refused.text(), CSRF_REFUSAL, `${arm} ${why} is refused as a session problem`);
      }
      const badValue = await post('/workspace/setting', { setting: 'Not an option', csrf: ownerToken }, ownerCookie);
      assert.equal(badValue.status, 422, `${arm} a setting value the specification does not offer is refused`);
      const changed = await post('/workspace/setting', { setting: SETTING.second, csrf: ownerToken }, ownerCookie);
      assert.equal(changed.status, 303, `${arm} the owner can change the setting`);
      const afterChange = await (await get('/workspace', ownerCookie)).text();
      assert.equal(textOf(afterChange, 'workspace-setting'), SETTING.second, `${arm} the setting changed`);

      const invited = await post('/workspace/invite', { invite_email: MEMBER.email, csrf: ownerToken }, ownerCookie);
      assert.equal(invited.status, 303, `${arm} the owner can invite a colleague`);
      assert.equal((await post('/workspace/invite', { invite_email: 'not-an-email', csrf: ownerToken }, ownerCookie)).status, 422, `${arm} an invite needs an address`);

      // SIGN OUT, THEN SIGN IN: the credential is checked, and both failures look the same.
      assert.equal((await post('/logout', {}, ownerCookie)).status, 303, `${arm} signing out works`);
      const signedOut = await get('/workspace', ownerCookie);
      assert.equal(signedOut.status, 303, `${arm} the session is gone`);
      assert.equal(signedOut.headers.get('location'), '/login', `${arm} and the visitor is sent to sign in`);
      const wrongPassword = await post('/login', { email: OWNER.email, password: 'not the password' });
      const unknownEmail = await post('/login', { email: 'nobody@example.test', password: OWNER.password });
      assert.equal(wrongPassword.status, 401, `${arm} a wrong password is rejected`);
      assert.equal(unknownEmail.status, 401, `${arm} an unknown address is rejected`);
      const wrongMessage = await wrongPassword.text();
      assert.equal(wrongMessage, await unknownEmail.text(), `${arm} the refusal does not say WHICH was wrong (no user enumeration)`);
      assert.equal(wrongMessage.includes(OWNER.password), false, `${arm} the refusal does not echo the password`);
      const right = await post('/login', { email: OWNER.email, password: OWNER.password });
      assert.equal(right.status, 303, `${arm} the right credential signs in`);
      const ownerAgain = cookiesOf(right);
      assert.match(ownerAgain, /^sid=/, `${arm} signing in issues a session`);
      assert.equal(textOf(await (await get('/workspace', ownerAgain)).text(), 'workspace-role'), 'owner', `${arm} the session belongs to the owner`);

      // THE SECOND JOURNEY: the invited colleague joins the SAME workspace, as a member.
      const memberOnboarding = await onboard(MEMBER, 'A workspace of my own');
      const memberCookie = cookiesOf(memberOnboarding);
      assert.equal(memberOnboarding.status, 303, `${arm} the invited address can create its account`);
      const memberView = await get('/workspace', memberCookie);
      const memberHtml = await memberView.text();
      assert.equal(textOf(memberHtml, 'workspace-role'), 'member', `${arm} the invited person is a member, not an owner`);
      assert.equal(memberHtml.includes('A workspace of my own'), false, `${arm} the member joined the invitation's workspace rather than creating one`);
      assert.equal(textOf(memberHtml, 'workspace-use-case'), USE_CASE, `${arm} the member can read the workspace`);
      assert.equal(textOf(memberHtml, 'workspace-setting'), SETTING.second, `${arm} the member reads the setting the owner chose`);
      assert.equal((memberHtml.match(/<li data-role="(owner|member)">/g) ?? []).length, 2, `${arm} both people are members`);
      assert.match(memberHtml, /id="workspace-read-only"/, `${arm} the member is told what they cannot do`);
      assert.equal(/id="workspace-setting-form"|id="workspace-invite-form"/.test(memberHtml), false, `${arm} the member is not offered the admin forms`);
      assert.equal((await post('/onboarding', { email: MEMBER.email, password: MEMBER.password, use_case: USE_CASE, plan: PLAN })).status, 422, `${arm} an address that already has an account is refused`);

      // THE ACCEPTANCE BAR: an admin-only action is refused for the member, and refused by the PERMISSION
      // check rather than the token check - the member sends their OWN page's token, which is valid for
      // their session. A test that sent no token would be refused as a session problem and would prove
      // nothing about the role.
      const memberToken = csrfOf(memberHtml);
      assert.ok(memberToken, `${arm} the member's page carries their own token`);
      assert.notEqual(memberToken, ownerToken, `${arm} the token belongs to a session, not to the page`);
      const memberSetting = await post('/workspace/setting', { setting: SETTING.first, csrf: memberToken }, memberCookie);
      assert.equal(memberSetting.status, 403, `${arm} a member cannot change the owner-only setting`);
      assert.equal(await memberSetting.text(), OWNER_ONLY_REFUSAL, `${arm} the refusal is the permission check, not the token check`);
      const memberInvite = await post('/workspace/invite', { invite_email: 'someone@example.test', csrf: memberToken }, memberCookie);
      assert.equal(memberInvite.status, 403, `${arm} a member cannot invite people`);
      assert.equal(await memberInvite.text(), 'Only the workspace owner can invite people.', `${arm} and that refusal is the permission check too`);
      const unchanged = await (await get('/workspace', memberCookie)).text();
      assert.equal(textOf(unchanged, 'workspace-setting'), SETTING.second, `${arm} the refused attempt changed nothing`);

      // STORAGE: read out of the database, not off the page. A password must not be recoverable from any
      // row of any table, the legacy column must hold the disabled marker, and the salts must differ, which
      // is what "per-user salt" means.
      const database = new DatabaseSync(dbPath);
      const accounts = database.prepare('SELECT email, password FROM accounts ORDER BY email').all();
      assert.deepEqual(accounts.map((row) => row.password), ['!', '!'], `${arm} the legacy password column holds no secret`);
      const credentials = database.prepare('SELECT email, kdf, salt, digest FROM account_credentials ORDER BY email').all();
      assert.deepEqual(credentials.map((row) => row.kdf), ['scrypt', 'scrypt'], `${arm} the KDF is recorded per credential`);
      assert.equal(new Set(credentials.map((row) => row.salt)).size, 2, `${arm} each account has its own salt`);
      assert.equal(new Set(credentials.map((row) => row.digest)).size, 2, `${arm} the same password would still differ per salt`);
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
      const leaked = tables.flatMap((table) =>
        database.prepare(`SELECT * FROM ${table}`).all().filter((row) => JSON.stringify(row).includes(OWNER.password) || JSON.stringify(row).includes(MEMBER.password)),
      );
      assert.equal(leaked.length, 0, `${arm} no row in any table contains a password in the clear`);
      database.close();

      // THE SECURITY REVIEW'S P1 AND P2, driven from the database, because that is where the defect was.
      // A digest of the wrong length is not a credential: `Buffer.from('', 'hex')` and `Buffer.from('xyz',
      // 'hex')` are zero-length, so before the fix any password authenticated against a corrupted row.
      const security = new DatabaseSync(dbPath);
      const stored = security.prepare('SELECT digest FROM account_credentials WHERE email = ?').get(OWNER.email).digest;
      for (const malformed of ['', 'xyz', 'a', 'ab']) {
        security.prepare('UPDATE account_credentials SET digest = ? WHERE email = ?').run(malformed, OWNER.email);
        const refused = await post('/login', { email: OWNER.email, password: OWNER.password });
        assert.equal(refused.status, 401, `${arm} a digest of ${JSON.stringify(malformed)} must not authenticate even the RIGHT password`);
      }
      security.prepare('UPDATE account_credentials SET digest = ? WHERE email = ?').run(stored, OWNER.email);
      assert.equal((await post('/login', { email: OWNER.email, password: OWNER.password })).status, 303, `${arm} restoring the digest restores sign-in, so the refusals above were the corruption`);

      // The server, not the browser, is what decides a session has ended: the cookie's Max-Age expires in
      // the browser, and a sid replayed after it must not still be a session.
      const live = security.prepare('SELECT sid FROM auth_sessions ORDER BY created_at DESC LIMIT 1').get();
      security.prepare('UPDATE auth_sessions SET created_at = ? WHERE sid = ?').run(new Date(Date.now() - 7_200_000).toISOString(), live.sid);
      const expired = await get('/workspace', `sid=${live.sid}`);
      assert.equal(expired.status, 303, `${arm} a two-hour-old session is refused`);
      assert.equal(expired.headers.get('location'), '/login', `${arm} and its holder is sent to sign in again`);
      const fresh = cookiesOf(await post('/login', { email: OWNER.email, password: OWNER.password }));
      assert.equal((await get('/workspace', fresh)).status, 200, `${arm} a fresh session still works, so that refusal is not a blanket one`);
      security.close();

      // And the same claim about what leaves the server: no page, and no refusal, carries the password.
      for (const [path, cookie] of [['/onboarding', ''], ['/login', ''], ['/workspace', ownerAgain], ['/workspace', memberCookie]]) {
        const body = await (await get(path, cookie)).text();
        assert.equal(body.includes(OWNER.password) || body.includes(MEMBER.password), false, `${arm} ${path} does not render a password`);
      }
    } finally {
      child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
