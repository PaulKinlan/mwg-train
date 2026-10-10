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
 * pilot/training-archetypes.mjs, NOT the pilot table), and the family's own `topic`/`routes` relabel the
 * concrete archetype's title, story, and routes. The family's `fields` and `journey` - authored in the
 * brief - are what the form renders and what the harness drives, so the archetype supplies the server
 * shape around the form rather than the form itself. Every family
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
import { fileURLToPath } from 'node:url';

import { buildProjectFor, FRAMEWORKS } from '../pilot/frameworks.mjs';
import { TRAINING_ARCHETYPES } from '../pilot/training-archetypes.mjs';
import { builderFields, echoFieldFor, validateBriefSchema } from '../src/train/brief-schema.mjs';
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
 * Each repair family's `seeded_defects` in docs/train/briefs/manifest.jsonl describes exactly the
 * observable defects that family's generated project has, matching the builder's injected defect tokens
 * 1-to-1 in order. Every repair family includes at least one uplift-addressable defect token
 * (`no-required`, `no-aria-sync`, etc.).
 *
 * The scaffolder asserts that the brief's prose defects match this mapping in cardinality and semantic
 * keywords so the brief prose and the injected tokens cannot silently drift apart.
 */
const REPAIR_DEFECT_TOKENS = {
  'tr-26': [
    { token: 'no-aria-sync' },
    { token: 'enter-submits' },
  ],
  'tr-27': [
    { token: 'no-required' },
  ],
  'tr-28': [
    { token: 'no-required' },
  ],
  'tr-29': [
    { token: 'accept-invalid-amount' },
    { token: 'no-field-labels', note: 'drops the label on the non-select fields (member, vendor, amount)' },
    { token: 'no-required' },
  ],
  'tr-30': [
    { token: 'enter-submits' },
    { token: 'no-aria-sync' },
  ],
};

const DEFECT_PROSE_PATTERNS = {
  'no-aria-sync': /aria|screen reader|announcement|alert/i,
  'enter-submits': /enter.*submi/i,
  'no-required': /required|fails silently|empty|corrupted/i,
  'accept-invalid-amount': /invalid.*amount|negative.*amount/i,
  'no-field-labels': /label/i,
};

/**
 * The defect tokens the uplift tool's TRANSFORMS (src/corpus/uplift.mjs) can actually fix, keyed to the
 * rule id its transform implements. This is the checkable linkage between a seeded token and the
 * measured property the uplift can improve - read from the transform code, never inferred from the
 * token name. Tokens absent from this map (or with `addressable: false`) have no transform.
 */
const DEFECT_ADDRESSABILITY = {
  'no-required': { addressable: true, rule: 'forms/required-field-feedback' },
  'eager-invalid': { addressable: true, rule: 'forms/validate-input-after-interaction' },
  'no-aria-sync': { addressable: true, rule: 'accessibility/accessible-error-announcement' },
  'no-autofill': { addressable: true, rule: 'forms/autofill-sign-up-form (and forms/autofill-address-form where the archetype declares those fields)' },
  'no-autofill-address': { addressable: true, rule: 'forms/autofill-address-form' },
  'xss-innerhtml': { addressable: true, rule: 'security/sanitize-untrusted-html' },
  'client-only-state': { addressable: false, reason: 'deletes the server INSERT; outside the uplift contract and makes the original non-runnable' },
  'enter-submits': { addressable: false, reason: 'no uplift transform measures or rewrites premature Enter submission' },
  'accept-invalid-amount': { addressable: false, reason: 'no uplift transform for the min attribute or server-side bound' },
  'no-field-labels': { addressable: false, reason: 'no uplift transform for field labels' },
};

/**
 * Generate families' briefs carry no seeded defect (they are build-new tasks), so their originals were
 * clean and the uplift made zero edits - exactly the "no-warranted-change" that accepted 0 generate
 * pairs. Seed one uniformly addressable defect (no-required → forms/required-field-feedback) so every
 * generate original has a warranted change the uplift can make.
 */
const GENERATE_DEFECT_TOKEN = 'no-required';

/**
 * Resolve a family's prose `seeded_defects` into the tokens the builder injects, plus the prose that
 * could not be represented and any per-defect caveats. Generate families have no prose defects, so they
 * receive one uniformly addressable injected defect (GENERATE_DEFECT_TOKEN).
 */
