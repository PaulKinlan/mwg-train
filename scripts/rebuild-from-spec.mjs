#!/usr/bin/env node
/**
 * Rebuild a pilot project from its durable specification alone.
 *
 *   node scripts/rebuild-from-spec.mjs --family booking
 *   node scripts/rebuild-from-spec.mjs --family booking --run        # also drive the journeys in a browser
 *   node scripts/rebuild-from-spec.mjs --all                        # every family, every framework
 *
 * `--bound <seconds>` (default 900) is a hard deadline: when it passes, the browser is closed and the
 * script exits non-zero, so a run whose parent died cannot leave a headless Chrome behind.
 *
 * "Alone" is meant literally: this file imports the specification loader and the framework templates,
 * and neither of them imports `pilot/archetypes.mjs`. The archetype the templates consume is built from
 * the specification by `archetypeFromSpec`. `test/spec.test.mjs` asserts that no module on this path
 * imports the archetype table, so the sentence cannot quietly stop being true.
 *
 * What is checked:
 *   - the rebuilt tree hash equals the hash `pilot/CORPUS.json` recorded for that project when the pilot
 *     measured it, using the defects the plan seeds - so the specification rebuilds the *measured*
 *     artefact, not merely an equivalent one;
 *   - with --run, the project is started and its journeys are driven in a real browser and passed
 *     through the same acceptance function the pilot uses.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { journeyWorks } from '../src/corpus/accept.mjs';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { hashTree, runProjectVersion } from '../src/corpus/harness.mjs';
import { buildProjectFromSpec, specForFamily } from '../src/eval/spec.mjs';
import { writeProject } from '../pilot/frameworks.mjs';

const ROOT = resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const args = { family: null, all: false, framework: null, run: false, out: null, port: 5400, bound: 900 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--family') args.family = argv[++i];
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--framework') args.framework = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--run') args.run = true;
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--bound') args.bound = Number(argv[++i]);
  }
  return args;
}

/**
 * Kill this process's own direct children.
 *
 * The bound below exits without unwinding `runProjectVersion`, and the project server is spawned as a
 * child: if the parent goes first it is reparented and keeps holding the port, which is how a bounded run
 * traded a leaked browser for a leaked server and made the next run fail against a stale one.
 */
function killChildren() {
  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
        const afterName = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        if (Number(afterName[1]) !== process.pid) continue;
        // The child's own process group first, so its whole tree goes: a browser spawned detached leaves
        // children that do not carry the profile directory, and they outlive a kill aimed at the parent.
        try {
          process.kill(-Number(entry), 'SIGKILL');
        } catch {
          process.kill(Number(entry), 'SIGKILL');
        }
      } catch {
        /* exited between listing and reading */
      }
    }
  } catch {
    /* not Linux, or /proc is unavailable: nothing to reap */
  }
}

