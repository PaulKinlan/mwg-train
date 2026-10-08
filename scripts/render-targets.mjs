#!/usr/bin/env node
/**
 * Render each authored target design to a PNG and a browser signature, and write the hash-pinned
 * manifest that pins both.
 *
 *   node scripts/render-targets.mjs            # render and write data/A6_evaluation/targets/**
 *   node scripts/render-targets.mjs --check    # verify the committed bytes against the manifest
 *
 * The target is ours: `docs/eval/targets/<family>/index.html` is hand-authored HTML/CSS with no
 * third-party material, no logos and no images of people. Rendering it is only a way to fix the
 * bytes; the manifest records where each image came from (the authored source), when it was made,
 * its sha256 and byte count, its licence, and its rights record, and both the image and the
 * signature it was scored from live in the `A6_evaluation` arm, which is never trainable.
 *
 * `--check` does not re-render: it re-hashes the committed files. A screenshot is not guaranteed
 * byte-identical across Chrome builds, so the pin is on the bytes we shipped, not on a re-run.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import process from 'node:process';

import { launchChrome } from '../src/corpus/cdp.mjs';
import { SIGNATURE_SCRIPT } from '../src/eval/conformance.mjs';
import {
  TARGETS_CREATED_AT,
  TARGETS_DIR,
  TARGETS_LICENSE,
  TARGETS_MANIFEST,
  TARGETS_RIGHTS_REF,
  TARGETS_STORAGE,
  TARGET_FAMILIES,
  TARGET_VIEWPORT,
} from '../src/eval/targets.mjs';

const ROOT = resolve(process.cwd());
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/**
 * A minimal static server for the authored targets. `file://` navigation is blocked in headless
 * Chrome, and a page that never loads would otherwise be recorded as a target with no controls.
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
    arm: 'A6_evaluation',
    kind: 'asset',
    excluded_from_training: true,
    approved_for_training: false,
    rights_ref: TARGETS_RIGHTS_REF,
    storage_path: `${TARGETS_STORAGE}/${family.family_id}/target.png`,
    created_at: TARGETS_CREATED_AT,
    generator: { type: 'deterministic', tool: 'scripts/render-targets.mjs', browser: 'headless-chrome' },
    family_id: family.family_id,
    archetype: family.archetype,
    title: family.title,
    origin: `${TARGETS_DIR}/${family.family_id}/index.html`,
    image_path: `${TARGETS_STORAGE}/${family.family_id}/target.png`,
    image_sha256: sha256(image),
    image_bytes: image.length,
    signature_path: `${TARGETS_STORAGE}/${family.family_id}/signature.json`,
    signature_sha256: sha256(signature),
    license: TARGETS_LICENSE,
    contains_third_party_material: false,
    contains_owner_identifying_material: false,
    viewport: TARGET_VIEWPORT,
  };
}

async function render() {
  const { server, port } = await serveTargets(join(ROOT, TARGETS_DIR));
  const chrome = await launchChrome();
  const rows = [];
  try {
    const page = await chrome.newPage({ viewport: TARGET_VIEWPORT });
    try {
      for (const family of TARGET_FAMILIES) {
        const source = join(ROOT, TARGETS_DIR, family.family_id, 'index.html');
        if (!existsSync(source)) throw new Error(`render-targets: no authored source for ${family.family_id} at ${source}`);
        await page.goto(`http://127.0.0.1:${port}/${family.family_id}/index.html`);
        await page.waitForSettled();
        const signature = await page.evaluate(SIGNATURE_SCRIPT);
        if (!Array.isArray(signature?.controls) || signature.controls.length === 0) {
          throw new Error(`render-targets: ${family.family_id} rendered with no controls; the page did not load`);
        }
        const outDir = join(ROOT, TARGETS_STORAGE, family.family_id);
        mkdirSync(outDir, { recursive: true });
        const pngPath = join(outDir, 'target.png');
        await page.screenshot(pngPath);
        const image = readFileSync(pngPath);
        const signatureBuffer = Buffer.from(`${JSON.stringify(signature, null, 2)}\n`);
        writeFileSync(join(outDir, 'signature.json'), signatureBuffer);
        rows.push(manifestRow(family, image, signatureBuffer));
        console.log(`render-targets: ${family.family_id} -> ${image.length} bytes, ${signature.controls.length} control(s)`);
      }
    } finally {
      await page.close();
    }
  } finally {
    await chrome.close();
    server.close();
  }
  writeFileSync(join(ROOT, TARGETS_MANIFEST), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  console.log(`render-targets: wrote ${rows.length} target(s) to ${TARGETS_MANIFEST}`);
}

function check() {
  const problems = [];
  if (!existsSync(join(ROOT, TARGETS_MANIFEST))) {
    console.error(`render-targets: ${TARGETS_MANIFEST} is missing`);
    process.exit(1);
  }
  const rows = readFileSync(join(ROOT, TARGETS_MANIFEST), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => JSON.parse(line));
  if (rows.length !== TARGET_FAMILIES.length) problems.push(`manifest has ${rows.length} row(s), expected ${TARGET_FAMILIES.length}`);
  for (const family of TARGET_FAMILIES) {
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
      if (sha256(bytes) !== row[hashField]) problems.push(`${family.family_id}: ${kind} sha256 does not match the file`);
      if (kind === 'image' && statSync(path).size !== row.image_bytes) problems.push(`${family.family_id}: image byte count does not match the file`);
      if (!row[pathField].startsWith(`${TARGETS_STORAGE}/`)) problems.push(`${family.family_id}: ${kind} is outside the A6_evaluation arm`);
    }
    if (row.arm !== 'A6_evaluation') problems.push(`${family.family_id}: target images must be in the A6_evaluation arm`);
    if (row.excluded_from_training !== true) problems.push(`${family.family_id}: an evaluation target must be excluded from training`);
    if (!row.license || !row.origin || !row.created_at || !row.rights_ref) problems.push(`${family.family_id}: license, origin, created_at and rights_ref are all required`);
    if (row.contains_third_party_material !== false || row.contains_owner_identifying_material !== false) problems.push(`${family.family_id}: a target may contain no third-party or owner-identifying material`);
    if (!existsSync(join(ROOT, row.rights_ref ?? ''))) problems.push(`${family.family_id}: rights record ${row.rights_ref} is missing`);
  }
  if (problems.length) {
    for (const problem of problems) console.error(`render-targets: ${problem}`);
    process.exit(1);
  }
  console.log(`render-targets: ${rows.length} target(s) verified against ${TARGETS_MANIFEST}`);
}

if (process.argv.includes('--check')) check();
else await render();
