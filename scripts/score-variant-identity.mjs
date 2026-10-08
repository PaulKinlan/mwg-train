#!/usr/bin/env node
/**
 * Do the framework variants within a family share one design?
 *
 *   node scripts/score-variant-identity.mjs --family booking
 *   node scripts/score-variant-identity.mjs --all
 *
 * For every framework the pilot builds a family in, this renders the raw and MWG-uplifted variants,
 * scores each against the family's single shared target, and then compares the raw variants with each
 * other. The two halves answer the two different R2 questions:
 *
 *   - per-variant delta to target: how close is this framework's build to the shared ideal?
 *   - cross-variant identity: do the frameworks agree with each other, or has a framework's own
 *     layout conventions become an aesthetic difference?
 *
 * Both are needed. A family whose variants all sit 0.3 from the target but agree with each other has a
 * shared design that is simply further from the ideal; a family whose variants disagree with each
 * other is the one where "framework" and "aesthetic choice" are confounded.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { identityFindings, scoreArm, variantIdentity } from '../src/eval/conformance.mjs';
import { captureSignature } from '../src/eval/render.mjs';
import { IDENTITY_BUDGET, TARGETS_STORAGE, TARGET_FAMILIES } from '../src/eval/targets.mjs';
import { generateCorpus, readPlan } from '../pilot/generate.mjs';

const ROOT = resolve(process.cwd());

function parseArgs(argv) {
  const args = { family: null, all: false, out: 'docs/eval/conformance', port: 4900 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--family') args.family = argv[++i];
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
  }
  return args;
}

function loadTarget(family) {
  const relativePath = `${TARGETS_STORAGE}/${family}/signature.json`;
  return { relativePath, signature: JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8')), sha256: createHash('sha256').update(readFileSync(join(ROOT, relativePath))).digest('hex') };
}

async function scoreFamily({ family, chrome, runDir, outDir, port }) {
  const target = loadTarget(family.family_id);
  const plan = readPlan();
  const projects = plan.projects.filter((project) => project.archetype === family.family_id);
  if (projects.length === 0) throw new Error(`score-variant-identity: the pilot has no projects for family '${family.family_id}'`);
  const corpusRoot = resolve('.conformance-corpus', runDir.split('/').pop(), family.family_id);
  const { projects: generated } = generateCorpus({ plan: { ...plan, projects }, outDir: corpusRoot });

  const variants = [];
  for (const project of generated) {
    const raw = await captureSignature({ chrome, projectDir: project.dir, port: port++, runDir });
    const upliftedDir = resolve('.conformance-uplifted', runDir.split('/').pop(), project.projectId);
    upliftProject(project.dir, project.spec, upliftedDir);
    const arm = await captureSignature({ chrome, projectDir: upliftedDir, port: port++, runDir });
    const score = scoreArm({ target: target.signature, raw, arm });
    variants.push({ framework: project.framework, ...score, raw_signature: raw });
  }

  const identity = variantIdentity(target.signature, variants.map((variant) => ({ framework: variant.framework, signature: variant.raw_signature })));
  const findings = identityFindings(identity, IDENTITY_BUDGET);
  const report = {
    family: family.family_id,
    target_signature: target.relativePath,
    target_sha256: target.sha256,
    generated_at: new Date().toISOString(),
    variants: variants.map(({ raw_signature, ...variant }) => variant),
    identity: { ...identity, target_conformance: identity.target_conformance },
    budget: IDENTITY_BUDGET,
    findings,
  };
  writeFileSync(join(outDir, `${family.family_id}-identity.json`), `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    `# Variant identity: ${family.family_id}`,
    '',
    `Shared target: \`${target.relativePath}\` (sha256 \`${target.sha256}\`)`,
    '',
    '## Delta from raw baseline to the shared target',
    '',
    '| framework | raw baseline | target conformance | delta |',
    '| --- | --- | --- | --- |',
    ...variants.map((variant) => `| ${variant.framework} | ${variant.raw.toFixed(3)} | ${variant.target.toFixed(3)} | ${variant.delta >= 0 ? '+' : ''}${variant.delta.toFixed(3)} |`),
    '',
    '## Cross-variant identity (raw variants, pairwise)',
    '',
    '| axis | agreement | variance | budget |',
    '| --- | --- | --- | --- |',
    ...Object.entries(IDENTITY_BUDGET).map(([axis, minimum]) => `| ${axis} | ${identity.identity[axis].toFixed(3)} | ${identity.variance[axis].toFixed(4)} | >= ${minimum} |`),
    '',
    identity.weakest_pair ? `Weakest pair: ${identity.weakest_pair.a}/${identity.weakest_pair.b} at ${identity.weakest_pair.overall.toFixed(3)}.` : 'Only one variant; nothing to compare.',
    '',
    findings.length ? `**Below budget:** ${findings.map((finding) => `${finding.axis} (${finding.actual})`).join(', ')}` : '**All axes within budget.**',
    '',
  ];
  writeFileSync(join(outDir, `${family.family_id}-identity.md`), lines.join('\n'));
  console.log(`score-variant-identity: ${family.family_id} identity ${identity.identity.overall.toFixed(3)} (weakest ${identity.weakest_pair ? `${identity.weakest_pair.a}/${identity.weakest_pair.b} ${identity.weakest_pair.overall.toFixed(3)}` : 'n/a'}), ${findings.length} below budget`);
  for (const variant of variants) console.log(`  ${variant.framework.padEnd(7)} raw ${variant.raw.toFixed(3)} -> target ${variant.target.toFixed(3)} (delta ${variant.delta >= 0 ? '+' : ''}${variant.delta.toFixed(3)})`);
  return { family: family.family_id, identity: identity.identity.overall, findings: findings.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const families = args.all ? TARGET_FAMILIES : TARGET_FAMILIES.filter((family) => family.family_id === args.family);
  if (families.length === 0) throw new Error('score-variant-identity: pass --family <id> or --all');
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const runDir = mkdtempSync(join(tmpdir(), 'variant-identity-'));
  const chrome = await launchChrome();
  const summary = [];
  let port = args.port;
  try {
    for (const family of families) summary.push(await scoreFamily({ family, chrome, runDir, outDir, port }));
  } finally {
    await chrome.close();
    rmSync(resolve('.conformance-corpus', runDir.split('/').pop()), { recursive: true, force: true });
    rmSync(resolve('.conformance-uplifted', runDir.split('/').pop()), { recursive: true, force: true });
    rmSync(runDir, { recursive: true, force: true });
  }
  const belowBudget = summary.reduce((sum, entry) => sum + entry.findings, 0);
  console.log(`score-variant-identity: ${summary.length} family(ies), ${belowBudget} axis/family below budget`);
}

await main();