function defectsForFamily(family) {
  const injected = [];
  const unrepresentable = [];
  const notes = [];
  if (family.task === 'repair') {
    const mapping = REPAIR_DEFECT_TOKENS[family.family_id];
    if (!mapping) {
      throw new Error(`scaffold-training-corpus: repair family '${family.family_id}' has no REPAIR_DEFECT_TOKENS entry`);
    }
    if (family.seeded_defects.length !== mapping.length) {
      throw new Error(
        `scaffold-training-corpus: repair family '${family.family_id}' brief seeded_defects length (${family.seeded_defects.length}) does not match mapping length (${mapping.length})`
      );
    }
    family.seeded_defects.forEach((defect, index) => {
      const entry = mapping[index];
      if (!entry || !entry.token) {
        unrepresentable.push({ defect, reason: entry?.reason ?? 'no token mapping recorded for this defect' });
        return;
      }
      const pattern = DEFECT_PROSE_PATTERNS[entry.token];
      if (pattern && !pattern.test(defect)) {
        throw new Error(
          `scaffold-training-corpus: repair family '${family.family_id}' defect prose at index ${index} ("${defect}") does not match expected pattern for token '${entry.token}'`
        );
      }
      injected.push(entry.token);
      if (entry.note) notes.push(entry.note);
    });
  } else {
    // Generate families carry no prose defect, so seed one uniformly addressable defect: without it the
    // original is clean and the uplift makes zero edits (no warranted change to accept).
    injected.push(GENERATE_DEFECT_TOKEN);
  }
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
  // Compare placeholder-insensitively: a brief that writes `/enrolments/:id` and a read path of
  // `/enrolments/:ref` are the same route, and matching them literally emitted a duplicate of the
  // read route under the other spelling.
  const norm = (path) => path.replace(/:[A-Za-z0-9_]+/g, ':x');
  const taken = new Set([norm('/'), norm(writePath), norm(readPath)]);
  for (const path of family.routes) {
    if (taken.has(norm(path))) continue;
    // A parameterised route that is not the read path used to be dropped here, which is how tr-09,
    // tr-12, tr-13 and tr-16 came to be missing a listing's detail route (`/courses/:id`, `/jobs/:id`,
    // `/docs/:slug`, `/cultivars/:id`) - it was never emitted anywhere. It is emitted now as its own
    // kind rather than as `list`, because it is one item of a listing rather than the listing, and
    // rather than as `read-by-reference`, which reads a record a POST created rather than a listed
    // item. Serving it is the builder's job and lives in its own bead; emitting it is this one's, so
    // the corpus can no longer claim a route set it does not declare.
    if (/:[A-Za-z0-9_]+/.test(path)) {
      routes.push({ method: 'GET', path, kind: 'list-detail' });
      continue;
    }
    routes.push({ method: 'GET', path, kind: 'list' });
  }
  return routes;
}

/**
 * The concrete archetype for one family: the base archetype's fields/echo/journey are kept as-is, with
 * only the family's own title and story (and - for non-session flows - its own routes) relabelled, so
 * the result is an archetype-template project, not a brief-faithful implementation of the brief's flow.
 * Session flows keep their canonical routes because the cookie + read-session redirect is part of the
 * archetype, not the brief.
 */
