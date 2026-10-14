#!/usr/bin/env node
/**
 * Fast gate for mwg-train (fleet-1ojy.14).
 *
 * Runs only the tests and checks affected by changes in the current branch against origin/main.
 * Emits "fast-gate: passed: <suites>" so fleet-check can track coverage.
 * If a changed file has no mapped test suites, it fails loudly unless explicitly exempt.
 * Fails closed on Git failures, builds full transitive dependency graph for modules,
 * and routes checked markdown documents and manifests to their respective checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 1. Determine base commit and changed files (Fail closed on Git failures)
const baseRef = process.env.GIT_BASE || 'origin/main';
let changedFiles = [];

if (process.env.GIT_CHANGED) {
  changedFiles = process.env.GIT_CHANGED.split(/\s+/).filter(Boolean);
} else {
  let baseSha = '';
  const mb = spawnSync('git', ['merge-base', baseRef, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (mb.status === 0 && mb.stdout.trim()) {
    baseSha = mb.stdout.trim();
  } else {
    const rp = spawnSync('git', ['rev-parse', baseRef], { cwd: ROOT, encoding: 'utf8' });
    if (rp.status === 0 && rp.stdout.trim()) {
      baseSha = rp.stdout.trim();
    } else {
      console.error(`fast-gate: FAIL: base '${baseRef}' is not a resolvable commit in this repository.`);
      process.exit(1);
    }
  }

  const diff = spawnSync('git', ['diff', '--name-only', `${baseSha}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
  if (diff.status !== 0) {
    console.error(`fast-gate: FAIL: 'git diff --name-only ${baseSha}...HEAD' failed to compute delta.`);
    process.exit(1);
  }
  changedFiles = diff.stdout.trim().split('\n').filter(Boolean);
}

// 2. Discover all repository JS/MJS modules and build full transitive dependency graph
function scanAllCodeFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanAllCodeFiles(full));
    } else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const allCodeFiles = scanAllCodeFiles(ROOT);
// module -> Set of files that directly import it (reverse dependency graph)
const reverseDeps = new Map();

for (const codeFile of allCodeFiles) {
  const relPath = path.normalize(path.relative(ROOT, codeFile));
  try {
    const content = fs.readFileSync(codeFile, 'utf8');
    const importRegex = /(?:from\s+["']|import\s*\(["']|require\s*\(["'])([^"']+)["']/g;
    let m;
    while ((m = importRegex.exec(content)) !== null) {
      const imp = m[1];
      if (imp.startsWith('.')) {
        const resolved = path.normalize(path.relative(ROOT, path.resolve(path.dirname(codeFile), imp)));
        const candidates = [
          resolved,
          `${resolved}.mjs`,
          `${resolved}.js`,
          path.join(resolved, 'index.mjs'),
          path.join(resolved, 'index.js'),
        ];
        for (const cand of candidates) {
          if (fs.existsSync(path.join(ROOT, cand))) {
            if (!reverseDeps.has(cand)) reverseDeps.set(cand, new Set());
            reverseDeps.get(cand).add(relPath);
            break;
          }
        }
      }
    }
  } catch {}
}

// Compute all transitive dependents of a file
function getTransitiveDependents(file, visited = new Set()) {
  const norm = path.normalize(file);
  if (visited.has(norm)) return visited;
  visited.add(norm);
  const direct = reverseDeps.get(norm);
  if (direct) {
    for (const dep of direct) {
      getTransitiveDependents(dep, visited);
    }
  }
  return visited;
}

// 3. Map changed files to test suites and check scripts
const selectedSuites = new Set();
const selectedChecks = new Set();
const unmappedFiles = [];

// Path-prefix mapping for whole directories whose files are covered by a check rather than a unit
// test. The generated evaluation fixtures have no test suite of their own: check:eval-projects
// re-derives every file in docs/eval/projects/ and fails on any drift, which is precisely the
// coverage the fast gate exists to find. Without this, any change to a fixture makes the gate exit 1
// with "unmapped changed files", so the fast gate cannot be run on a branch that touches them.
const checkPrefixMap = {
  'docs/eval/projects/': 'check:eval-projects',
};

function checkForPrefix(file) {
  for (const [prefix, check] of Object.entries(checkPrefixMap)) {
    if (file.startsWith(prefix)) return check;
  }
  return null;
}

// Coverage contract (mwg-train-dfas): .fleet/coverage-mapping.json is read BOTH here and by the
// fleet coverage oracle (remote/check-coverage.py), from the same bytes. The oracle's import scan
// cannot see named imports - a test can bind only `launchChrome` out of the cdp module, carrying
// the stem solely in the module path - so a source file covered exclusively that way looks
// uncovered to the oracle even when this gate runs its three importing suites. Declaring such
// files in the shared contract and selecting from it HERE means the gate and the oracle can no
// longer disagree about what covers what: a mapping that rots fails this gate closed instead of
// warning after the fact (the drift fleet-r571 caught when the contract and the selection were
// separate artefacts).
const coverageMappingPath = process.env.FAST_GATE_COVERAGE_MAP
  ? path.resolve(process.env.FAST_GATE_COVERAGE_MAP)
  : path.join(ROOT, '.fleet', 'coverage-mapping.json');
let coverageMapping = {};
if (fs.existsSync(coverageMappingPath)) {
  try {
    coverageMapping = JSON.parse(fs.readFileSync(coverageMappingPath, 'utf8'));
  } catch (error) {
    console.error(`fast-gate: FAIL: coverage mapping ${coverageMappingPath} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
  if (typeof coverageMapping !== 'object' || coverageMapping === null || Array.isArray(coverageMapping)) {
    console.error(`fast-gate: FAIL: coverage mapping ${coverageMappingPath} must be a JSON object of file -> suites.`);
    process.exit(1);
  }
  // Validate the WHOLE contract at load, not just the entries this run selects (mwg-train-ukct):
  // the mapping file itself is exempt from the changed-file unmapped check (.fleet/ prefix), so a
  // mapping edited on its own would otherwise pass green while naming a suite no branch can ever
  // run. Rot is caught the moment it lands, whichever files changed. Keys carrying glob
  // metacharacters are exempt from the on-disk key check: the fleet oracle also accepts fnmatch
  // patterns this gate's exact-match consumption does not select, and a pattern is not a file.
  for (const [mappedFile, suites] of Object.entries(coverageMapping)) {
    if (!Array.isArray(suites) || suites.length === 0 || suites.some((s) => typeof s !== 'string')) {
      console.error(`fast-gate: FAIL: coverage mapping entry for ${mappedFile} must be a non-empty array of suite paths.`);
      process.exit(1);
    }
    if (!/[*?\[]/.test(mappedFile) && !fs.existsSync(path.join(ROOT, mappedFile))) {
      console.error(`fast-gate: FAIL: coverage mapping key ${mappedFile} does not exist on disk.`);
      process.exit(1);
    }
    for (const suite of suites) {
      if (!fs.existsSync(path.join(ROOT, suite))) {
        console.error(`fast-gate: FAIL: coverage mapping entry for ${mappedFile} names a suite that is not a file on disk: ${suite}`);
        process.exit(1);
      }
    }
  }


}

// PATTERN support, so the two consumers of this contract agree. The oracle matches with Python's
// fnmatch; this gate matched exact keys only, so a shared glob entry was embraced by the oracle and
// silently selected nothing here - and because a pattern key is exempt from the on-disk check, that
// drift was invisible (a new archetype README changed the generator suite's discovery input while its
// gate ran only the board suites: mwg-train-*). Translation mirrors fnmatch: `*` matches any run
// (including `/`), `?` one character, `[seq]`/`[!seq]` a character class.
const globToRegExp = (pattern) => {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else if (ch === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) out += '\\[';
      else {
        const body = pattern.slice(i + 1, end);
        out += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
        i = end;
      }
    } else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
};
const coveragePatterns = Object.entries(coverageMapping)
  .filter(([key]) => /[*?[]/.test(key))
  .map(([pattern, suites]) => [pattern, globToRegExp(pattern), suites]);

// Explicit script mapping for check scripts that don't have direct unit tests
const checkScriptMap = {
  'scripts/validate-provenance.mjs': 'lint:provenance',
  'scripts/check-provenance-quotes.mjs': 'check:quotes',
  'scripts/validate-briefs.mjs': 'check:briefs',
  'scripts/verify-originals.mjs': 'check:originals',
  'scripts/check-disjoint.mjs': 'check:disjoint',
  'scripts/scaffold-eval-projects.mjs': 'check:eval-projects',
  'scripts/render-targets.mjs': 'check:targets',
  'scripts/rebuild-from-spec.mjs': 'check:specs',
  'scripts/check-archetype-assets.mjs': 'check:archetype-assets',
  'scripts/check-archetype-frames.mjs': 'check:archetype-frames',
  'scripts/check-build-key.mjs': 'check:build-key',
  'scripts/pilot-corpus.mjs': 'check:pilot-corpus',
  'scripts/check-set-separation.mjs': 'check:set-separation',
  'scripts/check-train-evidence.mjs': 'check:train-evidence',
  'scripts/check-train-records.mjs': 'check:train-records',
  'scripts/scan-owner-auth.mjs': 'scan:owner-auth',
  'scripts/check-brief-schema.mjs': 'check:brief-schema',
  'scripts/check-route-conformance.mjs': 'check:route-conformance',
  'scripts/check-rules-pin.mjs': 'check:rules-pin',
  'scripts/check-design-schema.mjs': 'check:design-schema',
  'scripts/check-train-design.mjs': 'check:train-design',
  'scripts/check-baseline-label.mjs': 'check:baseline-label',
  'scripts/check-doc-links.mjs': 'check:doc-links',
  'scripts/check-pilot-served.mjs': 'check:pilot-served',
  'scripts/check-served-gap.mjs': 'check:served-gap',
};

// Document & manifest routing: files that are actively checked by the gate
function routeDocument(file) {
  if (file === 'docs/train/briefs/manifest.jsonl') {
    selectedChecks.add('check:brief-schema');
    selectedChecks.add('check:disjoint');
    return true;
  }
  if (file.startsWith('docs/eval/design/') && file.endsWith('.md')) {
    selectedChecks.add('check:design-schema');
    selectedChecks.add('check:doc-links');
    selectedChecks.add('check:baseline-label');
    return true;
  }
  if (file.startsWith('docs/train/design/') && (file.endsWith('/plan.md') || file.endsWith('/design.md'))) {
    selectedChecks.add('check:train-design');
    selectedChecks.add('check:design-schema');
    selectedChecks.add('check:doc-links');
    selectedChecks.add('check:baseline-label');
    return true;
  }
  if (file === 'docs/eval/briefs/manifest.jsonl') {
    selectedChecks.add('check:briefs');
    selectedChecks.add('check:disjoint');
    return true;
  }
  if (file.startsWith('docs/provenance/manifest')) {
    selectedChecks.add('lint:provenance');
    return true;
  }
  if (file.startsWith('assets/archetypes/') && file.endsWith('/set.json')) {
    selectedChecks.add('check:archetype-assets');
    return true;
  }
  if (file.startsWith('docs/design/archetypes/') && /\/step[^/]*\.(jpg|jpeg|png)$/.test(file)) {
    // A reference board is the subject of BOTH contracts: the framing rule that fails closed, and the
    // caption contract that pins every displayed board by SHA-256. Adding or replacing a board used to
    // select nothing at all, so a framed board could land with the smoke suite as its only gate.
    selectedChecks.add('check:archetype-frames');
    selectedChecks.add('check:board-captions');
    return true;
  }
  if (file.endsWith('.md')) {
    // Any markdown doc change must pass link and baseline label checks
    selectedChecks.add('check:doc-links');
    selectedChecks.add('check:baseline-label');
    return true;
  }
  return false;
}

// Deliberately inert files that need no checks
function isExempt(file) {
  return (
    file.endsWith('.jpg') ||
    file.endsWith('.png') ||
    file.endsWith('.svg') ||
    file.startsWith('.fleet/') ||
    file.startsWith('.beads/') ||
    file.startsWith('deploy/') ||
    file === '.gitignore' ||
    file === 'package-lock.json'
  );
}

for (const file of changedFiles) {
  // This independent edge prevents a mapping-only edit from deleting its own hash-test route
  // and falling back to smoke. The hash test pins the complete declared edge set.
  if (file === '.fleet/coverage-mapping.json') selectedSuites.add('test/coverage-map-invariant.test.mjs');
  // If the file itself is a test file
  if (file.startsWith('test/') && file.endsWith('.test.mjs')) {
    if (fs.existsSync(path.join(ROOT, file))) {
      selectedSuites.add(file);
    }
    continue;
  }

  // Route checked documentation or schema files. Routing no longer SKIPS the shared coverage contract:
  // a document can be the discovery input of a test suite - an archetype README is what the board
  // generator's `discoverFamilies()` reads, so adding one changes that suite's input while its gate ran
  // only the routed checks (the failure this switch fixes). The route is remembered and consulted at the
  // bottom of the loop, so an unmapped routed document still `continue`s exactly as before.
  const routedDocument = routeDocument(file);

  // Package.json changes affect package wiring and checks
  if (file === 'package.json') {
    selectedSuites.add('test/checks-wired.test.mjs');
    continue;
  }

  // Check script direct match
  if (checkScriptMap[file]) {
    selectedChecks.add(checkScriptMap[file]);
  }

  // Find all transitive dependents and collect any test suites among them
  const allDeps = getTransitiveDependents(file);
  let matched = false;

  for (const dep of allDeps) {
    if (dep.startsWith('test/') && dep.endsWith('.test.mjs')) {
      selectedSuites.add(dep);
      matched = true;
    }
    if (checkScriptMap[dep]) {
      selectedChecks.add(checkScriptMap[dep]);
      matched = true;
    }
  }

  // Name stem matching fallback (e.g. src/eval/foo.mjs -> test/foo.test.mjs)
  const stem = path.basename(file, path.extname(file));
  const candidateTest = `test/${stem}.test.mjs`;
  if (fs.existsSync(path.join(ROOT, candidateTest))) {
    selectedSuites.add(candidateTest);
    matched = true;
  }

  const prefixCheck = checkForPrefix(file);
  if (prefixCheck) {
    selectedChecks.add(prefixCheck);
    matched = true;
  }

  // Explicit coverage contract entry (validated wholesale at load — see coverageMapping above):
  // selecting the declared suites is all that remains to do here.
  const mappedSuites = coverageMapping[file];
  if (mappedSuites !== undefined) {
    for (const suite of mappedSuites) {
      selectedSuites.add(suite);
    }
    matched = true;
  }

  // Shared-contract glob entries (e.g. one pattern covering every archetype README), matched the same
  // way the oracle's fnmatch does. Exact keys are consulted first so a specific override still wins.
  for (const [, pattern, suites] of coveragePatterns) {
    if (pattern.test(file)) {
      for (const suite of suites) selectedSuites.add(suite);
      matched = true;
    }
  }

  if (routedDocument || matched || checkScriptMap[file]) {
    continue;
  }

  if (isExempt(file)) {
    continue;
  }

  unmappedFiles.push(file);
}

if (unmappedFiles.length > 0) {
  console.error('fast-gate: FAIL: unmapped changed files with no test or check coverage:');
  for (const u of unmappedFiles) {
    console.error(`  - ${u}`);
  }
  process.exit(1);
}

// If no specific suites or checks were selected, run smoke baseline
if (selectedSuites.size === 0 && selectedChecks.size === 0) {
  console.log('fast-gate: no specific test suites or checks selected for changes. Running smoke suite (test/checks-wired.test.mjs).');
  selectedSuites.add('test/checks-wired.test.mjs');
}

const suitesToRun = Array.from(selectedSuites).sort();
const checksToRun = Array.from(selectedChecks).sort();

// Listing mode (FAST_GATE_LIST=1): print the selection and exit without executing anything. Used by
// test/fast-gate.test.mjs to pin mapping selections cheaply - the cdp.mjs contract maps to three
// BROWSER suites, and re-launching Chrome for every mapping assertion would tax every fast gate
// (docs/speed.md). The unmapped fail-closed check above still applies in this mode, so a listing
// can never paper over a file the gate cannot cover.
if (process.env.FAST_GATE_LIST) {
  console.log(`fast-gate: would run: checks=[${checksToRun.join(' ')}] suites=[${suitesToRun.join(' ')}]`);
  process.exit(0);
}

console.log(`fast-gate: running ${checksToRun.length} check(s) and ${suitesToRun.length} test suite(s)`);

for (const chk of checksToRun) {
  console.log(`fast-gate: running check npm run ${chk}`);
  const res = spawnSync('npm', ['run', chk], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`fast-gate: check ${chk} failed with exit code ${res.status}`);
    process.exit(res.status || 1);
  }
}

if (suitesToRun.length > 0) {
  const res = spawnSync('node', ['--test', ...suitesToRun], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (res.status !== 0) {
    console.error(`fast-gate: tests failed with exit code ${res.status}`);
    process.exit(res.status || 1);
  }
}

// Log execution completion markers in formats recognised by fleet-check / check-coverage.py
console.log(`fast-gate: passed: ${suitesToRun.join(' ')}`);
process.exit(0);
