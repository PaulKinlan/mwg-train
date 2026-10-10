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
