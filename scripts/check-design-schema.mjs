/**
 * check:design-schema - every per-demo design.md must describe the demo the generator actually
 * produces. The document is compared against a freshly generated project, so a token, route or file
 * the demo does not have is a finding rather than a style disagreement.
 *
 * The generated project goes to a temporary directory: nothing here writes into the repository, and
 * nothing touches the byte-frozen corpus.
 *
 * A link is resolved the way a reader resolves it - from the document's own directory - and must land
 * inside the repository. An out-of-repo target that happens to exist on the machine running the check
 * is not a link a reader can follow, so it is a finding rather than a pass. Note the link extraction
 * only reads inline `](target)` destinations: a title attribute or an angle-bracketed destination is
 * not matched, and no document here uses those forms. If that changes, this needs to learn them.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DESIGN_DIR, DESIGN_SECTIONS, PLAN_SECTIONS, checkDesignDocument, checkPlanDocument, repositoryLinkResolver } from '../src/design/contract.mjs';

const ROOT = new URL('../', import.meta.url);
// Canonical, because a checkout reached through a symlink would otherwise make containment a lexical
// question about a path string rather than a question about where the bytes actually are.
const rootPath = realpathSync(new URL(ROOT).pathname);

const { ARCHETYPES } = await import(pathToFileURL(join(rootPath, 'pilot/archetypes.mjs')));
const { FRAMEWORKS, buildProjectFor, writeProject } = await import(pathToFileURL(join(rootPath, 'pilot/frameworks.mjs')));
const { SPECS_DIR, specForFamily } = await import(pathToFileURL(join(rootPath, 'src/eval/spec.mjs')));

// A design.md documents one demo, so it is named after a framework. A plan.md documents one archetype's
// behaviour, so it is not - it is found by archetype instead, and a missing one is a finding rather than an
// absence, because the convention is that every archetype has both artefacts.
function designFiles() {
  if (!existsSync(join(rootPath, DESIGN_DIR))) return [];
  return readdirSync(join(rootPath, DESIGN_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((archetype) => readdirSync(join(rootPath, DESIGN_DIR, archetype.name))
      .filter((file) => file.endsWith('.md') && file !== 'plan.md')
      .map((file) => ({ archetype: archetype.name, framework: file.replace(/\.md$/, ''), file })));
}

const findings = [];
let checked = 0;

for (const { archetype, framework, file } of designFiles()) {
  const where = `${archetype}/${file}`;
  const archetypeDefinition = ARCHETYPES[archetype];
  if (!archetypeDefinition) {
    findings.push({ at: where, problem: `no archetype '${archetype}' is defined in pilot/archetypes.mjs` });
    continue;
  }
  if (!FRAMEWORKS[framework]) {
    findings.push({ at: where, problem: `no framework arm '${framework}' is defined in pilot/frameworks.mjs` });
    continue;
  }

  // Generate the demo the document claims to describe, read what came out, then remove it.
  const scratch = mkdtempSync(join(tmpdir(), 'design-contract-'));
  let demo;
  try {
    const built = buildProjectFor(archetypeDefinition, { frameworkName: framework });
    writeProject(join(scratch, framework), built);
    const projectDir = join(scratch, framework);
    const spec = JSON.parse(readFileSync(join(projectDir, 'spec.json'), 'utf8'));
    demo = {
      archetype,
      framework,
      files: readdirSync(projectDir, { recursive: true }).map(String).sort(),
      stylesheet: readFileSync(join(projectDir, FRAMEWORKS[framework].stylesFile), 'utf8'),
      routes: spec.routes,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const text = readFileSync(join(rootPath, DESIGN_DIR, archetype, file), 'utf8');
  const documentDir = join(rootPath, DESIGN_DIR, archetype);
  for (const finding of checkDesignDocument({
    name: where,
    text,
    demo,
    // A document is read from its own directory, so that is where its relative links must resolve, and
    // the target must land inside the repository. The resolver canonicalises both sides, so a link that
    // is inside only as a string - a symlink whose bytes are elsewhere - is refused too.
    resolveLink: repositoryLinkResolver({ root: rootPath, documentDir }),
  })) {
    findings.push({ at: `${where} ${finding.at}`, problem: finding.problem });
  }
  checked += 1;
}

// The functional half: one plan.md per archetype, bound to that archetype's durable spec. The spec is loaded the
// same way the rest of the repo loads it, so a spec that fails its own validation fails here too.
let plans = 0;
for (const archetype of Object.keys(ARCHETYPES).sort()) {
  const where = `${archetype}/plan.md`;
  const file = join(rootPath, DESIGN_DIR, archetype, 'plan.md');
  if (!existsSync(file)) {
    findings.push({ at: where, problem: 'no plan.md: every archetype needs a functional specification' });
    continue;
  }
  const specPath = `${SPECS_DIR}/${archetype}.json`;
  let spec;
  try {
    spec = specForFamily(archetype, rootPath);
  } catch (error) {
    findings.push({ at: where, problem: `cannot load ${specPath}: ${error.message}` });
    continue;
  }
  for (const finding of checkPlanDocument({
    name: where,
    text: readFileSync(file, 'utf8'),
    spec,
    specPath,
    resolveLink: repositoryLinkResolver({ root: rootPath, documentDir: join(rootPath, DESIGN_DIR, archetype) }),
  })) {
    findings.push({ at: `${where} ${finding.at}`, problem: finding.problem });
  }
  plans += 1;
}

for (const finding of findings) console.log(`FINDING ${finding.at}: ${finding.problem}`);

if (findings.length > 0) {
  console.error(`check-design-schema: FAIL - ${findings.length} finding(s) across ${checked} design contract(s) and ${plans} plan(s)`);
  process.exit(1);
}
console.error(
  `check-design-schema: PASS - ${checked} demo design contract(s) match the generated demo `
  + `(${DESIGN_SECTIONS.length} required sections each) and ${plans} plan contract(s) match their spec `
  + `(${PLAN_SECTIONS.length} required sections each)`,
);
