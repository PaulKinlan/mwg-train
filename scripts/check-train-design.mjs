#!/usr/bin/env node
/**
 * check:train-design - every training family's plan.md must describe the family's canonical brief row,
 * and every design.md must describe the family's authored target board. Both are compared against the
 * artefact they claim to describe, so a token, route, field, selector or assertion the source does not
 * have is a finding rather than a style disagreement.
 *
 *   node scripts/check-train-design.mjs
 *
 * Nothing here writes into the repository, and nothing touches the byte-frozen corpus trees.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import {
  TRAIN_BRIEFS_MANIFEST,
  TRAIN_DESIGN_DIR,
  TRAIN_TARGETS_DIR,
  canonicalBrief,
  checkTrainDesignDocument,
  checkTrainPlanDocument,
  repositoryLinkResolver,
  targetStylesheet,
} from '../src/train/design-contract.mjs';

const ROOT = new URL('../', import.meta.url);
// Canonical, because a checkout reached through a symlink would otherwise make containment a lexical
// question about a path string rather than a question about where the bytes actually are.
const rootPath = realpathSync(new URL(ROOT).pathname);

const rows = readFileSync(join(rootPath, TRAIN_BRIEFS_MANIFEST), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const families = [...new Set(rows.map((row) => row.family_id))].sort();

const findings = [];
let plans = 0;
let designs = 0;

for (const family of families) {
  const brief = canonicalBrief(rows, family);
  if (!brief) {
    findings.push({ at: family, problem: 'no canonical (-v1) brief row in the training manifest' });
    continue;
  }
  const dir = join(rootPath, TRAIN_DESIGN_DIR, family);
  const resolveLink = repositoryLinkResolver({ root: rootPath, documentDir: dir });

  const planFile = join(dir, 'plan.md');
  if (!existsSync(planFile)) {
    findings.push({ at: `${family}/plan.md`, problem: 'no plan.md: every training family needs a functional specification' });
  } else {
    for (const finding of checkTrainPlanDocument({
      name: `${family}/plan.md`,
      text: readFileSync(planFile, 'utf8'),
      brief,
      resolveLink,
    })) {
      findings.push({ at: `${family}/plan.md ${finding.at}`, problem: finding.problem });
    }
    plans += 1;
  }

  const designFile = join(dir, 'design.md');
  if (!existsSync(designFile)) {
    findings.push({ at: `${family}/design.md`, problem: 'no design.md: every training family needs an aesthetic contract' });
    continue;
  }
  const targetPath = join(rootPath, TRAIN_TARGETS_DIR, family, 'index.html');
  if (!existsSync(targetPath)) {
    findings.push({ at: `${family}/design.md`, problem: `no authored target board at ${TRAIN_TARGETS_DIR}/${family}/index.html` });
    continue;
  }
  const html = readFileSync(targetPath, 'utf8');
  const css = targetStylesheet(html);
  if (css === null) {
    findings.push({ at: `${family}/design.md`, problem: 'target board must carry exactly one <style> block' });
    continue;
  }
  for (const finding of checkTrainDesignDocument({
    name: `${family}/design.md`,
    text: readFileSync(designFile, 'utf8'),
    family,
    target: {
      path: `${TRAIN_TARGETS_DIR}/${family}/index.html`,
      css,
      formId: /<form[^>]*\bid="([^"]+)"/.exec(html)?.[1] ?? null,
    },
    resolveLink,
  })) {
    findings.push({ at: `${family}/design.md ${finding.at}`, problem: finding.problem });
  }
  designs += 1;
}

// A stray directory under docs/train/design is a finding rather than an ignored extra, so a document
// cannot land there without a brief row behind it.
if (existsSync(join(rootPath, TRAIN_DESIGN_DIR))) {
  for (const entry of readdirSync(join(rootPath, TRAIN_DESIGN_DIR), { withFileTypes: true })) {
    if (entry.isDirectory() && !families.includes(entry.name)) {
      findings.push({ at: entry.name, problem: `directory under ${TRAIN_DESIGN_DIR} with no family in ${TRAIN_BRIEFS_MANIFEST}` });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) console.error(`${finding.at}: ${finding.problem}`);
  console.error(`check-train-design: FAIL (${findings.length} finding${findings.length === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log(`check-train-design: PASS (${plans} plans, ${designs} designs)`);
