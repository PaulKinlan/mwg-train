#!/usr/bin/env node
/**
 * Scaffold the training corpus from the tr-* briefs, one project per family x framework.
 *
 *   node scripts/scaffold-training-corpus.mjs                              # all 30 families x 7 frameworks
 *   node scripts/scaffold-training-corpus.mjs --families tr-01,tr-02        # a bounded tranche
 *   node scripts/scaffold-training-corpus.mjs --clean --out <dir>           # wipe and rebuild
 *
 * The briefs manifest (`docs/train/briefs/manifest.jsonl`) is the source of truth for the tr-* corpus.
 * Each family maps to a training archetype by its `archetype` field (looked up in
 * pilot/training-archetypes.mjs, NOT the pilot table), and the family's own `topic`/`routes` shape the
 * concrete archetype so a family is its brief's app, not the archetype's generic example. Every family
 * is then built across the seven rendering frameworks in pilot/frameworks.mjs via the same
 * `buildProjectFor` the pilot uses.
 *
 * The record mirrors `pilot/CORPUS.json`: one entry per project with its tree hash. After writing, the
 * script asserts the whole point of the bead - zero overlap with the pilot/evaluation designs - by
 * comparing every generated tree hash against both the original and uplifted hashes recorded in
 * pilot/CORPUS.json. A collision is a BLOCKER (exit 1), never a hidden note. It also refuses any
 * family_id that is not a tr-* id.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { buildProjectFor, FRAMEWORKS } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';
import { hashTree } from '../src/corpus/harness.mjs';

const FRAMEWORK_NAMES = Object.keys(FRAMEWORKS);
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const MANIFEST_PATH = 'docs/train/briefs/manifest.jsonl';
const PILOT_CORPUS_PATH = 'pilot/CORPUS.json';

const refPlaceholder = '${ref}';

const capitalize = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

const titleCase = (value) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => capitalize(word))
    .join(' ');

/**
 * The prose defects a repair brief seeds, mapped to the concrete tokens the builder injects.
 *
 * The builder reacts to the pilot's fixed vocabulary (`no-required`, `eager-invalid`, `no-aria-sync`,
 * `no-autofill`, `no-autofill-address`, `xss-innerhtml`) plus four training-only tokens
 * (`client-only-state`, `enter-submits`, `accept-invalid-amount`, `no-field-labels`). Order matches the
 * brief's `seeded_defects`, one entry per prose defect; `token: null` marks a defect that has no
 * faithful code expression and is reported as `unrepresentable` rather than silently dropped.
 */
const REPAIR_DEFECT_TOKENS = {
  'tr-26': [
    { token: 'client-only-state' },
    { token: 'no-aria-sync' },
    { token: 'enter-submits' },
  ],
  'tr-27': [
    { token: 'client-only-state' },
    { token: null, reason: 'the brief describes pew seat selectors as plain divs without tabindex/keyboard activation, but the generated booking form has no seat picker - it renders a native select with a programmatic label' },
    { token: 'no-required' },
  ],
  'tr-28': [
    { token: 'client-only-state' },
    { token: null, reason: 'the brief describes a custom div-based urgency dropdown, but the generated helpdesk form renders a native select with a programmatic label' },
    { token: 'no-required' },
  ],
  'tr-29': [
    { token: 'client-only-state' },
    { token: 'accept-invalid-amount' },
    { token: 'no-field-labels', note: 'the brief names a dedication input the archetype does not model; no-field-labels drops the label on the non-select fields (member, vendor, amount), so the amount input is the covered case' },
  ],
  'tr-30': [
    { token: 'client-only-state' },
    { token: 'enter-submits' },
    { token: 'no-aria-sync' },
  ],
};

/**
 * Resolve a family's prose `seeded_defects` into the tokens the builder injects, plus the prose that
 * could not be represented and any per-defect caveats. Generate families have no defects.
 */
function defectsForFamily(family) {
  if (family.task !== 'repair') return { injected: [], unrepresentable: [], notes: [] };
  const mapping = REPAIR_DEFECT_TOKENS[family.family_id] ?? [];
  const injected = [];
  const unrepresentable = [];
  const notes = [];
  family.seeded_defects.forEach((defect, index) => {
    const entry = mapping[index];
    if (!entry) {
      unrepresentable.push({ defect, reason: 'no token mapping recorded for this defect' });
      return;
    }
    if (entry.token) {
      injected.push(entry.token);
      if (entry.note) notes.push(entry.note);
    } else {
      unrepresentable.push({ defect, reason: entry.reason });
    }
  });
  return { injected, unrepresentable, notes };
}

