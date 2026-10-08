#!/usr/bin/env node
/**
 * Author 30 independent, domain-authentic target designs for the tr-* families (tr-01..tr-30).
 *
 * Each design is a standalone static HTML5 page with custom scoped CSS, realistic layout,
 * accessible form controls, and domain-appropriate styling. They are strictly independent
 * from the held-out evaluation targets in docs/eval/targets/ (A6 arm) and share zero markup,
 * class names, color palettes, or layout structures.
 *
 * Viewport: 1280x900.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { BATCH_1 } from './targets/batch-1.mjs';
import { BATCH_2 } from './targets/batch-2.mjs';
import { BATCH_3 } from './targets/batch-3.mjs';

const ROOT = resolve(process.cwd());
const TARGETS_DIR = join(ROOT, 'docs/train/targets');

const ALL_TARGETS = [...BATCH_1, ...BATCH_2, ...BATCH_3];

if (ALL_TARGETS.length !== 30) {
  console.error(`Expected 30 targets, found ${ALL_TARGETS.length}`);
  process.exit(1);
}

for (const target of ALL_TARGETS) {
  const dir = join(TARGETS_DIR, target.family_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), target.html.trim() + '\n', 'utf8');
}

console.log(`generate-target-sources: successfully wrote all ${ALL_TARGETS.length} training target designs to ${TARGETS_DIR}`);
