import { extractRoutes } from '../scripts/check-pilot-served.mjs';
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runCheck(cwd) {
  const p = spawnSync('node', [join(cwd, 'scripts/check-pilot-served.mjs')], { cwd, encoding: 'utf8' });
  return { status: p.status, stdout: p.stdout, stderr: p.stderr };
}

test('mutations on static check-pilot-served', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'mwg-pilot-test-'));
  // Set up pilot/projects structure
  const pilotDir = join(tmp, 'pilot', 'projects');
  mkdirSync(pilotDir, { recursive: true });
  
  const proj1 = join(pilotDir, 'test-proj');
  mkdirSync(proj1);

  // We need to overwrite the PILOT_PROJECTS_DIR somehow, OR run a test that mocks it.
  // The script `check-pilot-served.mjs` hardcodes `PILOT_PROJECTS_DIR = join(REPO_ROOT, 'pilot', 'projects')`.
  // So if we make a full fake repo root, it will test that!
  
  // Make a complete fake repo
  mkdirSync(join(tmp, 'scripts'));
  // read the actual script and rewrite PILOT_PROJECTS_DIR
  let scriptCode = readFileSync(join(process.cwd(), 'scripts/check-pilot-served.mjs'), 'utf8');
  scriptCode = scriptCode.replace(
    /const PILOT_PROJECTS_DIR = join\(REPO_ROOT, 'pilot', 'projects'\);/,
    `const PILOT_PROJECTS_DIR = '${pilotDir}';`
  );
  writeFileSync(join(tmp, 'scripts', 'check-pilot-served.mjs'), scriptCode);
  
  // Matching project passes
  writeFileSync(join(proj1, 'spec.json'), JSON.stringify({
    project_id: "test-proj",
    routes: [ { method: "GET", path: "/" } ]
  }));
  writeFileSync(join(proj1, 'server.mjs'), `app.get('/', () => {});`);
  
  let res = runCheck(tmp);
  assert.strictEqual(res.status, 0, 'Matching project should pass');
  assert.match(res.stdout, /OK/);

  // declared-but-not-served mismatch reported
  writeFileSync(join(proj1, 'spec.json'), JSON.stringify({
    project_id: "test-proj",
    routes: [ { method: "GET", path: "/" }, { method: "POST", path: "/missing" } ]
  }));
  res = runCheck(tmp);
  if (res.status !== 1) console.log(res);
  assert.strictEqual(res.status, 1, 'declared-but-not-served should fail');
  assert.match(res.stdout, /\[test-proj\] declared but not served: POST \/missing/);

  // Restore
  writeFileSync(join(proj1, 'spec.json'), JSON.stringify({
    project_id: "test-proj",
    routes: [ { method: "GET", path: "/" } ]
  }));

  // served-but-not-declared mismatch reported
  writeFileSync(join(proj1, 'server.mjs'), `
    app.get('/', () => {});
    app.get('/extra', () => {});
  `);
  res = runCheck(tmp);
  assert.strictEqual(res.status, 1, 'served-but-not-declared should fail');
  assert.match(res.stdout, /\[test-proj\] served but not declared: GET \/extra/);

  // Restore
  writeFileSync(join(proj1, 'server.mjs'), `app.get('/', () => {});`);

  // Unrecorded mismatch fails rather than being absorbed by the exception list
  // If we serve /search on test-proj, it should fail since test-proj has no exception!
  writeFileSync(join(proj1, 'server.mjs'), `
    app.get('/', () => {});
    app.get('/search', () => {});
  `);
  res = runCheck(tmp);
  assert.strictEqual(res.status, 1, 'unrecorded mismatch fails');
  assert.match(res.stdout, /\[test-proj\] served but not declared: GET \/search/);

  // Restore
  writeFileSync(join(proj1, 'server.mjs'), `app.get('/', () => {});`);

  // Quote variations
  const variations = [
    { name: "single", quotes: "'", ws: "" },
    { name: "double", quotes: '"', ws: "" },
    { name: "backtick", quotes: '`', ws: "" },
    { name: "single_ws", quotes: "'", ws: "  " },
    { name: "double_ws", quotes: '"', ws: "  " },
    { name: "backtick_ws", quotes: '`', ws: "  " }
  ];

  for (const { name, quotes, ws } of variations) {
    writeFileSync(join(proj1, 'spec.json'), JSON.stringify({
      project_id: "test-proj",
      routes: [ { method: "GET", path: "/test" } ]
    }));
    
    // Test that the route is recognized properly (success)
    writeFileSync(join(proj1, 'server.mjs'), `app.get(${ws}${quotes}/test${quotes}${ws}, () => {});`);
    res = runCheck(tmp);
    if (res.status !== 0) console.log(`Expected variation ${name} to pass:`, res.stdout);
    assert.strictEqual(res.status, 0, `Variation ${name} should pass`);
    
    // Break the recognition (mutation): unparseable route string format
    // Because we just added the unparsed guard, an unparseable route like `app.get(path, () => {})`
    // will be caught by the route-like block detector and fail! Let's mutate by making it completely unparseable
    // by the route extractor but matching the route-like detector.
    // e.g. `app.get('/test' + suffix)`
    writeFileSync(join(proj1, 'server.mjs'), `app.get(pathVar, () => {});`);
    res = runCheck(tmp);
    if (res.status !== 1) console.log(`Expected variation ${name} unparsed mutation to fail:`, res);
    assert.strictEqual(res.status, 1, `Mutation ${name} should fail`);
    assert.match(res.stdout, /\[test-proj\] Unparsed route-like block:/);
    
    // Break the recognition by using mismatched quotes or missing quotes
    // Wait, if we use \`app.get('/test", () => {})\`, the regex doesn't match it because of mismatched quotes.
    // The route-like block detector WILL match it because it starts with app.get(
    writeFileSync(join(proj1, 'server.mjs'), `app.get(${quotes}/test${quotes === "'" ? '"' : "'"}, () => {});`);
    res = runCheck(tmp);
    assert.strictEqual(res.status, 1, `Broken variation ${name} should fail`);
    assert.match(res.stdout, /\[test-proj\] Unparsed route-like block:/);
    
    // Restore
    writeFileSync(join(proj1, 'server.mjs'), `app.get('/', () => {});`);
  }

  // Fixture for the new guard: route-looking text in an unrecognised shape
  writeFileSync(join(proj1, 'spec.json'), JSON.stringify({
    project_id: "test-proj",
    routes: [ { method: "GET", path: "/" } ]
  }));
  writeFileSync(join(proj1, 'server.mjs'), `
    app.get('/', () => {});
    function dynamicRoute(r) { app.post(r, () => {}); }
  `);
  res = runCheck(tmp);
  assert.strictEqual(res.status, 1, 'Unparsed route-like block should fail');
  assert.match(res.stdout, /\[test-proj\] Unparsed route-like block: .*app\.post\(r/);

  // Restore
  writeFileSync(join(proj1, 'server.mjs'), `app.get('/', () => {});`);

  // Staleness rule fails when an excused route becomes served.
  // We'll mimic an existing project that has an exception.
  const proj2 = join(pilotDir, 'account-recovery-hono');
  mkdirSync(proj2);
  // exception: { project: "account-recovery-hono", route: "POST /reset", direction: "declared_not_served" }
  writeFileSync(join(proj2, 'spec.json'), JSON.stringify({
    project_id: "account-recovery-hono",
    routes: [ { method: "POST", path: "/reset" }, { method: "GET", path: "/" } ]
  }));
  
  // If not served, it passes (exception excuses it)
  writeFileSync(join(proj2, 'server.mjs'), `app.get('/', () => {});`);
  // Note: we still have test-proj which is matching.
  // Wait, the exceptions list has LOTS of things for account-recovery-hono!
  // If we don't serve those other things, they will be reported as stale exceptions!
  // Ah! Because check-pilot-served loops over ALL EXCEPTIONS and if one isn't used, it fails.
  // So to pass, we must either mock EXCEPTIONS in the script, OR satisfy all exceptions!
  // Let's modify the script in tmp to only have one exception for testing.
  let scriptCode2 = scriptCode.replace(
    /const EXCEPTIONS = \[[\s\S]*?\];/,
    `const EXCEPTIONS = [ { project: "account-recovery-hono", route: "POST /reset", direction: "declared_not_served", reason: "test" } ];`
  );
  writeFileSync(join(tmp, 'scripts', 'check-pilot-served.mjs'), scriptCode2);

  // Now, account-recovery-hono doesn't serve POST /reset, so exception is used.
  // It shouldn't fail on staleness.
  res = runCheck(tmp);
  if (res.status !== 0) console.log('Exception should excuse mismatch failed:', res);
  assert.strictEqual(res.status, 0, 'Exception should excuse the mismatch');

  // Mutation: we now SERVE the route. The exception becomes stale!
  writeFileSync(join(proj2, 'server.mjs'), `
    app.post('/reset', () => {});
    app.get('/', () => {});
  `);
  res = runCheck(tmp);
  assert.strictEqual(res.status, 1, 'Stale exception should fail');
  assert.match(res.stdout, /\[account-recovery-hono\] Stale exception: declared_not_served for POST \/reset/);

  rmSync(tmp, { recursive: true, force: true });
});

