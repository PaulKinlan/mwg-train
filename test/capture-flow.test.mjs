import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { recordFlow } from '../src/capture/flow.mjs';
import { validateFlow } from '../src/capture/schema.mjs';

const execFileAsync = promisify(execFile);

/** Start a local test HTTP server attached only to 127.0.0.1. */
function startFixtureServer() {
  let lastSubmission = null;

  const server = createServer((req, res) => {
    const host = req.headers.host ?? '127.0.0.1';
    const parsed = new URL(req.url, `http://${host}`);

    if (req.method === 'GET' && parsed.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Registration Form</title></head>
<body>
  <h1>Register</h1>
  <form id="register" action="/submit" method="POST">
    <label for="username">Username</label>
    <input id="username" name="username" type="text" />
    <label for="membership">Membership</label>
    <select id="membership" name="membership">
      <option value="standard">Standard</option>
      <option value="gold">Gold</option>
      <option value="platinum">Platinum</option>
    </select>
    <button id="submit" type="submit">Complete Registration</button>
  </form>
</body>
</html>`);
      return;
    }

    if (req.method === 'POST' && parsed.pathname === '/submit') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const username = params.get('username') ?? '';
        const membership = params.get('membership') ?? '';
        lastSubmission = { username, membership };
        res.writeHead(303, {
          Location: `/confirmed?username=${encodeURIComponent(username)}&membership=${encodeURIComponent(membership)}`,
        });
        res.end();
      });
      return;
    }

    if (req.method === 'GET' && parsed.pathname === '/confirmed') {
      const username = parsed.searchParams.get('username') ?? '';
      const membership = parsed.searchParams.get('membership') ?? '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Confirmed</title></head>
<body>
  <h1>Registration Confirmed</h1>
  <p id="welcome">Welcome, ${username}!</p>
  <p id="tier">Tier: ${membership}</p>
</body>
</html>`);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' ? address.port : 0;
      const url = `http://127.0.0.1:${port}/`;
      resolvePromise({
        server,
        url,
        getLastSubmission: () => lastSubmission,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('recordFlow executes intents through real input path and produces a validated flow', async () => {
  const fixture = await startFixtureServer();
  let chrome = null;

  try {
    chrome = await launchChrome();
    const page = await chrome.newPage();

    const steps = [
      { action: 'goto' },
      { action: 'fill', target: 'input[name=username]', value: 'alice' },
      { action: 'select', target: 'select[name=membership]', value: 'platinum' },
      { action: 'submit', target: 'form#register' },
      { action: 'goto', expectText: 'alice' },
    ];

    const flow = await recordFlow({
      url: fixture.url,
      rightsRef: 'docs/provenance/assets/reproduction-studies.md',
      steps,
      page,
    });

    // 1. Assert recorded flow passes validateFlow
    const problems = validateFlow(flow);
    assert.deepEqual(problems, [], `flow failed validateFlow: ${JSON.stringify(problems)}`);

    // 2. Assert select was REALLY changed (the fixture echoes it)
    const submission = fixture.getLastSubmission();
    assert.ok(submission, 'server did not receive any submission');
    assert.equal(submission.username, 'alice', 'username submitted should match typed value');
    assert.equal(submission.membership, 'platinum', 'select was not changed to platinum; synthetic or no-op select failed');

    // 3. Assert flow structure
    assert.equal(flow.flow_version, 1);
    assert.equal(flow.start_path, '/');
    assert.equal(flow.steps.length, 5);

    // Step 0: goto
    assert.equal(flow.steps[0].index, 0);
    assert.equal(flow.steps[0].path, '/');
    assert.equal(flow.steps[0].action, 'goto');

    // Step 1: fill
    assert.equal(flow.steps[1].index, 1);
    assert.equal(flow.steps[1].path, '/');
    assert.equal(flow.steps[1].action, 'fill');
    assert.equal(flow.steps[1].target, 'input[name=username]');
    assert.equal(flow.steps[1].value, 'alice');

    // Step 2: select
    assert.equal(flow.steps[2].index, 2);
    assert.equal(flow.steps[2].path, '/');
    assert.equal(flow.steps[2].action, 'select');
    assert.equal(flow.steps[2].target, 'select[name=membership]');
    assert.equal(flow.steps[2].value, 'platinum');

    // Step 3: submit navigated to /confirmed
    assert.equal(flow.steps[3].index, 3);
    assert.equal(flow.steps[3].path, '/');
    assert.equal(flow.steps[3].action, 'submit');
    assert.equal(flow.steps[3].target, 'form#register');
    assert.equal(flow.steps[3].expected_path, '/confirmed');

    // Step 4: expectText on /confirmed
    assert.equal(flow.steps[4].index, 4);
    assert.equal(flow.steps[4].path, '/confirmed');
    assert.equal(flow.steps[4].action, 'goto');
    assert.equal(flow.steps[4].expectText, 'alice');
  } finally {
    if (chrome) {
      await chrome.close();
    }
    await fixture.close();
  }
});

test('expectText is recorded ONLY where the value was supplied earlier AND is visible now', async () => {
  const fixture = await startFixtureServer();
  let chrome = null;

  try {
    chrome = await launchChrome();
    const page = await chrome.newPage();

    // Steps containing both valid and invalid expectText intents:
    // - step 0: expectText on step 0 before any value was entered -> must be omitted
    // - step 1: expectText for value entered in step 1 itself (not earlier) -> must be omitted
    // - step 2: expectText for text never entered anywhere -> must be omitted
    // - step 3: expectText for text entered earlier ('alice') visible after navigation -> recorded!
    // - step 4: expectText for select value ('gold') visible on confirmation page -> recorded!
    // - step 5: expectText for text entered earlier ('alice') but testing false claim -> omitted if not visible
    const steps = [
      { action: 'goto', expectText: 'alice' }, // not supplied by earlier step -> omit
      { action: 'fill', target: 'input[name=username]', value: 'alice', expectText: 'alice' }, // not supplied by EARLIER step -> omit
      { action: 'select', target: 'select[name=membership]', value: 'gold', expectText: 'unentered_token' }, // unentered -> omit
      { action: 'submit', target: 'form#register', expectText: 'alice' }, // supplied in step 1, visible on landed page -> record
      { action: 'goto', expectText: 'gold' }, // supplied in step 2, visible on landed page -> record
      { action: 'goto', expectText: 'missing_text' }, // not in earlier supplied -> omit
    ];

    const flow = await recordFlow({
      url: fixture.url,
      rightsRef: 'docs/provenance/assets/reproduction-studies.md',
      steps,
      page,
    });

    const problems = validateFlow(flow);
    assert.deepEqual(problems, []);

    // Step 0: omitted because 'alice' was not supplied earlier
    assert.equal(flow.steps[0].expectText, undefined);

    // Step 1: omitted because 'alice' was supplied in step 1, not an EARLIER step
    assert.equal(flow.steps[1].expectText, undefined);

    // Step 2: omitted because 'unentered_token' was never entered
    assert.equal(flow.steps[2].expectText, undefined);

    // Step 3: recorded because 'alice' was supplied earlier (step 1) and is visible on /confirmed
    assert.equal(flow.steps[3].expectText, 'alice');

    // Step 4: recorded because 'gold' was supplied earlier (step 2) and is visible on /confirmed
    assert.equal(flow.steps[4].expectText, 'gold');

    // Step 5: omitted because 'missing_text' was not supplied earlier
    assert.equal(flow.steps[5].expectText, undefined);
  } finally {
    if (chrome) {
      await chrome.close();
    }
    await fixture.close();
  }
});

test('a recording without rights-ref is refused', async () => {
  const fixture = await startFixtureServer();
  let chrome = null;

  try {
    chrome = await launchChrome();
    const page = await chrome.newPage();

    const steps = [
      { action: 'goto' },
      { action: 'fill', target: 'input[name=username]', value: 'bob' },
    ];

    // Missing rightsRef
    await assert.rejects(
      async () => {
        await recordFlow({
          url: fixture.url,
          steps,
          page,
        });
      },
      (err) => {
        return /rights_ref|rightsRef/i.test(err.message);
      },
      'recordFlow should reject when rightsRef is missing',
    );

    // Empty string rightsRef
    await assert.rejects(
      async () => {
        await recordFlow({
          url: fixture.url,
          rightsRef: '   ',
          steps,
          page,
        });
      },
      (err) => {
        return /rights_ref|rightsRef/i.test(err.message);
      },
      'recordFlow should reject when rightsRef is whitespace',
    );
  } finally {
    if (chrome) {
      await chrome.close();
    }
    await fixture.close();
  }
});

test('CLI scripts/record-flow.mjs executes successfully and enforces constraints', async () => {
  const fixture = await startFixtureServer();
  const tmpDir = mkdtempSync(join(tmpdir(), 'flow-cli-test-'));
  const scriptPath = resolve(process.cwd(), 'scripts/record-flow.mjs');

  try {
    const stepsPath = join(tmpDir, 'steps.json');
    const outPath = join(tmpDir, 'out.json');

    const steps = [
      { action: 'goto' },
      { action: 'fill', target: 'input[name=username]', value: 'charlie' },
      { action: 'select', target: 'select[name=membership]', value: 'platinum' },
      { action: 'submit', target: 'form#register' },
      { action: 'goto', expectText: 'charlie' },
    ];
    writeFileSync(stepsPath, JSON.stringify(steps), 'utf8');

    // Case 1: Missing --rights-ref must fail non-zero
    let cliFailed = false;
    try {
      await execFileAsync('node', [scriptPath, '--url', fixture.url, '--steps', stepsPath]);
    } catch (err) {
      cliFailed = true;
      assert.notEqual(err.code, 0);
      assert.ok(/rights-ref/i.test(err.stderr), `stderr should mention rights-ref, got: ${err.stderr}`);
    }
    assert.ok(cliFailed, 'CLI without --rights-ref should have failed');

    // Case 2: Full run with --out saves valid JSON passing validateFlow
    const { stdout } = await execFileAsync('node', [
      scriptPath,
      '--url',
      fixture.url,
      '--rights-ref',
      'docs/provenance/assets/reproduction-studies.md',
      '--steps',
      stepsPath,
      '--out',
      outPath,
    ]);

    const writtenFlow = JSON.parse(readFileSync(outPath, 'utf8'));
    const problems = validateFlow(writtenFlow);
    assert.deepEqual(problems, [], `CLI recorded flow failed validateFlow: ${JSON.stringify(problems)}`);
    assert.equal(writtenFlow.steps[1].value, 'charlie');
    assert.equal(writtenFlow.steps[2].value, 'platinum');
    assert.equal(writtenFlow.steps[4].expectText, 'charlie');

    // Confirm fixture received the platinum select
    const submission = fixture.getLastSubmission();
    assert.equal(submission?.membership, 'platinum');

    // Case 3: CLI exits non-zero with clear message when validateFlow refuses result
    // 'input' exists on page, so realType succeeds, but validateFlow refuses ambiguous selector 'input'
    const invalidStepsPath = join(tmpDir, 'invalid-steps.json');
    const invalidSteps = [
      { action: 'fill', target: 'input', value: 'bad' },
    ];
    writeFileSync(invalidStepsPath, JSON.stringify(invalidSteps), 'utf8');

    let validateRefusalFailed = false;
    try {
      await execFileAsync('node', [
        scriptPath,
        '--url',
        fixture.url,
        '--rights-ref',
        'docs/provenance/assets/reproduction-studies.md',
        '--steps',
        invalidStepsPath,
      ]);
    } catch (err) {
      validateRefusalFailed = true;
      assert.notEqual(err.code, 0);
      assert.ok(
        /validateFlow refused|target/i.test(err.stderr),
        `stderr should mention validateFlow refusal or target problem, got: ${err.stderr}`,
      );
    }
    assert.ok(validateRefusalFailed, 'CLI should exit non-zero when validateFlow refuses result');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
    await fixture.close();
  }
});
