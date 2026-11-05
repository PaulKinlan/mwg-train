// mwg-train-xku. `check:served-routes` printed "MEASURED - 0/0 declared route(s) served across 7 project(s)
// (0 not served)" and exited 0 in a tree where every project failed: it reported a measurement it had not
// made, and it could not fail. These tests pin the verdict policy, and then drive the real CLI end to end
// through all three outcomes - none of which starts a server, so the whole file is cheap.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_BASELINE_JSON,
  DEFAULT_SERVED_MD,
  GAP_SECTION_HEADING,
  evaluateServedGap,
  extractUnservedRoutes,
} from '../scripts/check-served-gap.mjs';
import { probeProject, RedirectTargetError, resolveRecordRedirect, runVerdict } from '../scripts/check-served-routes.mjs';
import { sandboxAvailable } from '../src/eval/generated-server.mjs';

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
  // src/ is part of a clean checkout and is now imported by the script (the shared environment policy for generated
  // servers, mwg-train-6wpn). Without it the fixture tests "the import is missing", not "the generated projects are
  // missing", and the three end-to-end cases fail with ERR_MODULE_NOT_FOUND instead of the exit codes they pin.
  symlinkSync(join(ROOT, 'src'), join(dir, 'src'), 'dir');
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
    // mwg-train-zp4: this named `npm run pilot:scaffold`, which writes pilot/projects and never mentions
    // training-projects, so an operator who followed the skip produced a different directory, re-ran, and was
    // told the input was still missing. Pin the property, not a literal command string: that is how the wrong
    // message stayed green here in the first place.
    //   - the command must come out of the message (not be written into the test),
    //   - it must be a real script in package.json, and resolve to a FILE even when the script carries flags,
    //   - and that file must declare pilot/training-projects as an OUTPUT. Mere mention is not production:
    //     train:tokens and both route checks all mention this directory as an INPUT, so the first version of
    //     this assertion would have passed if the skip had named any of them (review finding P2).
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const producer = /Run `npm run ([a-z0-9:-]+)` to produce the projects/.exec(out);
    assert.ok(producer, 'a skip must name the command that produces the input');
    const named = producer[1];
    const command = pkg.scripts?.[named];
    assert.ok(command, `the skip names '${named}', which is not a script in package.json`);
    const scriptPath = /node\s+(\S+\.m?js)/.exec(command)?.[1];
    assert.ok(scriptPath, `the named script '${named}' does not resolve to a file: ${command}`);
    assert.match(
      readFileSync(join(ROOT, scriptPath), 'utf8'),
      /(?:out|outDir)\s*:\s*['"]pilot\/training-projects['"]/,
      `the skip names '${named}', which does not declare pilot/training-projects as an OUTPUT`,
    );
    assert.doesNotMatch(out, /npm run pilot:scaffold/, 'the skip must not name the scaffolder for pilot/projects');
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
${GAP_SECTION_HEADING}
- list-detail \`/courses/:id\` (tr-09-hono, course-enrolment).
- list-detail \`/jobs/:id\` (tr-12-hono, job-board).
- list-detail \`/docs/:slug\` (tr-13-hono, docs-site).
- list-detail \`/cultivars/:id\` (tr-16-hono, library-catalogue).
`;

  // Variant B: asterisks (*), leading spaces, bold routes, trailing colons
  const variantB = `
${GAP_SECTION_HEADING}
  * list-detail **/courses/:id** (tr-09-hono, course-enrolment):
  * list-detail **/jobs/:id** (tr-12-hono, job-board):
  * list-detail **/docs/:slug** (tr-13-hono, docs-site):
  * list-detail **/cultivars/:id** (tr-16-hono, library-catalogue):
`;

  // Variant C: plus (+), italics (* and _), colon after list-detail, multiple spaces
  const variantC = `
${GAP_SECTION_HEADING}
+ list-detail:   */courses/:id*     (  tr-09-hono  ,  course-enrolment  )
+ list-detail:   _/jobs/:id_       (  tr-12-hono  ,  job-board  )
+ \`list-detail\`   */docs/:slug*     (  tr-13-hono  ,  docs-site  )
+ **list-detail** _/cultivars/:id_  (  tr-16-hono  ,  library-catalogue  )
`;

  // Variant D: no bullets, plain routes without wrappers, indented
  const variantD = `
${GAP_SECTION_HEADING}
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
    ['section present with prose only', `${GAP_SECTION_HEADING}\n\nSome text about the gap with no list.\n`],
    ['section present with malformed list lines missing route and parens', `${GAP_SECTION_HEADING}\n\n- list-detail broken\n- list-detail also broken\n`],
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
    writeFileSync(tempServed, `${GAP_SECTION_HEADING}\n\nNo list items at all.\n`);
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
${GAP_SECTION_HEADING}
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
${GAP_SECTION_HEADING}
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

// mwg-train-bdw: scope route extraction to the gap section, fail closed if it is missing
test('check-served-gap: extraction is bounded to GAP_SECTION_HEADING body, ignoring lines before, after, in prose, or in code fences', () => {
  const committedContent = readFileSync(DEFAULT_SERVED_MD, 'utf8');

  // Case 1: committed SERVED.md body yields exactly the 4 routes
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

  // Case 2: a route-shaped line in a history section AFTER the gap section is NOT extracted
  const historyContent = `${committedContent}\n\n## History\n\n- list-detail \`/history/:id\` (tr-99-hono, history-item)\n`;
  const historyExtracted = extractUnservedRoutes(historyContent);
  assert.equal(historyExtracted.size, 4, 'route in history section must not be extracted');
  assert.equal(historyExtracted.has('tr-99-hono:/history/:id'), false);

  // Negative control for Case 2: the same route placed INSIDE the section IS extracted
  const historyInsideContent = committedContent.replace(
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)',
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)\nlist-detail `/history/:id` (tr-99-hono, history-item)',
  );
  const historyInsideExtracted = extractUnservedRoutes(historyInsideContent);
  assert.equal(historyInsideExtracted.size, 5, 'negative control: same line inside section must be extracted');
  assert.equal(historyInsideExtracted.has('tr-99-hono:/history/:id'), true);

  // Case 3: a route-shaped line inside a fenced code block outside the section is NOT extracted
  const fencedContent = `${committedContent}\n\n## Diff History\n\n\`\`\`diff\n- list-detail \`/fenced/:id\` (tr-88-hono, fenced-diff)\n\`\`\`\n`;
  const fencedExtracted = extractUnservedRoutes(fencedContent);
  assert.equal(fencedExtracted.size, 4, 'route in fenced code block outside section must not be extracted');
  assert.equal(fencedExtracted.has('tr-88-hono:/fenced/:id'), false);

  // Negative control for Case 3: the same route inside the section IS extracted
  const fencedInsideContent = committedContent.replace(
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)',
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)\nlist-detail `/fenced/:id` (tr-88-hono, fenced-diff)',
  );
  const fencedInsideExtracted = extractUnservedRoutes(fencedInsideContent);
  assert.equal(fencedInsideExtracted.size, 5, 'negative control: same route inside section must be extracted');
  assert.equal(fencedInsideExtracted.has('tr-88-hono:/fenced/:id'), true);

  // Case 4: a route-shaped line in prose is NOT extracted
  const proseContent = committedContent.replace(
    'Every declared `list` route is now served.',
    'Every declared `list` route is now served, such as list-detail `/prose/:id` (tr-77-hono, prose-item) in testing.',
  );
  const proseExtracted = extractUnservedRoutes(proseContent);
  assert.equal(proseExtracted.size, 4, 'route-shaped line in prose must not be extracted');
  assert.equal(proseExtracted.has('tr-77-hono:/prose/:id'), false);

  // Negative control for Case 4: the same route formatted as list item inside section IS extracted
  const proseInsideContent = committedContent.replace(
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)',
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)\nlist-detail `/prose/:id` (tr-77-hono, prose-item)',
  );
  const proseInsideExtracted = extractUnservedRoutes(proseInsideContent);
  assert.equal(proseInsideExtracted.size, 5, 'negative control: same route as item inside section must be extracted');
  assert.equal(proseInsideExtracted.has('tr-77-hono:/prose/:id'), true);

  // Case 5: a route-shaped line BEFORE the section is NOT extracted
  const beforeContent = `# Top Preamble\n\n- list-detail \`/before/:id\` (tr-66-hono, before-item)\n\n${committedContent}`;
  const beforeExtracted = extractUnservedRoutes(beforeContent);
  assert.equal(beforeExtracted.size, 4, 'route before section must not be extracted');
  assert.equal(beforeExtracted.has('tr-66-hono:/before/:id'), false);

  // Negative control for Case 5: the same route placed inside section IS extracted
  const beforeInsideContent = committedContent.replace(
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)',
    'list-detail `/courses/:id`   (tr-09-hono, course-enrolment)\nlist-detail `/before/:id` (tr-66-hono, before-item)',
  );
  const beforeInsideExtracted = extractUnservedRoutes(beforeInsideContent);
  assert.equal(beforeInsideExtracted.size, 5, 'negative control: same route inside section must be extracted');
  assert.equal(beforeInsideExtracted.has('tr-66-hono:/before/:id'), true);
});