// A matched span must not swallow the evidence the residual scan exists to find. The var-bound
// patterns originally used a multi-line lazy wildcard, so anything between the assignment and its use
// was scrubbed before the residual scan ran - a shape could be matched and an unparsed route erased in
// the same replacement, leaving the check silently blind (found by review of the mdj branch and
// reproduced with this exact text). Constraining the span to adjacent whitespace makes a non-adjacent
// use surface as an unparsed block instead: loud rather than silent.
test('a matched span does not swallow unparsed routes between an assignment and its use', () => {
  const code = [
    "const myRoute = '/hello';",
    'app.get(dynamicVar, () => {});',
    'app.post(anotherVar, () => {});',
    'if (path.startsWith(prefixVar)) {}',
    'app.get(myRoute, () => {});',
  ].join('\n');
  const result = extractRoutes(code);
  assert.ok(
    (result.unparsed ?? []).length > 0,
    'intervening unparsed route-like constructs must be reported, not scrubbed away'
  );
});

// The raw var-bound pattern used to carry a [\s\S]{0,200}? wildcard, so a single replacement could
// match a legitimate three-statement route AND scrub an unrelated unparsed route sitting between the
// assignment and its method check. The check then reported served [] and unparsed [] - blind, in exactly
// the direction its fail-closed guard exists to cover. Anchoring the pattern to the real emission shape
// means the intervening construct is left in the residue and reported.
test('the raw var-bound pattern does not scrub an unparsed route between the assignment and its use', () => {
  const code = [
    "const readRoute = '/reset/:ref';",
    'app.get(dynamicVar, () => {});',
    "if (request.method === 'GET') {}",
  ].join('\n');
  const result = extractRoutes(code);
  const unparsed = result.unparsed ?? [];
  assert.ok(
    unparsed.length > 0,
    'an unparsed route between the assignment and the method check must be reported, not scrubbed away'
  );
});

