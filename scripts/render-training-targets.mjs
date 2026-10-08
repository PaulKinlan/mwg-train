#!/usr/bin/env node
/**
 * Render each authored training target design to a PNG and browser signature, and write the
 * hash-pinned manifest that pins both.
 *
 *   node scripts/render-training-targets.mjs            # render and write data/A1_self_generated/targets/**
 *   node scripts/render-training-targets.mjs --check    # verify the committed bytes against manifest & zero-overlap
 *
 * Authored source: `docs/train/targets/<family>/index.html` (independent HTML/CSS).
 * Storage root: `data/A1_self_generated/targets/...` in the A1_self_generated arm.
 * These are conformance instruments for the training families, marked excluded_from_training: true.
 *
 * `--check` does not re-render: it re-hashes the committed files and asserts zero overlap against A6.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { SIGNATURE_SCRIPT } from '../src/eval/conformance.mjs';
import { assertDisjointTrainingTargets } from '../src/train/disjoint.mjs';
import {
  TRAINING_TARGETS_CREATED_AT,
  TRAINING_TARGETS_DIR,
  TRAINING_TARGETS_LICENSE,
  TRAINING_TARGETS_MANIFEST,
  TRAINING_TARGETS_RIGHTS_REF,
  TRAINING_TARGETS_STORAGE,
  TRAINING_TARGET_FAMILIES,
  TRAINING_TARGET_VIEWPORT,
} from '../src/train/targets.mjs';

const ROOT = resolve(process.cwd());
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * A minimal static server for the authored training targets.
 */
function serveTargets(root) {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)).replace(/^\/+/, '');
    const absolute = join(root, path);
    if (!absolute.startsWith(root) || !existsSync(absolute) || statSync(absolute).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(absolute)] ?? 'application/octet-stream' });
    response.end(readFileSync(absolute));
  });
  return new Promise((resolvePort) => server.listen(0, '127.0.0.1', () => resolvePort({ server, port: server.address().port })));
}

function manifestRow(family, image, signature) {
  return {
    id: `target-${family.family_id}`,
    arm: 'A1_self_generated',
    kind: 'asset',
    excluded_from_training: true,
    approved_for_training: false,
    rights_ref: TRAINING_TARGETS_RIGHTS_REF,
    storage_path: `${TRAINING_TARGETS_STORAGE}/${family.family_id}/target.png`,
    created_at: TRAINING_TARGETS_CREATED_AT,
    generator: { type: 'deterministic', tool: 'scripts/render-training-targets.mjs', browser: 'headless-chrome' },
    family_id: family.family_id,
    archetype: family.archetype,
    title: family.title,
    origin: `${TRAINING_TARGETS_DIR}/${family.family_id}/index.html`,
    image_path: `${TRAINING_TARGETS_STORAGE}/${family.family_id}/target.png`,
    image_sha256: sha256(image),
    image_bytes: image.length,
    signature_path: `${TRAINING_TARGETS_STORAGE}/${family.family_id}/signature.json`,
    signature_sha256: sha256(signature),
    license: TRAINING_TARGETS_LICENSE,
    contains_third_party_material: false,
    contains_owner_identifying_material: false,
    viewport: TRAINING_TARGET_VIEWPORT,
  };
}

