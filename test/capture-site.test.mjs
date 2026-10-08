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
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { captureSite } from '../src/capture/site.mjs';
import { validateCapture } from '../src/capture/schema.mjs';
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
    <form action="/login" method="post">
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
    <!-- Control with non-NAME_SAFE name should be omitted -->
    <input type="text" name="user[email]" value="ignored">
    <!-- Control with unrenderable type range should be omitted -->
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
  const capture = await captureSite({
    url: `http://127.0.0.1:${port}/`,
    rightsRef: 'docs/provenance/assets/reproduction-studies.md',
    env,
    outDir: 'edge-cases',
    pages: ['/', '/'], // test deduplication
  });

  assert.deepEqual(validateCapture(capture), []);
  assert.equal(capture.pages.length, 1); // duplicate '/' deduplicated

  const form = capture.pages[0].forms[0];
  assert.equal(form.controls.length, 3);
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
  ]);

  assert.equal(success.code, 0, `CLI failed with stderr: ${success.stderr}`);
  assert.match(success.stdout, /Successfully captured/);

  // Verify assets on disk in quarantine store
  const cliCaptureJson = assetStoragePath('A5_black_box_reproduction', 'cli-captured-site/capture.json', { quarantineRoot: quarantineStore });
  assert.ok(existsSync(cliCaptureJson));
  const written = JSON.parse(readFileSync(cliCaptureJson, 'utf8'));
  assert.deepEqual(validateCapture(written), []);
  assert.equal(written.pages.length, 2);
  assert.equal(written.pages[0].path, '/');
  assert.equal(written.pages[1].path, '/about');
});
