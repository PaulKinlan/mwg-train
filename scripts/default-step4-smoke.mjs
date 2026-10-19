#!/usr/bin/env node
/** Sandbox-only smoke + viewport evidence. No MWG/functional scores or vision call. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPrivateArchiveRoot } from '../src/eval/default-cordon.mjs';
import { assertStep4Ratification, prepareDefaultStep4, step4RatificationRow } from '../src/eval/default-step4-preflight.mjs';
import { requireCorpusSandbox } from '../src/corpus/sandbox.mjs';
import { startServer } from '../src/corpus/harness.mjs';
import { launchChrome } from '../src/corpus/cdp.mjs';
import { step4InstrumentDigest, writeStep4Receipt } from '../src/eval/step4-instrument.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = fileURLToPath(new URL('..', import.meta.url));
const privateFiles = (source, dir = source) => readdirSync(dir).sort().flatMap((name) => {
  const file = join(dir, name);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw Error(`ARCHIVE_UNSAFE_FILE: ${name}`);
  return stat.isDirectory() ? privateFiles(source, file) : [{ path: relative(source, file).split(sep).join('/'), bytes: stat.size, sha256: sha256(readFileSync(file)) }];
});

export function verifyArchiveFamily({ archiveRoot, row }) {
  if (row?.status !== 'SUCCESS' || row?.outcome_kind !== 'success' || row?.excluded_from_training !== true ||
      !/^tr-\d{2}-hono$/.test(row.project_id ?? '') || !/^[a-f0-9]{64}$/.test(row.request_id ?? ''))
    throw Error('GENERATION_QUARANTINE: no runnable successful default cell');
  const archive = realpathSync(resolve(archiveRoot));
  const sealed = join(archive, `${row.project_id}-${row.request_id}`);
  if (realpathSync(sealed) !== sealed) throw Error('ARCHIVE_UNSAFE_FILE: archive path is a symlink');
  const manifestBytes = readFileSync(join(sealed, 'manifest.json'));
  if (sha256(manifestBytes) !== row.manifest_sha256) throw Error('ARCHIVE_HASH_MISMATCH: manifest differs from public register');
  const manifest = JSON.parse(manifestBytes);
  if (manifest.project_id !== row.project_id || manifest.request_id !== row.request_id ||
      manifest.status !== 'SUCCESS' || manifest.excluded_from_training !== true || manifest.approved_for_training !== false)
    throw Error('ARCHIVE_HASH_MISMATCH: manifest identity, status or rights differ');
  const original = join(sealed, 'original');
  if (realpathSync(original) !== original) throw Error('ARCHIVE_UNSAFE_FILE: original path is a symlink');
  if (JSON.stringify(privateFiles(original)) !== JSON.stringify(manifest.files))
    throw Error('ARCHIVE_HASH_MISMATCH: retained files differ from manifest');
  const record = JSON.parse(readFileSync(join(original, 'run.json'), 'utf8'));
  if (record.project_id !== row.project_id || record.request_id !== row.request_id ||
      record.prompt_sha256 !== row.prompt_sha256 || record.arm !== 'default' || record.backend !== 'live')
    throw Error('ARCHIVE_HASH_MISMATCH: run record differs from public register');
  const project = join(original, 'project');
  if (!lstatSync(join(project, 'server.mjs')).isFile()) throw Error('PROJECT_RUNTIME_CONTRACT: missing regular server.mjs');
  return { project, archive_manifest_sha256: row.manifest_sha256 };
}

export async function availablePort() {
  const reservation = createServer();
  return new Promise((done, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      const port = reservation.address().port;
      reservation.close((error) => error ? reject(error) : done(port));
    });
  });
}

export async function smokeDefaultFamily({ family, archiveRoot, evidenceRoot }) {
  if (process.platform !== 'linux' || process.env.MWG_ALLOW_UNSANDBOXED_CHROME === '1')
    throw Error('CHROME_UNCONTAINED: this smoke requires Linux default contained Chrome');
  const markdown = readFileSync(join(root, 'docs/eval/PREREGISTRATION.md'), 'utf8');
  const ratificationRow = step4RatificationRow(markdown);
  assertStep4Ratification(ratificationRow);
  const tranche = JSON.parse(readFileSync(join(root, 'docs/eval/default-set-hono-tranche-2026-10-19.json'), 'utf8'));
  const briefs = readFileSync(join(root, 'docs/train/briefs/manifest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const plan = prepareDefaultStep4({ tranche, briefs, ratificationRow });
  const selected = plan.families.find((entry) => entry.family === family);
  if (!selected || selected.eligibility !== 'ELIGIBLE') throw Error('GENERATION_QUARANTINE: family has no complete default project');
  const row = tranche.run_records.find((entry) => entry.family === family);
  const source = verifyArchiveFamily({ archiveRoot, row });
  const visualTarget = join(root, 'docs/design/training', family, 'reference.jpg');
  if (!lstatSync(visualTarget).isFile()) throw Error('TARGET_AMBIGUOUS: authored reference is not a regular file');
  const visualTargetSha256 = sha256(readFileSync(visualTarget));
  requireCorpusSandbox();
  const instrumentSha256 = step4InstrumentDigest(root);
  const evidence = assertPrivateArchiveRoot(evidenceRoot, { sourceRoot: resolve(archiveRoot) });
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const destination = join(evidence, `${family}-${row.request_id}`);
  mkdirSync(destination, { mode: 0o700 }); // Existing evidence must never masquerade as a new run.
  let chrome, server;
  try {
    const port = await availablePort();
    server = await startServer(source.project, { port });
    assert.equal(server.mechanism, 'bubblewrap');
    chrome = await launchChrome();
    const screenshots = [];
    for (const [name, viewport] of [ ['desktop', { width: 1376, height: 768 }], ['mobile', { width: 390, height: 844 }] ]) {
      const page = await chrome.newPage({ viewport });
      try {
        await page.goto(`http://127.0.0.1:${port}${selected.adapter.journey.startPath}`);
        await page.waitForSettled();
        const documentUrl = await page.url();
        const documentStatus = [...page.network].reverse().find((entry) => entry.url === documentUrl)?.status;
        if (!documentStatus || documentStatus >= 400)
          throw Error(`SCREENSHOT_INCONCLUSIVE: ${name} document returned ${documentStatus ?? 'no response'}`);
        const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
        const png = Buffer.from(data, 'base64');
        if (png.toString('ascii', 1, 4) !== 'PNG' || png.readUInt32BE(16) !== viewport.width || png.readUInt32BE(20) !== viewport.height)
          throw Error(`SCREENSHOT_INCONCLUSIVE: ${name} dimensions differ from ${viewport.width}x${viewport.height}`);
        const file = join(destination, `${name}.png`);
        writeFileSync(file, png, { flag: 'wx', mode: 0o600 });
        screenshots.push({ viewport, documentStatus, documentUrl, sha256: sha256(png), file });
      } finally { await page.close(); }
    }
    verifyArchiveFamily({ archiveRoot, row }); // An archive mutation during execution invalidates the evidence.
    const receipt = { kind: 'step4-smoke-only', family, project_id: row.project_id, request_id: row.request_id,
      sandbox: server.mechanism, archive_manifest_sha256: source.archive_manifest_sha256,
      brief_sha256: selected.brief_sha256, journey_sha256: selected.journey_sha256,
      visual_target: `docs/design/training/${family}/reference.jpg`, visual_target_sha256: visualTargetSha256,
      image_supplied_during_generation: false,
      ratification_row_sha256: sha256(ratificationRow), screenshots, excluded_from_training: true,
      visual_verdict: 'NOT_MEASURED', functional_verdict: 'NOT_MEASURED', rule_verdict: 'NOT_MEASURED' };
    writeStep4Receipt({ root, instrumentSha256, destination, receipt });
    return { kind: receipt.kind, family, sandbox: receipt.sandbox, screenshot_count: screenshots.length,
      functional_verdict: receipt.functional_verdict, visual_verdict: receipt.visual_verdict };
  } finally {
    await chrome?.close().catch(() => {});
    await server?.stop().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [family, archiveRoot, evidenceRoot] = process.argv.slice(2);
  if (!family || !archiveRoot || !evidenceRoot) throw Error('usage: default-step4-smoke.mjs <tr-NN> <private-archive-root> <private-evidence-root>');
  const summary = await smokeDefaultFamily({ family, archiveRoot, evidenceRoot });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