// Every extractor emits from capture groups, and the original attempt to tighten this pattern inserted
// one extra group - which silently moved the method out of the index the code read, so every raw arm
// emitted a quote character as its method and a committed project's real route became a phantom stale
// exception. The groups are now named, and this covers every emission form at once: a pattern whose
// groups shift, or whose capture order changes, fails here instead of on the corpus at merge time.
test('every extraction form emits the route and method it found, not a shifted capture group', () => {
  const forms = [
    ['hono literal', "app.get('/a', () => {});", ['GET /a']],
    ['hono var-bound', "const p = '/b';\napp.post(p, () => {});", ['POST /b']],
    ['hono loop', "for (const p of ['/c', '/d']) {\n  app.get(p, () => {});\n}", ['GET /c', 'GET /d']],
    ['raw equality', "if (path === '/e') {}", ['GET /e']],
    ['raw equality with method', "if (path === '/f' && request.method === 'POST') {}", ['POST /f']],
    [
      'raw var-bound',
      ['const r = "/g/:ref";', "const m = path.match(new RegExp('^' + r + '$'));", "if (m && request.method === 'DELETE'"].join('\n'),
      ['DELETE /g/:ref'],
    ],
    ['array includes', "if (['/h'].includes(path) && request.method === 'PUT') {}", ['PUT /h']],
    ['startsWith', "if (path.startsWith('/i/') && request.method === 'PATCH') {}", ['PATCH /i/']],
  ];
  for (const [label, code, expected] of forms) {
    const served = extractRoutes(code).served;
    const actual = (Array.isArray(served) ? served : [...served]).sort();
    assert.deepStrictEqual(actual, expected.slice().sort(), `${label}: wrong route emitted`);
  }
});

// Tightening rawVarsBetter closed a silent hole and opened a smaller one, which the review caught.
// The old wildcard matched a path.match route whatever the shape, so a construction like a swapped
// condition order was at least extracted. The anchored pattern deliberately does not cover it, and
// because path.match( was not a route-like token, the residual scan did not report it either - so a
// served route went from mis-extracted to silently ignored, which is worse. The residual scan has to
// see the shapes the anchored pattern does not cover.
test('a path.match route the anchored pattern does not cover is reported, not ignored', () => {
  const code = [
    'const readRoute = "/j/:ref";',
    "const readMatch = path.match(new RegExp('^' + readRoute + '$'));",
    "if (request.method === 'GET' && readMatch) {}",
  ].join('\n');
  assert.ok(
    (extractRoutes(code).unparsed ?? []).length > 0,
    'an unrecognised path.match route must be reported as an unparsed block'
  );
});

// The non-goals documented at extractRoutes are real, and so is the parity between the families the
// extractors recognise and the sentinels the residual scan reports. Each case below is a shape a human
// reads as a route that the extraction patterns deliberately do not cover, and the residual scan must
// report all of them - otherwise a family can be added without its sentinel, which is exactly how the
// path.match case came to be silently dropped.
// Measured, not assumed: the equality family is NOT in this list. Its sentinel deliberately requires a
// quoted literal so it does not fire on non-route boilerplate like `path === EXTRA_ACTION`, which means
// `path === routeVar` is invisible. That is recorded as a non-goal in the source rather than asserted
// here, because asserting it would pin a gap that should be closed if the generator ever emits it.
test('every route family the extractors recognise has a residual sentinel that reports what they cannot parse', () => {
  const cases = [
    ['app registration', 'app.get(pathVar, () => {});'],
    ['array includes', 'if (routeList.includes(path)) {}'],
    ['startsWith', 'if (path.startsWith(prefixVar)) {}'],
    ['path.match', 'const m = path.match(unknownPattern);'],
  ];
  for (const [label, code] of cases) {
    assert.ok(
      (extractRoutes(code).unparsed ?? []).length > 0,
      `${label}: a shape the extractors cannot parse must be reported, not ignored`
    );
  }
});
