/**
 * Tests for the site capture tool (arm A5_black_box_reproduction).
 *
 * Verifies:
 * - Local fixture site is served on 127.0.0.1 with ephemeral port (zero third-party traffic).
 * - Direct CDP driver captures screenshots, DOM and derived structure.
 * - Capture object validates against the frozen schema (validateCapture).
 * - Raw assets are routed to the quarantine store via MWG_TRAIN_QUARANTINE.
 * - Asset sha256 and byte counts match on-disk bytes exactly.
 * - Raw bytes are NOT written anywhere under the repository tree.
 * - Invocation without rightsRef or invalid URL is refused fail-closed.
 * - Browser is closed in a finally.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { captureSite } from '../src/capture/site.mjs';
import { assertCaptureTarget, installTargetGuard, interceptionVerdict } from '../src/capture/target.mjs';
import { validateCapture } from '../src/capture/schema.mjs';
import { recordFlow } from '../src/capture/flow.mjs';
import { translateCapture } from '../src/capture/translate.mjs';
import { assetStoragePath, REPO_ROOT } from '../src/provenance/store.mjs';

function createFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Fixture Test Site</title>
</head>
<body>
  <header role="banner">
    <h1>Fixture Site Main Heading</h1>
    <nav role="navigation">
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main role="main">
    <h2>Login Area</h2>
    <p>This is a short fixture excerpt text for black-box reproduction testing.</p>
    <form id="login-form" action="/login" method="post">
      <label for="user_email">Email</label>
      <input type="email" id="user_email" name="user_email" required>
      <label for="account_type">Account Type</label>
      <select id="account_type" name="account_type">
        <option value="standard">Standard</option>
        <option value="premium">Premium</option>
      </select>
      <button type="submit" name="submit_action">Sign In</button>
    </form>
    <a href="/about">Learn More</a>
  </main>
  <footer role="contentinfo">
    <p>&copy; 2026 Black Box Reproduction Fixture</p>
  </footer>
</body>
</html>`);
    } else if (req.method === 'POST' && url.pathname === '/login') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const email = new URLSearchParams(body).get('user_email') ?? '';
        res.writeHead(303, { Location: `/confirm/${encodeURIComponent(email)}` });
        res.end();
      });
    } else if (url.pathname.startsWith('/confirm/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body><p>${decodeURIComponent(url.pathname.slice('/confirm/'.length))}</p></body></html>`);
    } else if (url.pathname === '/about') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>About Fixture Site</title>
</head>
<body>
  <header role="banner">
    <h1>About Us</h1>
    <nav role="navigation">
      <a href="/">Home</a>
    </nav>
  </header>
  <main role="main">
    <p>Information about the black-box reproduction fixture.</p>
  </main>
</body>
</html>`);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });

  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({ server, port, baseUrl: `http://127.0.0.1:${port}/` });
    });
  });
}

function setupTempQuarantineStore() {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-quarantine-capture-test-'));
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.example/PaulKinlan/mwg-quarantine']);
  return dir;
}

test('captureSite captures fixture site, validates schema, and writes raw assets only into quarantine store', async (t) => {
  const { server, baseUrl } = await createFixtureServer();
  const quarantineStore = setupTempQuarantineStore();

  t.after(() => {
    server.close();
    rmSync(quarantineStore, { recursive: true, force: true });
  });

  const env = { ...process.env, MWG_TRAIN_QUARANTINE: quarantineStore };
  const rightsRef = 'docs/provenance/assets/reproduction-studies.md';

  const capture = await captureSite({
    url: baseUrl,
    rightsRef,
    env,
    allowPrivate: true,
    outDir: 'fixture-site',
    pages: ['/about'],
  });

  // 1. Capture object must pass schema validator with 0 problems
  const problems = validateCapture(capture);
  assert.deepEqual(problems, []);

  // 2. Structural metadata derived correctly
  assert.equal(capture.source.url, baseUrl);
  assert.equal(capture.source.arm, 'A5_black_box_reproduction');
  assert.equal(capture.source.rights_ref, rightsRef);
  assert.equal(capture.viewport.width, 1280);
  assert.equal(capture.viewport.height, 900);
  assert.equal(capture.pages.length, 2);

  const [page0, page1] = capture.pages;
  assert.equal(page0.path, '/');
  assert.equal(page0.title, 'Fixture Test Site');
  assert.ok(page0.headings.includes('Fixture Site Main Heading'));
  assert.ok(page0.headings.includes('Login Area'));
  assert.ok(page0.landmarks.includes('banner') || page0.landmarks.includes('header'));
  assert.ok(page0.landmarks.includes('main'));
  assert.ok(page0.nav.includes('/') || page0.nav.includes('/about'));
  assert.ok(page0.text_excerpt.includes('Fixture'));

  // Form and controls
  assert.equal(page0.forms.length, 1);
  const form = page0.forms[0];
  assert.equal(form.id, 'login-form');
  assert.equal(form.action, '/login');
  assert.equal(form.method, 'post');
  assert.equal(form.controls.length, 3);

  const [c0, c1, c2] = form.controls;
  assert.equal(c0.name, 'user_email');
  assert.equal(c0.type, 'email');
  assert.equal(c0.required, true);
  assert.equal(c0.label, 'Email');

  assert.equal(c1.name, 'account_type');
  assert.equal(c1.type, 'select');
  assert.equal(c1.required, false);
  assert.equal(c1.label, 'Account Type');
  assert.deepEqual(c1.options, ['standard', 'premium']);

  assert.equal(c2.name, 'submit_action');
  assert.equal(c2.type, 'submit');
  assert.equal(c2.required, false);

  // Links
  assert.ok(page0.links.some((l) => l.href === '/about' && l.text === 'About'));

  // Additional page (/about)
  assert.equal(page1.path, '/about');
  assert.equal(page1.title, 'About Fixture Site');

  // Network requests and console
  assert.ok(Array.isArray(capture.requests));
  assert.ok(capture.requests.length > 0);
  assert.ok(capture.requests.some((r) => r.method === 'GET' && (r.status === 200 || r.status === null)));
  assert.ok(Array.isArray(capture.console));

  // 3. Raw assets exist in quarantine store and match hashes and byte counts
  const assetKeys = ['desktop_screenshot', 'mobile_screenshot', 'dom'];
  for (const key of assetKeys) {
    const asset = capture.assets[key];
    const diskPath = assetStoragePath('A5_black_box_reproduction', asset.rel_path, { quarantineRoot: quarantineStore });

    assert.ok(existsSync(diskPath), `expected ${key} at ${diskPath}`);
    const bytes = readFileSync(diskPath);

    // sha256 check
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, asset.sha256, `hash mismatch for ${key}`);

    // byte count check
    assert.equal(bytes.byteLength, asset.bytes, `byte length mismatch for ${key}`);

    // Path must be inside quarantine store
    assert.ok(diskPath.startsWith(quarantineStore), `asset ${key} (${diskPath}) must be inside quarantine store`);

    // Path must NOT be inside repo tree
    assert.ok(!diskPath.startsWith(REPO_ROOT), `asset ${key} (${diskPath}) must not be inside repo tree`);
  }

  // capture.json exists next to assets
  const captureJsonPath = assetStoragePath('A5_black_box_reproduction', 'fixture-site/capture.json', { quarantineRoot: quarantineStore });
  assert.ok(existsSync(captureJsonPath), `expected capture.json at ${captureJsonPath}`);
  const storedCapture = JSON.parse(readFileSync(captureJsonPath, 'utf8'));
  assert.deepEqual(validateCapture(storedCapture), []);
  assert.equal(storedCapture.source.url, baseUrl);

  // 4. Assert repo tree was not written into
  const repoQuarantineData = join(REPO_ROOT, 'data/A5_black_box_reproduction');
  assert.ok(!existsSync(repoQuarantineData), 'repo data/A5_black_box_reproduction must not exist');
});

test('the real capture producer feeds its unmodified output into translation', async () => {
  const { server, baseUrl } = await createFixtureServer();
  const quarantineStore = setupTempQuarantineStore();
  try {
    // captureSite and recordFlow each own one browser and close it in their finally block.
    const capture = await captureSite({
      url: baseUrl,
      rightsRef: 'docs/provenance/assets/reproduction-studies.md',
      env: { ...process.env, MWG_TRAIN_QUARANTINE: quarantineStore },
      allowPrivate: true,
    });
    const flow = await recordFlow({
      url: baseUrl,
      rightsRef: 'docs/provenance/assets/reproduction-studies.md',
      steps: [
        { action: 'fill', target: 'input[name=user_email]', value: 'seam@example.test' },
        { action: 'select', target: 'select[name=account_type]', value: 'premium' },
        { action: 'submit', target: 'form#login-form' },
        { action: 'goto', expectText: 'seam@example.test' },
      ],
    });
    const spec = translateCapture({ capture, flow });
    assert.equal(spec.journey.formSelector, 'form#generated-form-1');
    assert.equal(flow.steps[1].value, 'premium', 'the recording retains the real selected value');
    assert.equal(spec.journey.select['select[name=field-2]'], 'Option 2 for field 2');
    assert.equal(spec.journey.steps.find((step) => step.submit)?.expectText, 'sample1@example.test');
    assert.equal(spec.journey.steps.some((step) => step.path === '/confirm'), false);
    assert.match(spec.persistence.read_route, /^\/page-\d+\/:ref$/);
    assert.equal(spec.routes.find((route) => route.kind === 'write').redirect, spec.persistence.read_route);
    assert.equal(spec.fields.some((field) => field.type === 'submit'), false);
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(quarantineStore, { recursive: true, force: true });
  }
});

test('captureSite refuses capture when rightsRef is missing or empty', async (t) => {
  const { server, baseUrl } = await createFixtureServer();
  const quarantineStore = setupTempQuarantineStore();

  t.after(() => {
    server.close();
    rmSync(quarantineStore, { recursive: true, force: true });
  });

  const env = { ...process.env, MWG_TRAIN_QUARANTINE: quarantineStore };

  await assert.rejects(
    () => captureSite({ url: baseUrl, rightsRef: '', env }),
    /--rights-ref is required/,
  );

  await assert.rejects(
    () => captureSite({ url: baseUrl, rightsRef: '   ', env }),
    /--rights-ref is required/,
  );

  await assert.rejects(
    () => captureSite({ url: baseUrl, env }),
    /--rights-ref is required/,
  );
});

test('captureSite refuses non-http(s) URLs', async (t) => {
  const quarantineStore = setupTempQuarantineStore();
  t.after(() => {
    rmSync(quarantineStore, { recursive: true, force: true });
  });

  const env = { ...process.env, MWG_TRAIN_QUARANTINE: quarantineStore };
  const rightsRef = 'docs/provenance/assets/reproduction-studies.md';

  await assert.rejects(
    () => captureSite({ url: 'ftp://127.0.0.1:3000', rightsRef, env }),
    /url must be an http\(s\) URL/,
  );

  await assert.rejects(
    () => captureSite({ url: 'http://127.0.0.1:3000/has space', rightsRef, env }),
    /url must be an http\(s\) URL/,
  );
});

test('refusal: if schema validator fails, refuse to write any assets to quarantine', async (t) => {
  const { server, baseUrl } = await createFixtureServer();
  const quarantineStore = setupTempQuarantineStore();

  t.after(() => {
    server.close();
    rmSync(quarantineStore, { recursive: true, force: true });
  });

  const env = { ...process.env, MWG_TRAIN_QUARANTINE: quarantineStore };
  const rightsRef = 'docs/provenance/assets/reproduction-studies.md';

  // Mutate capture to claim an unquarantined arm (A1) which fails schema validation
  await assert.rejects(
    () => captureSite({
      url: baseUrl,
      rightsRef,
      env,
      allowPrivate: true,
      outDir: 'refused-site',
      _mutateCapture: (c) => {
        c.source.arm = 'A1_self_generated';
      },
    }),
    /Capture validation failed/,
  );

  // Assert nothing was written to quarantine store under refused-site
  const refusedDir = join(quarantineStore, 'data/A5_black_box_reproduction/refused-site');
  assert.ok(!existsSync(refusedDir), 'no assets should be written when validation fails');
});

test('captureSite handles DOM edge cases (unnamed submit buttons, options in selects, deduplication)', async (t) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Edge Cases</title></head>
<body>
  <form action="/complex" method="post">
    <!-- Unnamed submit button -->
    <button type="submit">Submit Unnamed</button>
    <!-- Control with non-NAME_SAFE name should be omitted and reported -->
    <input type="text" name="user[email]" value="ignored">
    <!-- Control with unrenderable type range should be omitted and reported -->
    <button type="button" name="other">Not a submit</button>
    <button type="reset">Unnamed Reset</button>
    <input type="range" name="volume" min="0" max="100">
    <!-- Valid text input -->
    <input type="text" name="query" required>
    <!-- Select with options -->
    <select name="category">
      <option value="books">Books</option>
      <option value="music">Music</option>
    </select>
  </form>
</body>
</html>`);
  });

  const { port } = await new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      resolveServer(server.address());
    });
  });

  const quarantineStore = setupTempQuarantineStore();

  t.after(() => {
    server.close();
    rmSync(quarantineStore, { recursive: true, force: true });
  });

  const env = { ...process.env, MWG_TRAIN_QUARANTINE: quarantineStore };
  const warning = t.mock.method(console, 'warn', () => {});
  const capture = await captureSite({
    url: `http://127.0.0.1:${port}/`,
    rightsRef: 'docs/provenance/assets/reproduction-studies.md',
    env,
    allowPrivate: true,
    outDir: 'edge-cases',
    pages: ['/', '/'], // test deduplication
  });

  assert.deepEqual(validateCapture(capture), []);
  assert.equal(capture.pages.length, 1); // duplicate '/' deduplicated

  const form = capture.pages[0].forms[0];
  assert.equal(form.id, '');
  assert.ok(warning.mock.calls.some(({ arguments: args }) => /POST form at \/.*action: \/complex.*controls: submit, query, category.*has no id and cannot be clean-room translated/.test(args[0])));
  assert.equal(form.controls.length, 3);
  assert.deepEqual(capture.pages[0].dropped_controls, [
    { name: 'user[email]', type: 'text', reason: 'name is not NAME_SAFE' },
    { name: 'other', type: 'button', reason: 'unsupported control type' },
    { name: 'unnamed button', type: 'reset', reason: 'unsupported control type' },
    { name: 'volume', type: 'range', reason: 'unsupported control type' },
  ]);
  for (const dropped of capture.pages[0].dropped_controls) {
    assert.ok(warning.mock.calls.some(({ arguments: args }) => args[0].includes(dropped.name) && args[0].includes(dropped.type) && args[0].includes(dropped.reason)), `missing run warning for ${dropped.name}`);
  }
  assert.deepEqual(JSON.parse(readFileSync(capture.capturePath, 'utf8')).pages[0].dropped_controls, capture.pages[0].dropped_controls);
  // Unnamed submit button became 'submit'
  assert.equal(form.controls[0].name, 'submit');
  assert.equal(form.controls[0].type, 'submit');
  // user[email] and volume were filtered out, query remains
  assert.equal(form.controls[1].name, 'query');
  assert.equal(form.controls[1].type, 'text');
  // category select remains with its options
  assert.equal(form.controls[2].name, 'category');
  assert.equal(form.controls[2].type, 'select');
  assert.deepEqual(form.controls[2].options, ['books', 'music']);
});

test('CLI: scripts/capture-site.mjs executes and validates correctly', async (t) => {
  const { server, baseUrl } = await createFixtureServer();
  const quarantineStore = setupTempQuarantineStore();
  const scriptPath = resolve(REPO_ROOT, 'scripts/capture-site.mjs');

  t.after(() => {
    server.close();
    rmSync(quarantineStore, { recursive: true, force: true });
  });

  const env = { ...process.env, MWG_TRAIN_QUARANTINE: quarantineStore };

  function runCli(args) {
    return new Promise((resolveRun, rejectRun) => {
      const cp = spawn('node', [scriptPath, ...args], {
        env,
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      cp.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      cp.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      cp.on('error', rejectRun);
      cp.on('close', (code) => {
        resolveRun({ code, stdout, stderr });
      });
    });
  }

  // 1. Missing --rights-ref exits non-zero with message
  const missingRights = await runCli(['--url', baseUrl]);
  assert.equal(missingRights.code, 1);
  assert.match(missingRights.stderr, /--rights-ref is required/);

  // 2. Non-http URL exits non-zero with message
  const invalidUrl = await runCli(['--url', 'file:///etc/passwd', '--rights-ref', 'docs/ref.md']);
  assert.equal(invalidUrl.code, 1);
  assert.match(invalidUrl.stderr, /--url must be an http\(s\) URL/);

  // 3. Successful execution with --url, --rights-ref, --pages, --out
  const success = await runCli([
    '--url', baseUrl,
    '--rights-ref', 'docs/provenance/assets/reproduction-studies.md',
    '--pages', '/about',
    '--out', 'cli-captured-site',
    '--allow-private',
  ]);

  assert.equal(success.code, 0, `CLI failed with stderr: ${success.stderr}`);
  assert.match(success.stdout, /Successfully captured/);

  // Verify assets on disk in quarantine store
  const cliCaptureJson = assetStoragePath('A5_black_box_reproduction', 'cli-captured-site/capture.json', { quarantineRoot: quarantineStore });
  assert.ok(existsSync(cliCaptureJson));
  for (const file of ['desktop.png', 'mobile.png', 'dom.html']) {
    assert.ok(existsSync(join(quarantineStore, 'data/A5_black_box_reproduction/cli-captured-site', file)));
    assert.ok(!existsSync(join(REPO_ROOT, file)));
  }
  assert.ok(!existsSync(join(REPO_ROOT, 'data/A5_black_box_reproduction/cli-captured-site')));
  const written = JSON.parse(readFileSync(cliCaptureJson, 'utf8'));
  assert.deepEqual(validateCapture(written), []);
  assert.equal(written.pages.length, 2);
  assert.equal(written.pages[0].path, '/');
  assert.equal(written.pages[1].path, '/about');

  const rejected = join(REPO_ROOT, 'data/capture-site-refused');
  const refusal = await runCli(['--url', baseUrl, '--rights-ref', 'docs/ref.md', '--out', rejected, '--allow-private']);
  assert.notEqual(refusal.code, 0);
  assert.match(refusal.stderr, /refus|repo tree/i);
  assert.ok(refusal.stderr.includes(rejected));
  assert.ok(!existsSync(rejected));
  assert.ok(!existsSync(join(quarantineStore, 'data/A5_black_box_reproduction', rejected.slice(1))));
});

test('a capture refuses a loopback destination unless the caller asks for a private target', async (t) => {
  // The property this change exists for (mwg-train-3pqm): the URL a capture is given comes from outside, and without a
  // restriction it can name the host's own services, the private network behind it, or a cloud metadata endpoint.
  const root = mkdtempSync(join(tmpdir(), 'capture-ssrf-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const server = http.createServer((_request, response) => response.end('<html><body>should not be reached</body></html>'));
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const loopback = `http://127.0.0.1:${server.address().port}/`;
  const env = { ...process.env, MWG_TRAIN_QUARANTINE: root };

  const refused = await captureSite({ url: loopback, rightsRef: 'docs/provenance/assets/reproduction-studies.md', env, outDir: 'refused-private' })
    .then(() => null, (error) => error);
  assert.equal(refused?.name, 'CaptureTargetError', 'a private destination must be refused');
  assert.equal(refused?.code, 'PRIVATE_TARGET');
  assert.match(refused.message, /--allow-private/, 'the refusal must name the way out');
  assert.ok(!existsSync(join(root, 'data')), 'nothing may be written for a refused destination');

  // The metadata address, a private range and IPv6 loopback are refused for the same reason, with no server behind them.
  for (const target of ['http://169.254.169.254/latest/meta-data/', 'http://10.1.2.3/', 'http://[::1]:8080/']) {
    await assert.rejects(
      () => captureSite({ url: target, rightsRef: 'docs/provenance/assets/reproduction-studies.md', env, outDir: 'refused-private' }),
      (error) => error.code === 'PRIVATE_TARGET',
      `${target} must be refused`,
    );
  }
});

test('the target check refuses what a capture must not reach, and admits what it may', async () => {
  // Addresses are judged after URL normalisation, so the alternative spellings of loopback are covered without
  // enumerating them by hand: 2130706433, 0x7f000001 and 127.1 all arrive at the check as 127.0.0.1 (measured).
  const publicAnswer = { lookup: async () => [{ address: '93.184.216.34' }] };
  const blocked = [
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://localhost/',
    'http://localhost./',
    'http://api.localhost/',
    'http://0.0.0.0/',
    'http://169.254.169.254/latest/meta-data/',
    'http://169.254.0.1/',
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://172.31.255.254/',
    'http://192.168.1.1/',
    'http://100.64.0.1/',
    'http://198.18.0.1/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[64:ff9b::10.0.0.1]/',
  ];
  for (const target of blocked) {
    await assert.rejects(
      () => assertCaptureTarget(target, publicAnswer),
      (error) => error.code === 'PRIVATE_TARGET',
      `${target} must be refused`,
    );
  }
  const allowed = [
    'http://93.184.216.34/',
    'http://example.com/',
    'https://example.com/path?q=1',
    'http://[2606:2800:220:1:248:1893:25c8:1946]/',
    'http://[::ffff:8.8.8.8]/', // IPv4-mapped IPv6 is judged by the IPv4 destination it carries
  ];
  for (const target of allowed) {
    assert.equal(await assertCaptureTarget(target, publicAnswer), new URL(target).href, `${target} must be allowed`);
  }
  // A public-looking name that resolves to a private address is refused, and one private answer among public ones is
  // enough: the browser could take any of them, so the whole answer set has to be public.
  await assert.rejects(
    () => assertCaptureTarget('http://internal.example/', { lookup: async () => [{ address: '10.0.0.5' }, { address: '93.184.216.34' }] }),
    (error) => error.code === 'PRIVATE_TARGET' && /10\.0\.0\.5/.test(error.message),
  );
  // A name that cannot be resolved is not a target: fail closed rather than let the browser try.
  await assert.rejects(
    () => assertCaptureTarget('http://does-not-resolve.invalid/', { lookup: async () => { throw new Error('ENOTFOUND'); } }),
    (error) => error.code === 'UNRESOLVABLE',
  );
  // The explicit opt-in admits a private destination - how this suite captures the server it started itself.
  assert.equal(await assertCaptureTarget('http://127.0.0.1:3000/', { allowPrivate: true }), 'http://127.0.0.1:3000/');
});

test('CLI: a private --url is refused without --allow-private', async (t) => {
  const scriptPath = resolve(REPO_ROOT, 'scripts/capture-site.mjs');
  const server = http.createServer((_request, response) => response.end('<html><body>local</body></html>'));
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const loopback = `http://127.0.0.1:${server.address().port}/`;
  const run = (args) => new Promise((resolveRun) => {
    execFile('node', [scriptPath, ...args], { cwd: REPO_ROOT, env: { ...process.env } }, (error, stdout, stderr) => {
      resolveRun({ code: error?.code ?? 0, stdout, stderr });
    });
  });

  const refused = await run(['--url', loopback, '--rights-ref', 'docs/ref.md']);
  assert.notEqual(refused.code, 0, 'a private URL must fail without the flag');
  assert.match(refused.stderr, /non-public address/);
  assert.match(refused.stderr, /--allow-private/);
});

test('a redirect to a private destination is blocked before the browser sends it', async (t) => {
  // mwg-train-zpjt: checking the landing URL after the navigation is checking a request Chrome has already sent. The
  // measurement that matters is not the error - it is whether the server ever saw the redirected request.
  const root = mkdtempSync(join(tmpdir(), 'capture-redirect-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hits = [];
  const server = http.createServer((request, response) => {
    hits.push(request.url);
    if (request.url === '/') {
      response.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/private` });
      response.end();
      return;
    }
    response.end('<html><body>should not be reached</body></html>');
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const port = server.address().port;

  // The target must be judged public for the capture to start - that is what the injected resolver states - while
  // the browser is told where the name actually lives. So the page is reachable, the policy is in force, and the
  // redirect is the only thing standing between them.
  const refused = await captureSite({
    url: `http://public.test:${port}/`,
    rightsRef: 'docs/provenance/assets/reproduction-studies.md',
    env: { ...process.env, MWG_TRAIN_QUARANTINE: root },
    outDir: 'redirected-private',
    _lookup: async () => [{ address: '93.184.216.34' }],
    _chromeArgs: ['--host-resolver-rules=MAP public.test 127.0.0.1'],
  }).then(() => null, (error) => error);

  assert.equal(refused?.code, 'PRIVATE_TARGET', `the capture must refuse the redirect, got: ${refused?.message}`);
  assert.match(refused.message, /blocked before it was sent/);
  assert.deepEqual(hits, ['/'], 'the redirected request must never reach the server');
  assert.ok(!existsSync(join(root, 'data')), 'nothing may be written for a refused capture');
});

test("the request interception decides before Chrome sends, and leaves the browser own resolution alone", async () => {
  // The interceptor is a CDP client, so its decisions are asserted against a page stub that records the calls: what
  // is checked here is that a private destination is FAILED and everything else is CONTINUED, because a paused
  // request that is never answered hangs the page.
  const calls = [];
  const handlers = new Map();
  const stubPage = {
    sessionId: 'page-1',
    session: { connection: { on: (event, handler) => handlers.set(event, handler) } },
    send: async (method, params) => { calls.push([method, params]); },
  };
  const guard = await installTargetGuard(stubPage, { lookup: async () => [{ address: '93.184.216.34' }] });
  assert.equal(calls[0][0], 'Fetch.enable', 'interception must be enabled before anything navigates');

  const paused = (url, requestId) => handlers.get('Fetch.requestPaused')({ requestId, request: { url } }, 'page-1');
  const settle = () => new Promise((resolveTick) => setTimeout(resolveTick, 5));

  calls.length = 0;
  await paused('http://127.0.0.1:8080/private', 'r1');
  await settle();
  assert.deepEqual(calls.at(-1), ['Fetch.failRequest', { requestId: 'r1', errorReason: 'AccessDenied' }]);
  assert.equal(guard.blocked.length, 1);
  assert.match(guard.refusal().message, /blocked before it was sent/);

  calls.length = 0;
  await paused('https://example.com/asset.css', 'r2');
  await settle();
  assert.deepEqual(calls.at(-1), ['Fetch.continueRequest', { requestId: 'r2' }]);

  // A name this process cannot resolve is left to the browser: its resolver is not always ours (a host-resolver-rules
  // flag, a proxy, a hosts entry), and failing it would break legitimate pages.
  calls.length = 0;
  await paused('http://browser-only.test/x', 'r3');
  await settle();
  assert.deepEqual(calls.at(-1), ['Fetch.continueRequest', { requestId: 'r3' }]);

  // Another page's requests are not this page's business.
  calls.length = 0;
  handlers.get('Fetch.requestPaused')({ requestId: 'r4', request: { url: 'http://127.0.0.1/x' } }, 'other-page');
  await settle();
  assert.deepEqual(calls, [], 'another session\'s requests must be left alone');

  calls.length = 0;
  await guard.stop();
  assert.equal(calls.at(-1)[0], 'Fetch.disable');

  // And the verdict function itself: an address literal is decided without a lookup, and a metadata address is
  // refused the same way a loopback one is.
  assert.deepEqual(await interceptionVerdict('http://169.254.169.254/latest/meta-data/', { lookup: async () => [] }), ['169.254.169.254']);
  assert.deepEqual(await interceptionVerdict('http://10.0.0.9/', { lookup: async () => [] }), ['10.0.0.9']);
  assert.deepEqual(await interceptionVerdict('http://example.com/', { lookup: async () => [{ address: '93.184.216.34' }] }), []);
});