async function render() {
  const { server, port } = await serveTargets(join(ROOT, TRAINING_TARGETS_DIR));
  const rows = [];
  try {
    for (const family of TRAINING_TARGET_FAMILIES) {
      const source = join(ROOT, TRAINING_TARGETS_DIR, family.family_id, 'index.html');
      if (!existsSync(source)) {
        throw new Error(`render-training-targets: no authored source for ${family.family_id} at ${source}`);
      }

      // Close every browser in a finally, one at a time
      const chrome = await launchChrome();
      try {
        const page = await chrome.newPage({ viewport: TRAINING_TARGET_VIEWPORT });
        try {
          await page.goto(`http://127.0.0.1:${port}/${family.family_id}/index.html`);
          await page.waitForSettled();
          const signature = await page.evaluate(SIGNATURE_SCRIPT);
          if (!Array.isArray(signature?.controls) || signature.controls.length === 0) {
            throw new Error(`render-training-targets: ${family.family_id} rendered with no controls; the page did not load`);
          }
          const outDir = join(ROOT, TRAINING_TARGETS_STORAGE, family.family_id);
          mkdirSync(outDir, { recursive: true });
          const pngPath = join(outDir, 'target.png');
          await page.screenshot(pngPath);
          const image = readFileSync(pngPath);
          const signatureBuffer = Buffer.from(`${JSON.stringify(signature, null, 2)}\n`);
          writeFileSync(join(outDir, 'signature.json'), signatureBuffer);
          rows.push(manifestRow(family, image, signatureBuffer));
          console.log(`render-training-targets: ${family.family_id} -> ${image.length} bytes, ${signature.controls.length} control(s)`);
        } finally {
          await page.close();
        }
      } finally {
        await chrome.close();
      }
    }
  } finally {
    server.close();
  }

  const manifestPath = join(ROOT, TRAINING_TARGETS_MANIFEST);
  mkdirSync(join(ROOT, TRAINING_TARGETS_STORAGE), { recursive: true });
  writeFileSync(manifestPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  console.log(`render-training-targets: wrote ${rows.length} target(s) to ${TRAINING_TARGETS_MANIFEST}`);

  // Run zero-overlap verification immediately after render
  const disjoint = assertDisjointTrainingTargets({ trainTargetsManifestPath: manifestPath });
  if (!disjoint.ok) {
    for (const finding of disjoint.findings) console.error(`zero-overlap: ${finding.code} - ${finding.message}`);
    process.exit(1);
  }
  console.log(`render-training-targets: zero-overlap check PASSED against ${disjoint.evalTargetHashes.length} A6 eval hashes.`);
}

function check() {
  const problems = [];
  const manifestPath = join(ROOT, TRAINING_TARGETS_MANIFEST);
  if (!existsSync(manifestPath)) {
    console.error(`render-training-targets: ${TRAINING_TARGETS_MANIFEST} is missing`);
    process.exit(1);
  }

  const rows = readFileSync(manifestPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => JSON.parse(line));

  if (rows.length !== TRAINING_TARGET_FAMILIES.length) {
    problems.push(`manifest has ${rows.length} row(s), expected ${TRAINING_TARGET_FAMILIES.length}`);
  }

  for (const family of TRAINING_TARGET_FAMILIES) {
    const row = rows.find((candidate) => candidate.family_id === family.family_id);
    if (!row) {
      problems.push(`${family.family_id}: no manifest row`);
      continue;
    }
    for (const [kind, pathField, hashField] of [
      ['image', 'image_path', 'image_sha256'],
      ['signature', 'signature_path', 'signature_sha256'],
    ]) {
      const path = join(ROOT, row[pathField] ?? '');
      if (!row[pathField] || !existsSync(path)) {
        problems.push(`${family.family_id}: ${kind} ${row[pathField] ?? '(unset)'} is missing`);
        continue;
      }
      const bytes = readFileSync(path);
      if (sha256(bytes) !== row[hashField]) {
        problems.push(`${family.family_id}: ${kind} sha256 does not match the file`);
      }
      if (kind === 'image' && statSync(path).size !== row.image_bytes) {
        problems.push(`${family.family_id}: image byte count does not match the file`);
      }
      if (!row[pathField].startsWith(`${TRAINING_TARGETS_STORAGE}/`)) {
        problems.push(`${family.family_id}: ${kind} is outside the A1_self_generated arm`);
      }
    }
    if (row.arm !== 'A1_self_generated') problems.push(`${family.family_id}: target images must be in the A1_self_generated arm`);
    if (row.excluded_from_training !== true) problems.push(`${family.family_id}: a training target must be excluded from training`);
    if (row.approved_for_training !== false) problems.push(`${family.family_id}: approved_for_training must be false`);
    if (!row.license || !row.origin || !row.created_at || !row.rights_ref) {
      problems.push(`${family.family_id}: license, origin, created_at and rights_ref are all required`);
    }
    if (row.contains_third_party_material !== false || row.contains_owner_identifying_material !== false) {
      problems.push(`${family.family_id}: a target may contain no third-party or owner-identifying material`);
    }
    if (!existsSync(join(ROOT, row.rights_ref ?? ''))) {
      problems.push(`${family.family_id}: rights record ${row.rights_ref} is missing`);
    }
  }

  // Zero-overlap check
  const disjoint = assertDisjointTrainingTargets({ trainTargetsManifestPath: manifestPath });
  if (!disjoint.ok) {
    for (const finding of disjoint.findings) {
      problems.push(`zero-overlap: ${finding.code} - ${finding.message}`);
    }
  }

  if (problems.length) {
    for (const problem of problems) console.error(`render-training-targets: ${problem}`);
    process.exit(1);
  }

  console.log(`render-training-targets: ${rows.length} target(s) verified against ${TRAINING_TARGETS_MANIFEST}`);
  console.log(`render-training-targets: zero-overlap check PASSED against ${disjoint.evalTargetHashes.length} A6 eval target hashes:`);
  for (const h of disjoint.evalTargetHashes) {
    console.log(`  eval hash: ${h}`);
  }
  console.log(`render-training-targets: 0 collisions across all ${rows.length} training targets.`);
}

if (process.argv.includes('--check')) check();
else await render();