test('check-served-gap: a document whose gap-section heading has been renamed or removed produces the locate diagnostic and NOT a route mismatch', () => {
  const baselineData = JSON.parse(readFileSync(DEFAULT_BASELINE_JSON, 'utf8'));
  const committedContent = readFileSync(DEFAULT_SERVED_MD, 'utf8');

  // Case A: Missing heading cases
  const absentCases = [
    ['empty document', ''],
    ['prose document with other headings', '# Project Overview\n\nSome text with no gap section heading.\n'],
    ['document with arbitrary heading', '## Unserved Routes List\n\nlist-detail `/courses/:id` (tr-09-hono, course-enrolment)\n'],
  ];

  for (const [desc, content] of absentCases) {
    const evaluation = evaluateServedGap({
      servedMdContent: content,
      baselineData,
      servedMdPath: 'docs/train/corpus/SERVED.md',
    });

    assert.equal(evaluation.status, 'SECTION_NOT_FOUND', `${desc} must return status SECTION_NOT_FOUND`);
    assert.equal(evaluation.exitCode, 1, `${desc} must exit with code 1`);
    assert.equal(evaluation.errors.length, 1);

    const errorMsg = evaluation.errors[0];
    assert.match(
      errorMsg,
      /check-served-gap: FAIL - Could not locate section '## What the gap is, precisely' in docs\/train\/corpus\/SERVED\.md/,
      `${desc} must produce the explicit locate diagnostic naming the heading and file`,
    );

    // CRUCIAL: Must NOT confuse missing section with route mismatch or parse diagnostic
    assert.doesNotMatch(errorMsg, /is in served-routes-baseline\.json but not in SERVED\.md/);
    assert.doesNotMatch(errorMsg, /is in SERVED\.md but not in served-routes-baseline\.json/);
    assert.doesNotMatch(errorMsg, /Could not parse unserved route list/);
    assert.doesNotMatch(errorMsg, /zero route-shaped entries/);
    assert.doesNotMatch(errorMsg, /Floor on the list-detail/);
  }

  // Case B: Heading renamed in otherwise-valid committed SERVED.md
  const renamedContent = committedContent.replace(
    GAP_SECTION_HEADING,
    '## The remaining unserved routes',
  );
  const renamedEval = evaluateServedGap({
    servedMdContent: renamedContent,
    baselineData,
    servedMdPath: 'docs/train/corpus/SERVED.md',
  });

  assert.equal(renamedEval.status, 'SECTION_NOT_FOUND');
  assert.equal(renamedEval.exitCode, 1);
  assert.equal(renamedEval.errors.length, 1);
  const renamedError = renamedEval.errors[0];
  assert.match(
    renamedError,
    /check-served-gap: FAIL - Could not locate section '## What the gap is, precisely' in docs\/train\/corpus\/SERVED\.md/,
  );
  // CRUCIAL: Must NOT report route mismatch even though routes were in the document under a renamed heading
  assert.doesNotMatch(renamedError, /is in served-routes-baseline\.json but not in SERVED\.md/);
  assert.doesNotMatch(renamedError, /is in SERVED\.md but not in served-routes-baseline\.json/);
  assert.doesNotMatch(renamedError, /Could not parse unserved route list/);
  assert.doesNotMatch(renamedError, /zero route-shaped entries/);

  // End-to-end via CLI with renamed heading
  const dir = mkdtempSync(join(tmpdir(), 'bdw-renamed-'));
  const tempServed = join(dir, 'SERVED.md');
  try {
    writeFileSync(tempServed, renamedContent);
    let threw = false;
    try {
      execFileSync(
        process.execPath,
        [GAP_SCRIPT, '--served', tempServed],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      threw = true;
      assert.equal(err.status, 1, 'renamed heading must cause CLI to exit 1');
      const combined = (err.stdout ?? '') + (err.stderr ?? '');
      assert.match(combined, /check-served-gap: FAIL - Could not locate section '## What the gap is, precisely'/);
      assert.doesNotMatch(combined, /is in served-routes-baseline\.json but not in SERVED\.md/);
      assert.doesNotMatch(combined, /Could not parse unserved route list/);
      assert.doesNotMatch(combined, /zero route-shaped entries/);
    }
    assert.ok(threw, 'CLI must exit non-zero for renamed heading');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// mwg-train-llda. The prober probed a read-by-reference route with whatever the generated server put in a Location
// header: `recordUrl.startsWith('http') ? recordUrl : ...` meant an answer of `302 http://169.254.169.254/...`, or a
// redirect to another loopback service, became a request this host made on the server's behalf. The header is a claim
// by model-generated code, so the target it names is now a question the prober answers, not an instruction it follows.
// The unit cases pin the decision; the end-to-end cases drive probeProject, which is the loop that used to act on the
// raw header, against a fixture server that redirects wherever the case says.
const FIXTURE_PROJECT_ID = 'llda-fixture-probe';

const fixtureProject = () => ({
  project_id: FIXTURE_PROJECT_ID,
  family_id: 'tr-00',
  archetype: 'fixture',
  framework: 'raw',
});

/**
 * A generated project shaped enough for probeProject: a write route that redirects, and a read-by-reference route
 * that reads the record back. `location` is either a literal target the fixture emits, `'absent'` for a 3xx written
 * with no Location header at all, or one of the two forms that can only be built once the prober has allocated its
 * port.
 */
function writeRedirectFixtureProject(root, { location }) {
  const dir = join(root, FIXTURE_PROJECT_ID);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'spec.json'),
    JSON.stringify(
      {
        project_id: FIXTURE_PROJECT_ID,
        routes: [
          { path: '/things', method: 'POST', kind: 'write' },
          { path: '/things/:id', method: 'GET', kind: 'read-by-reference' },
        ],
        fields: [{ name: 'title', type: 'text' }],
      },
      null,
      2,
    ),
  );
  const target =
    location === 'relative'
      ? "'/things/42'"
      : location === 'absolute-local'
        ? '`http://127.0.0.1:${port}/things/42`'
        : JSON.stringify(location);
  // A 302 written with an empty header object is a redirect that names nowhere, which a generated server can emit.
  const redirectHeaders = location === 'absent' ? '{}' : `{ location: ${target} }`;
  // Node builtins only: the sandbox mounts the project directory and the node runtime, never this repository's
  // node_modules, so a fixture that imported a framework would be testing the sandbox, not the prober.
  writeFileSync(
    join(dir, 'server.mjs'),
    `import http from 'node:http';
const portIndex = process.argv.indexOf('--port');
const port = portIndex === -1 ? 0 : Number(process.argv[portIndex + 1]);
const server = http.createServer((request, response) => {
  if (request.method === 'POST') {
    response.writeHead(302, ${redirectHeaders});
    response.end('created');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end(request.url === '/things/42' ? 'the created record' : 'root');
});
server.listen(port, '127.0.0.1');
`,
  );
  return root;
}

/** Start a loopback listener that records every request, to prove a refused redirect was never fetched. */
async function startCanary() {
  const hits = [];
  const server = http.createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    response.end('canary');
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return {
    port: server.address().port,
    hits,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

test('a redirect target is adopted only when it names the server under test', () => {
  const port = 45999;
  const origin = `http://127.0.0.1:${port}`;

  // Adopted: a relative target, and the two spellings of the tested origin. These are the legitimate shapes a
  // generated server produces, and refusing them would break the read-by-reference probe the redirect exists for.
  assert.equal(resolveRecordRedirect('/records/42', port), `${origin}/records/42`);
  assert.equal(resolveRecordRedirect('records/42', port), `${origin}/records/42`);
  assert.equal(resolveRecordRedirect(`${origin}/records/42`, port), `${origin}/records/42`);
  assert.equal(resolveRecordRedirect(`http://localhost:${port}/records/42?tab=1`, port), `${origin}/records/42?tab=1`);

  const refused = [
    ['another port on loopback', `http://127.0.0.1:${port + 1}/records/42`],
    ['a loopback address with no port, which means port 80', 'http://127.0.0.1/records/42'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/iam/security-credentials/'],
    ['a private network address', 'http://10.0.0.5:45999/records/42'],
    ['an arbitrary external host', 'http://evil.example/records/42'],
    ['a scheme-relative target naming an external host', '//evil.example/records/42'],
    ['credentials in the authority of the tested host', `http://user:pass@127.0.0.1:${port}/records/42`],
    ['credentials in the authority of another host', `http://127.0.0.1:${port}@evil.example/records/42`],
    ['https, which the tested server does not serve', `https://127.0.0.1:${port}/records/42`],
    ['a file URL', 'file:///etc/passwd'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an empty header', ''],
  ];
  for (const [description, target] of refused) {
    assert.throws(
      () => resolveRecordRedirect(target, port),
      (error) => error instanceof RedirectTargetError,
      `${description} must be refused`,
    );
  }

  // A refusal a reader cannot act on is a refusal they cannot check: the message names what the server sent.
  assert.throws(
    () => resolveRecordRedirect('http://169.254.169.254/latest/meta-data/', port),
    /169\.254\.169\.254/,
  );

  // Credentials are refused on their own account rather than because the authority named the wrong host. A target
  // that is correct in host and port and carries a userinfo component isolates that check, so the code is asserted.
  assert.throws(
    () => resolveRecordRedirect(`http://user:pass@127.0.0.1:${port}/records/42`, port),
    (error) => error instanceof RedirectTargetError && error.code === 'credentials',
    'a same-origin target with credentials is refused as credentials, not as a host mismatch',
  );
});

test('end to end: a relative redirect is adopted as the record a read-by-reference route reads', async (t) => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap unavailable; no generated code run without it');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'llda-relative-'));
  try {
    writeRedirectFixtureProject(root, { location: 'relative' });
    const report = await probeProject(fixtureProject(), root);
    assert.equal(report.server_ready, true);
    const read = report.routes.find((route) => route.declared_path === '/things/:id');
    assert.equal(read.probed_path, 'the reference the server returned');
    assert.equal(read.probed_with_created_record, true);
    assert.equal(read.status, 200);
    assert.equal(read.is_served, true);
    assert.equal(report.errors, 0, 'a redirect inside the tested server is not an error');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('end to end: an absolute redirect naming the tested origin is adopted as a relative one is', async (t) => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap unavailable; no generated code run without it');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'llda-absolute-local-'));
  try {
    writeRedirectFixtureProject(root, { location: 'absolute-local' });
    const report = await probeProject(fixtureProject(), root);
    const read = report.routes.find((route) => route.declared_path === '/things/:id');
    assert.equal(read.probed_path, 'the reference the server returned');
    assert.equal(read.probed_with_created_record, true);
    assert.equal(read.status, 200);
    assert.equal(report.errors, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('end to end: a redirect to another loopback port is refused, fails the write route, and is never fetched', async (t) => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap unavailable; no generated code run without it');
    return;
  }
  const canary = await startCanary();
  const root = mkdtempSync(join(tmpdir(), 'llda-other-port-'));
  try {
    // A live service on an unexpected loopback port, which is the case that can be observed rather than argued: the
    // broken prober would have fetched it, and the canary would have the request to show for it.
    writeRedirectFixtureProject(root, { location: `http://127.0.0.1:${canary.port}/stolen-record` });
    const report = await probeProject(fixtureProject(), root);

    assert.deepEqual(canary.hits, [], 'the prober must not fetch a redirect that names another port');
    const write = report.routes.find((route) => route.declared_method === 'POST');
    assert.equal(write.outcome, 'error', 'a refused redirect target is a failed route check, not a served route');
    assert.equal(write.is_served, false);
    assert.match(write.error, /refused the redirect target/);
    assert.match(write.error, new RegExp(String(canary.port)), 'the failure names the port it refused');
    assert.equal(report.errors, 1);

    // No reference was adopted, so the read-by-reference route fell back to its declared path.
    const read = report.routes.find((route) => route.declared_path === '/things/:id');
    assert.equal(read.probed_path, '/things/1');
    assert.equal(read.probed_with_created_record, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    await canary.close();
  }
});

test('end to end: a redirect to the cloud metadata address fails the write route instead of being followed', async (t) => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap unavailable; no generated code run without it');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'llda-metadata-'));
  try {
    writeRedirectFixtureProject(root, { location: 'http://169.254.169.254/latest/meta-data/' });
    const report = await probeProject(fixtureProject(), root);
    const write = report.routes.find((route) => route.declared_method === 'POST');
    assert.equal(write.outcome, 'error');
    assert.equal(write.is_served, false);
    assert.match(write.error, /169\.254\.169\.254/, 'the failure names the destination it refused');
    assert.equal(report.errors, 1);
    const read = report.routes.find((route) => route.declared_path === '/things/:id');
    assert.equal(read.probed_with_created_record, false, 'the refused reference must not become the probe URL');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Review P1: `if (location)` skipped the validation for a 3xx written without a Location header, so a write route
// that answered 302 and named nowhere was classified `served` and the run reported the route as measured. A 3xx is
// the claim "the record is that way"; with no header there is no reference, so the route check has failed.
test('end to end: a redirect with no Location header fails the write route', async (t) => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap unavailable; no generated code run without it');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'llda-no-location-'));
  try {
    writeRedirectFixtureProject(root, { location: 'absent' });
    const report = await probeProject(fixtureProject(), root);
    const write = report.routes.find((route) => route.declared_method === 'POST');
    assert.equal(write.status, 302, 'the server did answer the write route');
    assert.equal(write.outcome, 'error', 'a 3xx that names no reference is a failed route check, not a served route');
    assert.equal(write.is_served, false);
    assert.match(write.error, /refused the redirect target/);
    assert.match(write.error, /no Location header/);
    assert.equal(report.errors, 1);
    assert.equal(report.served, 1, 'the read route is still served; only the write route failed');

    // Nothing was adopted, so the read-by-reference route probed its declared path rather than an empty URL.
    const read = report.routes.find((route) => route.declared_path === '/things/:id');
    assert.equal(read.probed_path, '/things/1');
    assert.equal(read.probed_with_created_record, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// mwg-train-hogz review P1. probeProject decided whether model-authored code ran behind a PID namespace, returned a
// handle carrying that decision, and then wrote a project row that said nothing about it: a contained probe and one
// that ran the server beside the operator's processes produced the same report, so the JSON could not attest the
// measurement it presented. The cases below read the posture back out of what the run emits, under each launch
// posture the prober can take, so a dropped field, a constant, or a posture taken from anywhere but the launch
// fails one of them.

/** A corpus of exactly the fixture project, so the CLI reports on it rather than on the gitignored generated set. */
function writeFixtureCorpus(dir) {
  const corpusPath = join(dir, 'corpus.json');
  const manifestPath = join(dir, 'manifest.jsonl');
  writeFileSync(corpusPath, JSON.stringify({ projects: [fixtureProject()] }, null, 2));
  writeFileSync(manifestPath, `${JSON.stringify({ family_id: 'tr-00' })}\n`);
  return { corpusPath, manifestPath };
}

test('the emitted route report names the containment the probe launched under', async () => {
  if (!sandboxAvailable()) {
    t.skip('bubblewrap unavailable; no generated code run without it');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'hogz-emitted-posture-'));
  try {
    writeRedirectFixtureProject(root, { location: 'relative' });
    const { corpusPath, manifestPath } = writeFixtureCorpus(root);
    const outPath = join(root, 'served-routes.json');
    // The real CLI, not the exported function: what a reviewer reads later is the file it writes.
    const run = runCli(ROOT, [
      '--projects', root, '--corpus', corpusPath, '--manifest', manifestPath, '--out', outPath,
    ]);
    assert.equal(run.code, 0, `the fixture probe must measure every declared route:\n${run.stdout}${run.stderr}`);

    const emitted = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(emitted.projects.length, 1);
    assert.equal(emitted.projects[0].server_ready, true, 'the row describes a server that really ran');
    assert.equal(emitted.summary.served, 2, 'and routes that really served');
    assert.deepEqual(
      emitted.projects[0].sandboxPosture,
      { mechanism: 'bubblewrap', optIn: null },
      'the emitted report must state the containment the probe launched, and a contained run names no opt-in',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a probe launched on the host names the opt-in that allowed it', async (t) => {
  // The documented escape hatch: no bubblewrap here, and the operator said to run anyway. The probe must still
  // measure the routes - and must say which variable let model-authored code run beside their processes, because
  // that is the one fact that separates this report from a contained one.
  const saved = {
    MWG_BWRAP_PATH: process.env.MWG_BWRAP_PATH,
    MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER: process.env.MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER,
  };
  process.env.MWG_BWRAP_PATH = '/nonexistent/bwrap';
  process.env.MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER = '1';
  const root = mkdtempSync(join(tmpdir(), 'hogz-host-posture-'));
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });

  writeRedirectFixtureProject(root, { location: 'relative' });
  const report = await probeProject(fixtureProject(), root);
  assert.equal(report.server_ready, true, 'a host launch still measures the routes it reports');
  assert.equal(report.served, 2);
  assert.deepEqual(
    report.sandboxPosture,
    { mechanism: 'host-opt-in', optIn: 'MWG_ALLOW_UNSANDBOXED_GENERATED_SERVER=1' },
    'a host run that names no opt-in leaves a reviewer unable to tell what let the server out of the sandbox',
  );
});

test('a project the prober could not start reports a null posture rather than dropping the field', async (t) => {
  // No spec.json, so no server is launched and there is no posture to state. The field has to be there as null:
  // a consumer that reads a missing key cannot tell "nothing launched" from "a report written before the field
  // existed", and those deserve different answers.
  const root = mkdtempSync(join(tmpdir(), 'hogz-no-spec-posture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const report = await probeProject(fixtureProject(), root);
  assert.equal(report.error, 'spec.json not found');
  assert.ok('sandboxPosture' in report, 'an unmeasured row still states the field');
  assert.equal(report.sandboxPosture, null, 'and states it as null rather than inventing a containment');
});
