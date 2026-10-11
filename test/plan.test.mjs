/**
 * The plan's own checks.
 *
 * plan.md is the top-level document Paul reviews, and the failure mode it exists to prevent is
 * drift: a plan that cites a command nobody can run, a path that is not there, a seal that has
 * moved, or a stage it says is unbuilt while the command for it exists. Every one of those is
 * checkable against the checkout, so this file checks them instead of trusting a reviewer to
 * notice. A plan is only as current as the thing that fails when it stops being true.
 *
 * Not checked here, deliberately: the numbers in the tables (they are measured by the commands
 * plan.md itself names, and pinning them would just move the snapshot into two files).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASELINE_LABEL } from '../src/eval/ruleset.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_PATH = resolve(ROOT, 'plan.md');
const plan = readFileSync(PLAN_PATH, 'utf8');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

/** A snapshot marker, so the "where it is right now" claim is machine-checkable. */
const SNAPSHOT = plan.match(/<!-- snapshot: ([0-9a-f]{7,40}) (\d{4}-\d{2}-\d{2}) -->/);

test('the plan exists at the repository root and the README points at it', () => {
  assert.equal(existsSync(PLAN_PATH), true, 'plan.md should exist at the repository root');
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /\]\(plan\.md\)/, 'README.md should link to plan.md');
});

test('the plan carries the sections a reader needs, in order', () => {
  const headings = [...plan.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const expected = [
    /what this project is for/i,
    /eight-step lifecycle/i,
    /seven deterministic stages/i,
    /where it is right now/i,
    /in flight/i,
    /next step/i,
    /open questions/i,
    /four roles/i,
    /how to check this file/i,
  ];
  let cursor = -1;
  for (const pattern of expected) {
    const index = headings.findIndex((heading) => pattern.test(heading));
    assert.notEqual(index, -1, `plan.md is missing a section matching ${pattern}`);
    assert.ok(index > cursor, `plan.md section "${headings[index]}" is out of order`);
    cursor = index;
  }
});

test('every npm script the plan cites exists', () => {
  const cited = new Set([...plan.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)].map((match) => match[1]));
  assert.ok(cited.size >= 8, `expected the plan to name its commands, found ${cited.size}`);
  for (const name of cited) {
    assert.ok(Object.hasOwn(pkg.scripts, name), `plan.md cites "npm run ${name}", which package.json does not define`);
    assert.equal(pkg.scripts[name], pkg.scripts[name].trim(), `${name} has a padded value`);
  }
});

