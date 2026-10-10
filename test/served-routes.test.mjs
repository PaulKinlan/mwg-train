// mwg-train-xku. `check:served-routes` printed "MEASURED - 0/0 declared route(s) served across 7 project(s)
// (0 not served)" and exited 0 in a tree where every project failed: it reported a measurement it had not
// made, and it could not fail. These tests pin the verdict policy, and then drive the real CLI end to end
// through all three outcomes - none of which starts a server, so the whole file is cheap.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_BASELINE_JSON,
  DEFAULT_SERVED_MD,
  evaluateServedGap,
  extractUnservedRoutes,
} from '../scripts/check-served-gap.mjs';
import { runVerdict } from '../scripts/check-served-routes.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'check-served-routes.mjs');
const GAP_SCRIPT = join(ROOT, 'scripts', 'check-served-gap.mjs');

// A tree with the script and the corpus but NO generated projects: the state of a clean checkout, where
// pilot/training-projects (gitignored) has never been scaffolded. The corpus is symlinked so the only thing
// missing is the generated input, which is exactly the distinction under test.
function bareTree() {
  const dir = mkdtempSync(join(tmpdir(), 'xku-bare-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'pilot'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'train', 'briefs'), { recursive: true });
  // COPIED, not symlinked: the script resolves its repo root from its own file location, so a symlink would
  // make it look for the corpus and the projects in the real checkout instead of this fixture.
  copyFileSync(SCRIPT, join(dir, 'scripts', 'check-served-routes.mjs'));
  symlinkSync(join(ROOT, 'pilot', 'TRAINING_CORPUS.json'), join(dir, 'pilot', 'TRAINING_CORPUS.json'));
  symlinkSync(join(ROOT, 'docs', 'train', 'briefs', 'manifest.jsonl'), join(dir, 'docs', 'train', 'briefs', 'manifest.jsonl'));
  return dir;
}

function runCli(cwd, args = []) {
  try {
    const stdout = execFileSync(process.execPath, [join(cwd, 'scripts', 'check-served-routes.mjs'), ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function runNode(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('importing the module does not run the CLI, even when CLI arguments are present', () => {
  // The guard compares argv[1] against this module's own path; get that wrong and importing it runs the CLI.
  // Driven through a real file WITH real arguments, because under `node -e` there is no argv[1] for the
  // guard to mismatch and the test would pass even with no guard at all. This is also what keeps the skip
  // case from becoming a silent no-op: a wrong guard exits 0 having done nothing, which for a check is
  // indistinguishable from passing.
  const dir = mkdtempSync(join(tmpdir(), 'xku-import-'));
  const probe = join(dir, 'probe.mjs');
  writeFileSync(
    probe,
    `import { runVerdict } from ${JSON.stringify(SCRIPT)};\nconsole.log('IMPORT-SENTINEL', typeof runVerdict);\n`,
  );
  try {
    const result = runNode([probe, '--projects', '/definitely-not-a-projects-dir'], dir);
    assert.match(result.stdout, /IMPORT-SENTINEL function/, 'the import must succeed and export runVerdict');
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /FATAL|SKIPPED|MEASURED/,
      'importing must not run the CLI, and --projects here would make a run print FATAL immediately',
    );
    assert.equal(result.code, 0, `an import must not fail: ${result.stdout}${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a run that could not measure does not count as a measurement', () => {
  // The whole defect in one assertion: an unmeasurable project is a FAILURE, not a pass.
  assert.equal(runVerdict({ unmeasuredProjects: ['tr-01-hono'] }).status, 'FAIL');
  assert.equal(runVerdict({ unmeasuredProjects: ['tr-01-hono'] }).code, 1);
  // A route probe that errored is also not a measurement.
  assert.equal(runVerdict({ totalErrors: 3 }).status, 'FAIL');
  assert.equal(runVerdict({ totalErrors: 3 }).code, 1);
});

test('the absent default path skips but the absent NAMED path is fatal', () => {
  // These two must never collapse into one another: a clean checkout legitimately lacks the generated
  // projects, while a path the caller typed must not be silently treated as absent-by-design.
  const skipped = runVerdict({ projectsRootExists: false, projectsRootNamed: false });
  assert.deepEqual(skipped, { status: 'SKIPPED', code: 0 });
  const fatal = runVerdict({ projectsRootExists: false, projectsRootNamed: true });
  assert.deepEqual(fatal, { status: 'FATAL', code: 2 });
  assert.notEqual(skipped.status, fatal.status);
  assert.notEqual(skipped.code, fatal.code);
});

test('routes that were measured and not served stay reported, and gate only under --expect-all', () => {
  // The documented gap this tool exists to measure. Making it fatal by default would be red on every
  // scaffolded tree for a divergence the script's own header describes as expected.
  assert.equal(runVerdict({ totalNotServed: 8 }).status, 'MEASURED');
  assert.equal(runVerdict({ totalNotServed: 8 }).code, 0);
  assert.equal(runVerdict({ totalNotServed: 8, expectAll: true }).status, 'FAIL');
  assert.equal(runVerdict({ totalNotServed: 8, expectAll: true }).code, 1);
});

test('a clean measured run passes, and the statuses are all reachable', () => {
  assert.deepEqual(runVerdict({ totalNotServed: 0 }), { status: 'MEASURED', code: 0 });
  // Non-vacuity: every status this policy can return is produced by something above or here, so no branch
  // is dead code that a mutation could quietly remove.
  const reachable = new Set([
    runVerdict({ projectsRootExists: false }).status,
    runVerdict({ projectsRootExists: false, projectsRootNamed: true }).status,
    runVerdict({ unmeasuredProjects: ['a'] }).status,
    runVerdict({ totalNotServed: 1, expectAll: true }).status,
    runVerdict({}).status,
  ]);
  assert.deepEqual([...reachable].sort(), ['FAIL', 'FATAL', 'MEASURED', 'SKIPPED']);
});

test('end to end: a tree without the generated projects SKIPS, and says so', () => {
  const dir = bareTree();
  try {
    const result = runCli(dir);
    assert.equal(result.code, 0, `expected the skip to exit 0, got ${result.code}: ${result.stdout}${result.stderr}`);
    const out = result.stdout + result.stderr;
    assert.match(out, /SKIPPED/, 'the run must say it skipped');
    // The old wording claimed a measurement over zero probes. It must not come back.
    assert.doesNotMatch(out, /MEASURED/, 'a skipped run must not report itself as a measurement');
    assert.match(out, /npm run pilot:scaffold/, 'a skip must name the command that produces the input');
    assert.match(out, /NOT a served-routes result/, 'a skip must not be mistakable for a result');

    // Invoked through a symlink, the CLI must still RUN. A guard that concludes "this was an import" exits 0
    // having done nothing, which for a check is indistinguishable from passing.
    const link = join(dir, 'linked-check.mjs');
    symlinkSync(join(dir, 'scripts', 'check-served-routes.mjs'), link);
    const viaLink = execFileSync(process.execPath, [link], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    assert.match(viaLink, /SKIPPED/, 'the CLI must still run when invoked through a symlink, not exit 0 silently');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('end to end: a NAMED projects path that does not exist is fatal, not a skip', () => {
  const dir = bareTree();
  try {
    const result = runCli(dir, ['--projects', join(dir, 'no-such-projects-dir')]);
    assert.equal(result.code, 2, `expected exit 2, got ${result.code}: ${result.stdout}${result.stderr}`);
    const out = result.stdout + result.stderr;
    assert.match(out, /FATAL/);
    assert.doesNotMatch(out, /SKIPPED/, 'a typo must not look like a clean skip');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('end to end: an empty projects directory fails, and never reports MEASURED', () => {
  // The negative control for the original defect, without starting a single server: the root exists, so the
  // run proceeds, and every selected project turns out to be unmeasurable. Before the fix this was exactly
  // the "MEASURED - 0/0 ... exit 0" case.
  const dir = bareTree();
  const emptyProjects = join(dir, 'empty-projects');
  mkdirSync(emptyProjects, { recursive: true });
  writeFileSync(join(emptyProjects, '.keep'), '');
  try {
    const result = runCli(dir, ['--projects', emptyProjects]);
    assert.equal(result.code, 1, `expected exit 1, got ${result.code}: ${result.stdout}${result.stderr}`);
    const out = result.stdout + result.stderr;
    assert.match(out, /FAIL/, 'an unmeasurable run must fail loudly');
    assert.doesNotMatch(out, /MEASURED/, 'an unmeasurable run must never report MEASURED');
    assert.match(out, /not measured|not measured at all|could not be measured/i, `the failure must say what went wrong: ${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// mwg-train-5uo: tolerant SERVED.md parse with an explicit parse diagnostic
test('check-served-gap: formatting variants of the SERVED.md list yield the SAME route set as the committed file', () => {
  const committedContent = readFileSync(DEFAULT_SERVED_MD, 'utf8');
  const committedRoutes = extractUnservedRoutes(committedContent);
  assert.equal(committedRoutes.size, 4, 'committed file must yield exactly 4 unserved routes');
  assert.deepEqual(
    [...committedRoutes].sort(),
    [
      'tr-09-hono:/courses/:id',
      'tr-12-hono:/jobs/:id',
      'tr-13-hono:/docs/:slug',
      'tr-16-hono:/cultivars/:id',
    ],
  );

  // Variant A: bullets (-), tabs, backticks, trailing periods
  const variantA = `
# Unserved routes
- list-detail \`/courses/:id\` (tr-09-hono, course-enrolment).
- list-detail \`/jobs/:id\` (tr-12-hono, job-board).
- list-detail \`/docs/:slug\` (tr-13-hono, docs-site).
- list-detail \`/cultivars/:id\` (tr-16-hono, library-catalogue).
`;

  // Variant B: asterisks (*), leading spaces, bold routes, trailing colons
  const variantB = `
# Unserved routes
  * list-detail **/courses/:id** (tr-09-hono, course-enrolment):
  * list-detail **/jobs/:id** (tr-12-hono, job-board):
  * list-detail **/docs/:slug** (tr-13-hono, docs-site):
  * list-detail **/cultivars/:id** (tr-16-hono, library-catalogue):
`;

  // Variant C: plus (+), italics (* and _), colon after list-detail, multiple spaces
  const variantC = `
# Unserved routes
+ list-detail:   */courses/:id*     (  tr-09-hono  ,  course-enrolment  )
+ list-detail:   _/jobs/:id_       (  tr-12-hono  ,  job-board  )
+ \`list-detail\`   */docs/:slug*     (  tr-13-hono  ,  docs-site  )
+ **list-detail** _/cultivars/:id_  (  tr-16-hono  ,  library-catalogue  )
`;

  // Variant D: no bullets, plain routes without wrappers, indented
  const variantD = `
# Unserved routes
    list-detail /courses/:id (tr-09-hono, course-enrolment)
    list-detail /jobs/:id (tr-12-hono, job-board)
    list-detail /docs/:slug (tr-13-hono, docs-site)
    list-detail /cultivars/:id (tr-16-hono, library-catalogue)
`;

  for (const [name, variant] of [
    ['variantA (bullets, backticks, periods)', variantA],
    ['variantB (asterisks, spaces, bold, colons)', variantB],
    ['variantC (plus, italics, colons, runs of spaces)', variantC],
    ['variantD (no bullets, plain routes, indented)', variantD],
  ]) {
    const extracted = extractUnservedRoutes(variant);
    assert.deepEqual(extracted, committedRoutes, `${name} must extract the same route set`);

    const baselineData = JSON.parse(readFileSync(DEFAULT_BASELINE_JSON, 'utf8'));
    const evaluation = evaluateServedGap({
      servedMdContent: variant,
      baselineData,
      servedMdPath: 'docs/train/corpus/SERVED.md',
    });
    assert.equal(evaluation.status, 'PASS', `${name} must pass evaluation against baseline`);
    assert.equal(evaluation.exitCode, 0);
  }

  // End-to-end via CLI
  const dir = mkdtempSync(join(tmpdir(), '5uo-variant-'));
  const tempServed = join(dir, 'SERVED.md');
  try {
    writeFileSync(tempServed, variantB);
    const stdout = execFileSync(
      process.execPath,
      [GAP_SCRIPT, '--served', tempServed],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.match(stdout, /check-served-gap: PASS - 4 unserved routes agree exactly/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-served-gap: an unparseable document produces the parse diagnostic and NOT the route-mismatch message', () => {
  const baselineData = JSON.parse(readFileSync(DEFAULT_BASELINE_JSON, 'utf8'));

  const unparseableCases = [
    ['empty document', ''],
    ['prose with no list items', '# Title\n\nSome text about the gap with no list.\n'],
    ['malformed list lines missing route and parens', '- list-detail broken\n- list-detail also broken\n'],
  ];

  for (const [desc, content] of unparseableCases) {
    const evaluation = evaluateServedGap({
      servedMdContent: content,
      baselineData,
      servedMdPath: 'docs/train/corpus/SERVED.md',
    });

    assert.equal(evaluation.status, 'PARSE_ERROR', `${desc} must report PARSE_ERROR`);
    assert.equal(evaluation.exitCode, 1, `${desc} must return exit code 1`);
    assert.equal(evaluation.errors.length, 1);

    const errorMsg = evaluation.errors[0];
    assert.match(
      errorMsg,
      /check-served-gap: FAIL - Could not parse unserved route list from docs\/train\/corpus\/SERVED\.md: expected list items matching 'list-detail <route> \(<project>, ...\)', found zero route-shaped entries/,
      `${desc} must produce the explicit parse diagnostic naming the file, expected, and found`,
    );

    // CRUCIAL: Must NOT confuse with route mismatch or floor count
    assert.doesNotMatch(errorMsg, /is in served-routes-baseline\.json but not in SERVED\.md/);
    assert.doesNotMatch(errorMsg, /is in SERVED\.md but not in served-routes-baseline\.json/);
    assert.doesNotMatch(errorMsg, /Floor on the list-detail/);
  }

  // End-to-end via CLI
  const dir = mkdtempSync(join(tmpdir(), '5uo-unparseable-'));
  const tempServed = join(dir, 'SERVED.md');
  try {
    writeFileSync(tempServed, '# Broken\n\nNo list items at all.\n');
    let threw = false;
    try {
      execFileSync(
        process.execPath,
        [GAP_SCRIPT, '--served', tempServed],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      threw = true;
      assert.equal(err.status, 1, 'unparseable file must exit non-zero (1)');
      const combined = (err.stdout ?? '') + (err.stderr ?? '');
      assert.match(combined, /check-served-gap: FAIL - Could not parse unserved route list/);
      assert.match(combined, /found zero route-shaped entries/);
      assert.doesNotMatch(combined, /is in served-routes-baseline\.json but not in SERVED\.md/);
      assert.doesNotMatch(combined, /Floor on the list-detail/);
    }
    assert.ok(threw, 'CLI must exit non-zero for unparseable document');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-served-gap: a genuine route mismatch produces the route-mismatch message and NOT the parse diagnostic', () => {
  const baselineData = JSON.parse(readFileSync(DEFAULT_BASELINE_JSON, 'utf8'));

  // Document has 3 valid baseline routes and 1 unexpected route (so 1 is missing, 1 is unexpected)
  const mismatchContent = `
- list-detail \`/courses/:id\` (tr-09-hono, course-enrolment)
- list-detail \`/jobs/:id\` (tr-12-hono, job-board)
- list-detail \`/docs/:slug\` (tr-13-hono, docs-site)
- list-detail \`/custom/:param\` (tr-99-hono, custom-archetype)
`;

  const evaluation = evaluateServedGap({
    servedMdContent: mismatchContent,
    baselineData,
    servedMdPath: 'docs/train/corpus/SERVED.md',
  });

  assert.equal(evaluation.status, 'MISMATCH');
  assert.equal(evaluation.exitCode, 1);
  const allErrors = evaluation.errors.join('\n');

  // Both missing and unexpected routes must be diagnosed
  assert.match(allErrors, /check-served-gap: FAIL - Route tr-99-hono:\/custom\/:param is in SERVED\.md but not in served-routes-baseline\.json/);
  assert.match(allErrors, /check-served-gap: FAIL - Route tr-16-hono:\/cultivars\/:id is in served-routes-baseline\.json but not in SERVED\.md/);

  // CRUCIAL: Must NOT produce the parse failure diagnostic
  assert.doesNotMatch(allErrors, /Could not parse unserved route list/);
  assert.doesNotMatch(allErrors, /zero route-shaped entries/);

  // End-to-end via CLI
  const dir = mkdtempSync(join(tmpdir(), '5uo-mismatch-'));
  const tempServed = join(dir, 'SERVED.md');
  try {
    writeFileSync(tempServed, mismatchContent);
    let threw = false;
    try {
      execFileSync(
        process.execPath,
        [GAP_SCRIPT, '--served', tempServed],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      threw = true;
      assert.equal(err.status, 1, 'route mismatch must exit non-zero (1)');
      const combined = (err.stdout ?? '') + (err.stderr ?? '');
      assert.match(combined, /check-served-gap: FAIL - Route tr-99-hono:\/custom\/:param is in SERVED\.md but not in served-routes-baseline\.json/);
      assert.match(combined, /check-served-gap: FAIL - Route tr-16-hono:\/cultivars\/:id is in served-routes-baseline\.json but not in SERVED\.md/);
      assert.doesNotMatch(combined, /Could not parse unserved route list/);
      assert.doesNotMatch(combined, /zero route-shaped entries/);
    }
    assert.ok(threw, 'CLI must exit non-zero for route mismatch');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-served-gap: routes in prose sentences are not extracted as list items', () => {
  const proseOnly = `
Every declared list route is now served. The four that remain are list-detail routes, declared as
\`/courses/:id\`, \`/jobs/:id\`, \`/docs/:slug\` and \`/cultivars/:id\` on the four projects below.

| route kind | served | declared |
|---|---|---|
| list-detail | 0 | 4 |

The list routes that used to be listed here - \`/services\`, \`/ciders\`, \`/kilns\` - are all served now.
`;
  const extracted = extractUnservedRoutes(proseOnly);
  assert.equal(extracted.size, 0, 'prose sentences and tables must not be extracted as list entries');
});
