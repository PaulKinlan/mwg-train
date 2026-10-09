/**
 * check:design-schema - every per-demo design.md must describe the demo the generator actually
 * produces. The document is compared against a freshly generated project, so a token, route or file
 * the demo does not have is a finding rather than a style disagreement.
 *
 * The generated project goes to a temporary directory: nothing here writes into the repository, and
 * nothing touches the byte-frozen corpus.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DESIGN_DIR, REQUIRED_SECTIONS, checkDesignDocument } from '../src/design/contract.mjs';

const ROOT = new URL('../', import.meta.url);
const rootPath = new URL(ROOT).pathname;

const { ARCHETYPES } = await import(pathToFileURL(join(rootPath, 'pilot/archetypes.mjs')));
const { FRAMEWORKS, buildProjectFor, writeProject } = await import(pathToFileURL(join(rootPath, 'pilot/frameworks.mjs')));

function designFiles() {
  if (!existsSync(join(rootPath, DESIGN_DIR))) return [];
  return readdirSync(join(rootPath, DESIGN_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((archetype) => readdirSync(join(rootPath, DESIGN_DIR, archetype.name))
      .filter((file) => file.endsWith('.md'))
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
    // A document is read from its own directory, so that is where its relative links must resolve.
    resolveLink: (target) => existsSync(join(documentDir, target.split('#')[0])),
  })) {
    findings.push({ at: `${where} ${finding.at}`, problem: finding.problem });
  }
  checked += 1;
}

for (const finding of findings) console.log(`FINDING ${finding.at}: ${finding.problem}`);

if (findings.length > 0) {
  console.error(`check-design-schema: FAIL - ${findings.length} finding(s) across ${checked} design contract(s)`);
  process.exit(1);
}
console.error(
  `check-design-schema: PASS - ${checked} demo design contract(s) match the generated demo `
  + `(${REQUIRED_SECTIONS.length} required sections each)`,
);