test('every repository path the plan cites is on disk, and every path it calls absent really is', () => {
  // A path the plan names as ABSENT (followed by "(absent)") is a claim about the tree too - and the
  // one claim that gets stale in the flattering direction, because the file appearing means the plan
  // now says something is missing that is there. So it is asserted, not skipped (review finding
  // mwg-train-sk5: the first version stripped these paths from the check instead).
  const absent = [...plan.matchAll(/`([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)`[^\n]{0,4}\(absent\)/g)].map((match) => match[1]);
  assert.ok(absent.length >= 1, 'the plan should name what is deliberately absent (the promotion ledger)');
  for (const path of absent) {
    assert.equal(existsSync(resolve(ROOT, path)), false, `plan.md calls ${path} absent, but it is in the tree now - update the plan`);
  }

  // Backticked, slash-bearing, literal paths only: globs and <placeholders> say what they are, and
  // anything without a slash is prose rather than a claim about a file.
  const checkable = plan.replace(/`[^`]+`[^\n]{0,4}\(absent\)/g, '');
  const cited = new Set(
    [...checkable.matchAll(/`([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)`/g)]
      .map((match) => match[1])
      // A ref (origin/main, HEAD~1) is a git name, not a path in the tree, and a placeholder or a glob
      // says what it is; everything else is a claim that something is on disk.
      .filter((path) => !path.includes('<') && !path.includes('*') && !/^(origin|upstream|HEAD)\/?/.test(path)),
  );
  assert.ok(cited.size >= 15, `expected the plan to cite real paths, found ${cited.size}`);
  for (const path of cited) {
    assert.equal(existsSync(resolve(ROOT, path)), true, `plan.md cites ${path}, which is not in the tree`);
  }
});

test('every relative link in the plan resolves', () => {
  const targets = new Set(
    [...plan.matchAll(/\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .filter((target) => !target.startsWith('http') && !target.startsWith('#')),
  );
  assert.ok(targets.size >= 20, `expected the plan to link its sources, found ${targets.size}`);
  for (const target of targets) {
    const path = target.split('#')[0];
    assert.equal(existsSync(resolve(ROOT, path)), true, `plan.md links to ${target}, which does not resolve`);
  }
});

test('every commit sha the plan cites is in history, and dated as its row says', () => {
  // The failure this catches is mine: the first version of plan.md pinned the build-key landing to
  // `2927788`, a sha that does not exist, taken from a briefing instead of from git. Every backticked
  // bare hex sha is resolved, and each landings row's date is compared with its commit's own date so
  // a wrong-but-existing sha is caught too. It does not prove the commit did what the row says.
  const cited = [...plan.matchAll(/`([0-9a-f]{7,40})`/g)].map((match) => match[1]);
  assert.ok(cited.length >= 5, `expected the plan to pin its landings by sha, found ${cited.length}`);
  for (const sha of cited) {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  }
  const rows = [...plan.matchAll(/^\| (\d{4}-\d{2}-\d{2}) \|[^\n]*?\| `([0-9a-f]{7,40})` \|$/gm)];
  assert.ok(rows.length >= 5, `expected dated landing rows, found ${rows.length}`);
  for (const [, date, sha] of rows) {
    const committed = execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', sha], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.equal(committed, date, `the landing row says ${sha} is ${date}, but ${sha} is dated ${committed}`);
  }
});

test('the plan carries the attribution label the repository requires', () => {
  // plan.md is registered as a floor-report in scripts/check-baseline-label.mjs, because it quotes our own
  // measured numbers rather than only describing the pipeline - and every floor report MUST carry this
  // label, so that nobody reads our deterministic floor as an official web-uplift result. The check itself
  // is what enforces it (it caught this file's absence from the registry on the merger's full gate); this
  // assertion keeps the label tied to the one source of truth for the string.
  assert.ok(
    plan.includes(BASELINE_LABEL),
    `plan.md must carry the baseline label ${JSON.stringify(BASELINE_LABEL)}`,
  );
});

test('the seal quoted in the plan is the seal the check pins', () => {
  const inPlan = plan.match(/sha256:[0-9a-f]{64}/);
  assert.ok(inPlan, 'plan.md should quote the preregistered brief seal');
  const pinned = pkg.scripts['check:briefs'].match(/sha256:[0-9a-f]{64}/);
  assert.ok(pinned, 'check:briefs should pin a seal');
  assert.equal(inPlan[0], pinned[0], 'the seal in plan.md has moved away from the one check:briefs enforces');
});

test('the snapshot names a commit that is in history, dated as the plan says', () => {
  assert.ok(SNAPSHOT, 'plan.md needs a `<!-- snapshot: <sha> <YYYY-MM-DD> -->` marker');
  const [, sha, date] = SNAPSHOT;
  const resolved = execFileSync('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.ok(resolved.startsWith(sha), `${sha} should resolve to a commit`);
  const committed = execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', resolved], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(committed, date, `the snapshot date ${date} should be the date of ${sha} (${committed})`);
});

test('stage 7 is described the same way the repository is built', () => {
  // The drift this catches: a training command appears and the plan still says no run has happened
  // (or the reverse - the plan announces a training run while nothing can perform one).
  const trainingScripts = Object.keys(pkg.scripts).filter((name) => /^train:(fit|run|adapter|model)/.test(name));
  const planSaysUnimplemented = /(\*\*Seam built, never run\.\*\*)/.test(plan);
  if (trainingScripts.length === 0) {
    assert.equal(planSaysUnimplemented, true, 'no training script exists, so the plan must not claim stage 7 runs');
  } else {
    assert.equal(
      planSaysUnimplemented,
      false,
      `package.json now defines ${trainingScripts.join(', ')} - update the stage 7 row in plan.md`,
    );
  }
});