/** Write the built project the same way the scaffolder does, so the tree hashes are comparable. */
function write(built, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  writeProject(outDir, built);
  return built.spec;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = JSON.parse(readFileSync(join(ROOT, 'pilot/plan.json'), 'utf8'));
  const corpus = JSON.parse(readFileSync(join(ROOT, 'pilot/CORPUS.json'), 'utf8'));
  const recorded = new Map(corpus.projects.map((entry) => [entry.project_id, entry.original_sha]));

  const families = args.all ? [...new Set(plan.projects.map((entry) => entry.archetype))] : [args.family];
  if (!families[0]) throw new Error('rebuild-from-spec: pass --family <id> or --all');

  const planned = plan.projects.filter((entry) => families.includes(entry.archetype) && (!args.framework || entry.framework === args.framework));
  if (planned.length === 0) throw new Error(`rebuild-from-spec: the plan has no project for ${families.join(', ')}`);

  const runDir = join(ROOT, '.spec-rebuild');
  mkdirSync(runDir, { recursive: true });
  const chrome = args.run ? await launchChrome() : null;
  // A hard self-bound, because a browser must not outlive the run that started it. A subagent whose model
  // was cut off mid-verification left a headless Chrome running for 46 minutes until the reaper caught it;
  // the `finally` below only helps a process that gets to run. This timer fires whether or not anything is
  // left to observe it, closes the browser, and exits non-zero so an abandoned run cannot look like a pass.
  const guard = setTimeout(async () => {
    console.error(`rebuild-from-spec: bound of ${args.bound}s reached; closing the browser and exiting`);
    try {
      if (chrome) await chrome.close();
    } catch {
      // the browser may already be gone; the point is to leave nothing behind
    }
    killChildren();
    if (!args.out) rmSync(runDir, { recursive: true, force: true });
    process.exit(1);
  }, args.bound * 1000);
  let port = args.port;
  let failures = 0;
  try {
    for (const entry of planned) {
      const spec = specForFamily(entry.archetype, ROOT);
      const built = buildProjectFromSpec({ spec, frameworkName: entry.framework, defects: entry.defects });
      const outDir = args.out ? resolve(args.out) : join(runDir, built.projectId);
      const projectSpec = write(built, outDir);
      const hash = hashTree(outDir);
      const expected = recorded.get(built.projectId);
      const matches = expected === undefined ? null : expected === hash;

      console.log(`rebuild-from-spec: ${built.projectId} -> ${hash}`);
      if (matches === null) console.log('  (no recorded hash: this project is not in the measured corpus)');
      else console.log(`  recorded corpus hash ${expected} : ${matches ? 'MATCH' : 'DIFFERENT'}`);
      if (matches === false) failures += 1;

      if (args.run && chrome) {
        // The rebuilt project is measured exactly as the pilot measures an original: same server, same
        // journeys, same acceptance function.
        const record = await runProjectVersion({
          chrome,
          projectDir: outDir,
          spec: projectSpec,
          label: 'rebuilt',
          port: port++,
          runDir,
          dbPath: join(runDir, `${built.projectId}.sqlite`),
        });
        const works = journeyWorks({
          ...record,
          echo_expect: projectSpec.echo_expect,
          expected_write_journey: Boolean(projectSpec.write_journey),
        });
        const path = (value) => {
          try {
            return new URL(value).pathname;
          } catch {
            return value;
          }
        };
        const names = (record.journeys ?? [])
          .map((journey) => {
            // A journey records its outcome in the fields it observed, not in a single `status`: the
            // persistence journey carries the echoed text and the reloaded page, the validation journey
            // the refusal it watched the server give, the content journey the URL it landed on.
            const observed = [
              journey.serverRefused === undefined ? null : `serverRefused=${journey.serverRefused}`,
              journey.echoedText ? `echoed=${JSON.stringify(journey.echoedText.slice(0, 40))}` : null,
              journey.persistedText ? `reloadedText=${journey.persistedText.length}b` : null,
              journey.afterSubmit ? `landed=${path(journey.afterSubmit)}` : null,
              journey.url ? `url=${path(journey.url)}` : null,
            ].filter(Boolean).join(' ');
            return `${journey.name}[${observed}]`;
          })
          .join('\n    ');
        console.log(`  journeys ${names}`);
        console.log(`  acceptance (the pilot's own function): ${works.ok ? 'PASS' : 'FAIL'}`);
        if (!works.ok) {
          failures += 1;
          for (const problem of works.problems) console.log(`    ${problem}`);
        }
        // Two measurement vectors run against the rebuilt project and both are reported.
        //
        // `rules` are the substantive measurement, gated by the specification's own `required_rules`, so an
        // `ERROR` there means a rule could not measure at all - a real failure of the rebuild. A `FAIL` is
        // the expected state for a rebuilt original: the originals carry the gaps the uplift is measured
        // against.
        //
        // `security` runs unconditionally in the harness, including for families that have no session, so
        // an `ERROR` there is an inapplicable check rather than a broken rebuild: booking reports
        // `session-cookie-attributes` as ERROR because nothing sets a cookie, and the committed corpus
        // records the same check as not passing for it. Reported, not counted.
        for (const [label, entries, key, counted] of [
          ['rules', record.rules ?? [], 'rule', true],
          ['security rules', record.security ?? [], 'check', false],
        ]) {
          if (entries.length === 0) continue;
          console.log(`  ${label} [${entries.map((entry) => `${entry[key]}:${entry.status}`).join(', ')}]`);
          if (!counted) continue;
          const errored = entries.filter((entry) => entry.status === 'ERROR');
          if (errored.length > 0) {
            failures += 1;
            for (const entry of errored) console.log(`    ${entry[key]}: ${entry.detail}`);
          }
        }
      }
    }
  } finally {
    clearTimeout(guard);
    if (chrome) await chrome.close();
    if (!args.out) rmSync(runDir, { recursive: true, force: true });
  }
  console.log(`rebuild-from-spec: ${planned.length} project(s), ${failures} failure(s)`);
  if (failures > 0) process.exitCode = 1;
}

await main();