function parseArgs(argv) {
  const args = {
    out: 'pilot/training-projects',
    record: 'pilot/TRAINING_CORPUS.json',
    manifest: MANIFEST_PATH,
    families: null,
    clean: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--record') args.record = argv[++i];
    else if (argv[i] === '--manifest') args.manifest = argv[++i];
    else if (argv[i] === '--families') args.families = argv[++i];
    else if (argv[i] === '--clean') args.clean = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`scaffold-training-corpus: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

/** The canonical (v1) row for each family: variants differ only in prompt/brief_id/variant_of. */
function canonicalFamilies(manifestPath) {
  const text = readFileSync(resolve(REPO_ROOT, manifestPath), 'utf8');
  const rows = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const byFamily = new Map();
  for (const row of rows) {
    if (!byFamily.has(row.family_id) || row.variant_of === null) byFamily.set(row.family_id, row);
  }
  return [...byFamily.values()].sort((a, b) => a.family_id.localeCompare(b.family_id));
}

/** Derive the brief's write/read paths into the canonical route shape the builder's server supports. */
function deriveRoutes(family, base) {
  const baseWrite = base.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'));
  const baseRead = base.routes.find((route) => route.kind === 'read-by-reference');

  // Read path: prefer the parameterised path a GET assertion names ("GET /passes/:id displays ..."),
  // because the write route itself may be a nested `/x/:id/y` POST that would otherwise be mistaken for
  // the read route. Fall back to the family's first parameterised route, then the base read path, and
  // normalise any `:param` to the server's `:ref` spelling (the generic server only rewrites `:ref`).
  const readFromAssertion = family.assertions
    .map((assertion) => assertion.match(/^GET\s+(\S+)/)?.[1])
    .find((path) => path && /:[A-Za-z0-9_]+/.test(path));
  const familyRead = readFromAssertion ?? family.routes.find((route) => /:[A-Za-z0-9_]+/.test(route));
  const readPath = (familyRead ?? baseRead?.path ?? '/record/:ref').replace(/:[A-Za-z0-9_]+/g, ':ref');

  // Write path: the family's POST path from its assertions, taken verbatim including any :param (the
  // server now matches a parameterised write route with the same :param-to-capture rewrite it uses for
  // the read route, so `/x/:id/y` is served rather than silently falling back to the archetype's path).
  let writePath = baseWrite?.path ?? '/submit';
  const postAssertion = family.assertions.find((assertion) => /^POST\s+\S+/.test(assertion));
  if (postAssertion) {
    writePath = postAssertion.match(/^POST\s+(\S+)/)[1];
  }

  const redirectPath = readPath.replace(/:[A-Za-z0-9_]+/g, refPlaceholder);
  const routes = [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: writePath, kind: baseWrite?.kind ?? 'write', redirect: () => redirectPath },
    { method: 'GET', path: readPath, kind: 'read-by-reference' },
  ];
  for (const path of family.routes) {
    if (path === '/' || path === writePath || path === readPath) continue;
    if (/:[A-Za-z0-9_]+/.test(path)) continue;
    routes.push({ method: 'GET', path, kind: 'list' });
  }
  return routes;
}

/**
 * The concrete archetype for one family: the base archetype's fields/echo/journey, with the family's
 * own title and story (so the app is the brief's app) and - for non-session flows - its own routes.
 * Session flows keep their canonical routes because the cookie + read-session redirect is part of the
 * archetype, not the brief.
 */
function familyArchetype(family, base) {
  const overrides = {
    title: titleCase(family.topic),
    story: `${capitalize(family.topic)}: a server-backed flow that stores each submission and shows it back on reload.`,
  };
  if (!base.session) overrides.routes = deriveRoutes(family, base);
  return { ...base, ...overrides };
}

function writeProjectTree(outDir, projectId, files, spec) {
  const dir = join(outDir, projectId);
  for (const [rel, content] of Object.entries(files)) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  writeFileSync(join(dir, 'spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: `train-${projectId}`, private: true, type: 'module', scripts: { start: 'node server.mjs' } }, null, 2)}\n`,
  );
  return dir;
}