function familyArchetype(family, base) {
  const overrides = {
    title: titleCase(family.topic),
    story: `${capitalize(family.topic)}: a server-backed flow that stores each submission and shows it back on reload.`,
  };
  if (!base.session) overrides.routes = deriveRoutes(family, base);
  // Opt in to the derived list-page handlers when this family actually declares a list route (mwg-train-ndr).
  // The capability is OPT-IN by design - `pilot/frameworks.mjs` states that a spec declaring no capability
  // regenerates byte-identically, which is the hard gate on the 35 frozen pilot trees - so the training
  // corpus has to ask for it rather than have it inferred for every archetype. It is derived from the routes
  // this family really carries, not hand-listed beside them, because the flag and the routes are the same
  // fact stated twice and the flag is the copy that goes stale. Before this, fifteen families declared a
  // `list` route and took the fallback branch instead, which served four hardcoded paths (/roster, /inbox,
  // /attendees, /cart) that no brief declares and answered the declared route with a 404.
  const routes = overrides.routes ?? base.routes;
  overrides.capabilities = { ...(base.capabilities ?? {}), list_pages: routes.some((route) => route.kind === 'list') };
  // A brief that carries its own schema supplies the form and the journey, so the
  // project renders what the brief describes rather than the archetype's form under a
  // different title. Without one, the family keeps the archetype's fields and journey.
  if (family.fields && family.journey) {
    // The server decides its required set as
    // `fields.filter(f => f.type !== 'select' && !f.optional)` (pilot/frameworks.mjs), while a
    // brief states requiredness as `required`. Without this translation every non-select field is
    // server-required no matter what the brief says, so a brief that marks a field optional would
    // render a form that agrees with it and a server that 422s the same POST - the form and the
    // server would disagree about the same field. tr-27 was rejected `original-not-runnable` for
    // exactly this: the journey filled its fields, but the server still demanded `phone`.
    overrides.fields = builderFields(family.fields);
    overrides.journey = family.journey;
    overrides.echo = { ...base.echo, field: echoFieldFor(family.fields) };
  }
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

/**
 * A re-scaffold that changes nothing must not change the record's bytes.
 *
 * generated_at used to be stamped on every run, so pilot/TRAINING_CORPUS.json was permanently dirty and
 * `git status` on it could not distinguish "the generator changed and the record is stale" - the condition the
 * hard-requirement test exists to catch - from "somebody re-ran the scaffolder". Keeping the previous stamp
 * whenever everything except the stamp is identical restores that signal.
 */
export function resolveGeneratedAt(previous, next) {
  const comparable = (value) =>
    value && typeof value === 'object' ? JSON.stringify({ ...value, generated_at: null }) : null;
  const before = comparable(previous);
  if (before === null || before !== comparable(next)) return next.generated_at;
  // A previous record carrying every other field but NO stamp would compare equal and then return undefined,
  // writing a record with no generated_at at all. Reviewer finding on the first version of this function.
  // Three instances of this class have now been found by enumeration - a missing key, an empty string, and a
  // whitespace-only string - and each fix was one more special case. Requiring a stamp that actually PARSES as a
  // date ends the class instead of naming a fourth: it subsumes the empty and whitespace cases and also rejects
  // a non-empty string that is not a timestamp at all.
  if (typeof previous.generated_at !== 'string' || Number.isNaN(Date.parse(previous.generated_at))) return next.generated_at;
  return previous.generated_at;
}

function readPreviousRecord(recordPath) {
  try {
    return JSON.parse(readFileSync(recordPath, 'utf8'));
  } catch {
    return null;
  }
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
    // A brief carrying its own schema must have one that builds: authoring a form whose
    // journey types into fields the brief does not declare would produce a project that
    // looks brief-faithful while exercising the wrong form, so it is refused here.
    if (family.fields || family.journey) {
      const schemaFindings = validateBriefSchema(family);
      if (schemaFindings.length > 0) {
        for (const finding of schemaFindings) {
          console.error(`scaffold-training-corpus: ${finding.brief_id} ${finding.at}: ${finding.problem}`);
        }
        process.exit(2);
      }
    }
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
        addressable_defects: injected.filter((token) => DEFECT_ADDRESSABILITY[token]?.addressable),
        seeded_defects: family.seeded_defects,
        ...(unrepresentable.length > 0 ? { unrepresentable } : {}),
        ...(notes.length > 0 ? { notes } : {}),
        route_conformed: routeConformed,
        brief_write_route: briefWriteRoute,
        emitted_write_route: emittedWriteRoute,
        schema_source: family.fields ? 'brief' : 'archetype',
        fields: archetype.fields,
        topic: family.topic,
        routes: family.routes,
        tree_sha: treeSha,
      });
      byArchetype[family.archetype] = (byArchetype[family.archetype] ?? 0) + 1;
      byFramework[frameworkName] = (byFramework[frameworkName] ?? 0) + 1;
    }
  }

  const pendingRecord = {
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
    defect_addressability: DEFECT_ADDRESSABILITY,
    projects,
  };

  const record = { ...pendingRecord, generated_at: resolveGeneratedAt(readPreviousRecord(recordPath), pendingRecord) };
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