/** Collect every pilot tree hash (original + uplift) so a collision is a hard failure. */
function pilotHashes() {
  const recorded = JSON.parse(readFileSync(resolve(REPO_ROOT, PILOT_CORPUS_PATH), 'utf8'));
  return new Set(recorded.projects.flatMap((project) => [project.original_sha, project.uplift_sha]));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error('usage: node scripts/scaffold-training-corpus.mjs [--out <dir>] [--record <file>] [--families tr-01,tr-02] [--clean]');
    process.exit(0);
  }

  const families = canonicalFamilies(args.manifest);
  const selected = args.families
    ? families.filter((family) => args.families.split(',').map((id) => id.trim()).includes(family.family_id))
    : families;
  if (selected.length === 0) {
    console.error('scaffold-training-corpus: no families selected');
    process.exit(2);
  }

  const outDir = resolve(REPO_ROOT, args.out);
  const recordPath = resolve(REPO_ROOT, args.record);
  if (args.clean) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const projects = [];
  const byArchetype = {};
  const byFramework = {};
  const collisions = [];
  const badFamilies = [];
  const pilot = pilotHashes();

  for (const family of selected) {
    const base = TRAINING_ARCHETYPES[family.archetype];
    if (!base) {
      console.error(`scaffold-training-corpus: unknown archetype '${family.archetype}' for ${family.family_id}`);
      process.exit(2);
    }
    if (!/^tr-\d{2}$/.test(family.family_id)) badFamilies.push(family.family_id);
    const archetype = familyArchetype(family, base);
    const { injected, unrepresentable, notes } = defectsForFamily(family);
    const emittedWriteRoute = archetype.routes.find((route) => route.method === 'POST' && route.kind.startsWith('write'))?.path ?? null;
    const briefWriteRoute = family.assertions.map((assertion) => assertion.match(/^POST\s+(\S+)/)?.[1]).find(Boolean) ?? null;
    const routeConformed = briefWriteRoute === null || briefWriteRoute === emittedWriteRoute;
    for (const frameworkName of FRAMEWORK_NAMES) {
      const projectId = `${family.family_id}-${frameworkName}`;
      const built = buildProjectFor(archetype, { frameworkName, defects: injected, flags: {} });
      // The builder names a project after the archetype; the corpus record names it after the family,
      // because seven families can share one archetype and their projects must not share a directory.
      built.spec.project_id = projectId;
      writeProjectTree(outDir, projectId, built.files, built.spec);
      const treeSha = hashTree(join(outDir, projectId));
      if (pilot.has(treeSha)) collisions.push({ project_id: projectId, tree_sha: treeSha });
      projects.push({
        project_id: projectId,
        family_id: family.family_id,
        brief_id: family.brief_id,
        archetype: family.archetype,
        framework: frameworkName,
        task: family.task,
        defects: injected,
        seeded_defects: family.seeded_defects,
        ...(unrepresentable.length > 0 ? { unrepresentable } : {}),
        ...(notes.length > 0 ? { notes } : {}),
        route_conformed: routeConformed,
        brief_write_route: briefWriteRoute,
        emitted_write_route: emittedWriteRoute,
        topic: family.topic,
        routes: family.routes,
        tree_sha: treeSha,
      });
      byArchetype[family.archetype] = (byArchetype[family.archetype] ?? 0) + 1;
      byFramework[frameworkName] = (byFramework[frameworkName] ?? 0) + 1;
    }
  }

  const record = {
    $comment:
      'The training corpus generated from the tr-* briefs: one project per family x framework, each with its tree hash. `node scripts/scaffold-training-corpus.mjs` re-derives every tree; a hash here must never collide with a hash in pilot/CORPUS.json (original or uplift), which is the disjointness the corpus exists to guarantee.',
    generated_at: new Date().toISOString(),
    generator: 'scripts/scaffold-training-corpus.mjs',
    summary: {
      families: selected.length,
      frameworks: FRAMEWORK_NAMES.length,
      projects: projects.length,
      by_archetype: byArchetype,
      by_framework: byFramework,
    },
    projects,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`scaffold-training-corpus: wrote ${projects.length} projects to ${args.out}`);
  console.log(`scaffold-training-corpus: record at ${args.record}`);
  console.log(`scaffold-training-corpus: frameworks ${JSON.stringify(byFramework)}`);

  // The disjointness assertions: every generated tree must be absent from the pilot's recorded
  // originals and uplifts, and every family id must be a tr-* id (never cf-*/fam-* or a target family).
  if (badFamilies.length > 0) {
    console.error(`scaffold-training-corpus: BLOCKER - non-tr family ids ${JSON.stringify(badFamilies)}`);
    process.exit(1);
  }
  console.log(`scaffold-training-corpus: family ids all tr-* (${selected.length} family(s))`);
  if (collisions.length > 0) {
    console.error(`scaffold-training-corpus: BLOCKER - ${collisions.length} training tree(s) reproduce a pilot/evaluation design:`);
    for (const collision of collisions) console.error(`  - ${collision.project_id} ${collision.tree_sha}`);
    process.exit(1);
  }
  console.log(`scaffold-training-corpus: zero-overlap PASS - 0 of ${projects.length} tree hashes collide with pilot/CORPUS.json (original+uplift)`);
}

main();
