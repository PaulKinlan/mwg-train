/**
 * The corpus viewer server.
 *
 * Owner-only by construction: the app carries no auth of its own; the exe.dev proxy in front of
 * the port is the gate (Paul, 2026-10-08: the served artefact stays auth-free). What the app does
 * enforce is the other direction - nothing owner-identifying may flow INTO a site.
 *
 * TWO ORIGINS, because the sites are untrusted:
 *   - the VIEWER (default 7700) serves the index, evidence pages and evidence files;
 *   - the LIVE origin (default 7701) serves only the sandboxed sites under /live/<id>/<version>/.
 * A different port is a different origin, so a site's JavaScript cannot same-origin-read the
 * viewer's pages (independent review, 2026-10-08: subpath isolation is not containment). Cookies
 * are host-scoped rather than port-scoped, which is exactly why the proxy namespaces every cookie
 * a site sets and forwards only those back (see proxy.mjs).
 *
 * Viewer routes:
 *   GET  /                              index: every project, filters, accept/reject, live links
 *   GET  /project/<id>[?run=]           pair evidence: rules, journeys, security, screenshots
 *   GET  /evidence/<id>/<file>[?run=]   screenshots and traces, path- and symlink-confined
 *   GET  /concepts                       illustrative boards and archetype/target visual pairs
 *   GET  /concepts/images/<name>.jpg      confined concept JPEG
 *   GET  /concepts/images/booking/<step>.jpg  confined booking journey reference
 *   GET  /concepts/targets/<id>.png       confined A6 authored target render
 *   GET  /tuning                         training-only prompt draft workbench (no generation)
 *   GET  /tuning/client.js               browser-local draft/export helper
 *   GET  /tuning/target/<tr-NN>.png       authored A1 target image, path- and symlink-confined
 *   GET  /healthz
 *
 * Live routes (live origin only):
 *   POST /live/<id>/<version>/start     spawn the sandbox, redirect into it
 *   ANY  /live/<id>/<version>/...       the site itself, proxied from its sandbox
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conceptImage, conceptJourneyStep, conceptTarget, listConcepts, renderConcepts } from './concepts.mjs';
import { filterProjects, loadCorpus, projectView } from './corpus.mjs';
import { hashTree } from '../corpus/tree-hash.mjs';
import { scanTree, scanPairRecords, loadScanConfig, buildMatchers } from './owner-auth.mjs';
import { renderIndex, renderProject, renderMarkdown, escapeHtml, page } from './pages.mjs';
import { loadTuningData, renderTuning } from './tuning.mjs';
import { proxyRequest } from './proxy.mjs';
import { SandboxPool } from './sandbox.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..');

const EVIDENCE_EXTENSIONS = new Set(['.png', '.json', '.webp', '.jpg', '.jpeg']);
const VERSIONS = new Set(['original', 'uplifted']);

/**
 * The pair-level combination rule: PASS only when BOTH trees are present and clean AND the
 * records are clean. A MISSING tree (not materialized on disk) or absent records (no local run)
 * makes the pair PARTIAL - never PASS, so nothing unscanned is ever presented as clean.
 */
export function combineScanStatus({ original, uplifted, records }) {
  const all = [original, uplifted, records];
  if (all.some((r) => r?.status === 'ERROR')) return 'ERROR';
  if (all.some((r) => r?.status === 'FAIL')) return 'FAIL';
  if (original?.status === 'MISSING' || uplifted?.status === 'MISSING' || records?.status === 'NO-RUN') return 'PARTIAL';
  return 'PASS';
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

const htmlResponse = (response, body, status = 200) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
};

const textResponse = (response, body, status = 200) => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
};

/**
 * The live origin for links from viewer pages: the request's host name (STRICTLY validated -
 * the Host header is attacker-influenced, and a bad parse must never produce an attacker
 * authority) with the live port substituted. An unrecognised host falls back to loopback.
 */
export function liveOriginFor(request, livePort) {
  const host = String(request.headers.host ?? '');
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return `http://127.0.0.1:${livePort}`;
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  const trusted = hostname === '127.0.0.1' || hostname === 'localhost' || /(^|\.)exe\.xyz$/.test(hostname);
  if (!trusted) return `http://127.0.0.1:${livePort}`;
  const scheme = hostname.endsWith('.exe.xyz') ? 'https' : 'http';
  return `${scheme}://${hostname}:${livePort}`;
}

export function createViewer({ corpusRoot, stateDir, identityConfigPath = join(REPO_ROOT, 'docs/eval/owner-identity.json'), repoRoot = REPO_ROOT, livePort = 7701 }) {
  mkdirSync(stateDir, { recursive: true });
  const pool = new SandboxPool({ stateDir, nodeModulesDir: join(repoRoot, 'node_modules') });
  const scanCache = new Map();

  const load = (runId) => loadCorpus(corpusRoot, runId);

  // The identity config loads once and fail-closed: a broken config makes every tree un-scannable.
  let matchers = null;
  let matchersError = null;
  let scanOptions = {};
  try {
    const config = loadScanConfig(identityConfigPath);
    matchers = buildMatchers(config);
    scanOptions = config.scan ?? {};
  } catch (error) {
    matchersError = error.message;
  }

  /**
   * Cache key for a scanned tree, computed with the SCANNER's semantics (not hashtree's, which
   * excludes .github and friends that the scanner reads). Any change to any file the scanner
   * walks - name, size or content - changes the key. Over-invalidation is safe; staleness is not.
   */
  function scanCacheKey(dir) {
    const skipDirs = scanOptions.skip_dirs ?? ['node_modules', '.git'];
    const hash = createHash('sha256');
    const walk = (current, prefix = '') => {
      for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory()) {
          if (!skipDirs.includes(entry.name)) walk(join(current, entry.name), `${prefix}${entry.name}/`);
          continue;
        }
        const path = join(current, entry.name);
        const stat = statSync(path);
        if (!stat.isFile()) continue;
        hash.update(`${prefix}${entry.name}:${stat.size}:`);
        hash.update(readFileSync(path));
      }
    };
    walk(dir);
    return hash.digest('hex');
  }

  /** Scan one tree, cached by scanner-semantics content key. */
  function scanTreeCached(dir) {
    if (!dir || !existsSync(dir)) return { status: 'MISSING', findings: [] };
    if (!matchers) return { status: 'ERROR', reason: matchersError, findings: [] };
    const key = scanCacheKey(dir);
    if (!scanCache.has(key)) scanCache.set(key, scanTree(dir, matchers, scanOptions));
    return scanCache.get(key);
  }

  /**
   * The corpus RECORD scan for one project, cached by the CONTENT of the records (name + size +
   * bytes), never by path alone: a record edited after a clean scan must not inherit the PASS.
   * When the decision comes from the committed manifest rather than a local run dir, the manifest
   * itself is the record and its content is what gets scanned.
   */
  const recordsCache = new Map();
  function recordsScan(project) {
    const manifestPath = join(corpusRoot, 'CORPUS.json');
    const hasManifest = existsSync(manifestPath);
    const manifestBacked = !project.runDir && project.decision?.record_source === 'manifest';
    if (!project.runDir && !manifestBacked && !hasManifest) return { status: 'NO-RUN', findings: [] };
    if (!matchers) return { status: 'ERROR', reason: matchersError, findings: [] };
    // The committed manifest is ALWAYS in scope when it exists (it is the corpus record of
    // record), alongside the local run records when a run dir covers the project. Owner material
    // in either fails the pair.
    const hash = createHash('sha256');
    const files = [];
    if (hasManifest) files.push(manifestPath);
    if (project.runDir) {
      files.push(...['decision.json', 'original.json', 'uplifted.json'].map((f) => join(project.runDir, f)));
      if (project.evidenceDir && existsSync(project.evidenceDir)) {
        files.push(
          ...readdirSync(project.evidenceDir)
            .filter((f) => f.endsWith('.json'))
            .sort()
            .map((f) => join(project.evidenceDir, f)),
        );
      }
    }
    for (const file of files) {
      hash.update(file);
      if (existsSync(file)) {
        const stat = statSync(file);
        hash.update(`:${stat.size}:`);
        hash.update(readFileSync(file));
      } else {
        hash.update(':ABSENT:');
      }
    }
    const key = hash.digest('hex');
    if (!recordsCache.has(key)) {
      const parts = [];
      if (project.runDir) parts.push(scanPairRecords(project, matchers, scanOptions));
      if (hasManifest) parts.push(scanTree(manifestPath, matchers, scanOptions));
      if (manifestBacked && !hasManifest) {
        parts.push({ status: 'FAIL', findings: [{ file: manifestPath, line: null, patternId: 'record-missing', kind: 'scan-error' }] });
      }
      const findings = parts.flatMap((part) => part.findings);
      recordsCache.set(key, { status: findings.length === 0 ? 'PASS' : 'FAIL', findings });
    }
    return recordsCache.get(key);
  }

  /**
   * Pair-level owner-auth status. PASS requires both trees present and clean and the corpus
   * records clean; PARTIAL means the uplifted snapshot is not on disk (it is regenerated,
   * hash-verified and scanned at serve time) or no run exists yet; FAIL/ERROR fail closed.
   */
  function scanFor(project) {
    const original = scanTreeCached(project.originalTreeDir);
    const upliftedDir = project.upliftedTreeDir ?? null;
    const uplifted = upliftedDir ? scanTreeCached(upliftedDir) : { status: 'MISSING', findings: [] };
    const records = recordsScan(project);
    return { status: combineScanStatus({ original, uplifted, records }), reason: matchersError, original, uplifted, records };
  }

  /**
   * The MEASURED original tree. The committed pilot/projects/ trees can drift from the recorded
   * corpus (the plan generator and the checked-in trees are separate artifacts; on 2026-10-08 the
   * committed trees carried a post-run instrumentation change the record does not hash). The
   * corpus is regenerable by design (pilot/generate.mjs + plan.json), so the viewer materializes
   * the measured trees from the plan and verifies each against the recorded original_sha. A tree
   * that matches the record on disk is used directly; one that cannot be reproduced is refused.
   */
  let materializedPromise = null;
  function materializeMeasuredOriginals() {
    materializedPromise ??= (async () => {
      const generatePath = join(repoRoot, 'pilot', 'generate.mjs');
      if (!existsSync(generatePath)) return null;
      const outDir = join(stateDir, 'measured-originals');
      const marker = join(outDir, '.complete');
      if (!existsSync(marker)) {
        const { generateCorpus } = await import(generatePath);
        generateCorpus({ outDir, planPath: join(repoRoot, 'pilot', 'plan.json') });
        writeFileSync(marker, 'ok\n');
      }
      return outDir;
    })();
    return materializedPromise;
  }

  /**
   * The tree to serve as the original: the committed tree when it hashes to the recorded
   * original_sha; otherwise the plan-materialized measured tree, verified the same way.
   * Returns { dir, source } or { dir: null, reason }.
   */
  async function measuredOriginalTree(project) {
    // A recorded decision without a recorded original sha is a broken record: nothing may be
    // served as the measured original. Only decision-less (unpaired) projects serve the working
    // tree unchecked.
    if (!project.decision) return { dir: project.originalTreeDir, source: 'working-tree' };    const expected = project.decision?.original_sha ?? null;
    if (!expected) return { dir: null, reason: 'the recorded decision carries no original sha, so the measured original cannot be verified' };
    if (existsSync(project.originalTreeDir) && hashTree(project.originalTreeDir) === expected) return { dir: project.originalTreeDir, source: 'working-tree-verified' };
    const materialized = await materializeMeasuredOriginals();
    if (!materialized) {
      return { dir: null, reason: 'the committed tree no longer matches the recorded original sha, and pilot/generate.mjs is not present to reproduce the measured tree' };
    }
    const candidate = join(materialized, project.id);
    if (!existsSync(candidate)) return { dir: null, reason: `the plan does not generate ${project.id}` };
    const actual = hashTree(candidate);
    if (actual !== expected) {
      return { dir: null, reason: `neither the committed tree nor the plan-generated tree matches the recorded original sha (${expected}); the measured original cannot be reproduced` };
    }
    return { dir: candidate, source: 'plan-materialized-verified' };
  }

  /**
   * Where the uplifted tree comes from: the run's kept tree, or a deterministic regeneration with
   * the repo's uplift tool that MUST reproduce the recorded uplifted sha. Regeneration starts from
   * the MEASURED original (see above), not whatever the committed tree currently is. Fail-closed:
   * a regeneration that does not hash to the recorded value is not served at all, and a cached
   * regeneration is re-hashed before every reuse (independent review, 2026-10-08).
   */
  async function ensureUpliftedTree(project) {
    const expected = project.decision?.uplifted_sha ?? null;
    // A kept snapshot is authoritative ONLY if it still hashes to the recorded sha; a decision
    // without a recorded uplift sha cannot vouch for any tree, kept or regenerated.
    if (project.decision && !expected) {
      return { dir: null, source: 'unrecorded', reason: 'the recorded decision carries no uplift sha, so no uplifted tree can be verified' };
    }
    if (project.upliftedTreeDir && existsSync(project.upliftedTreeDir)) {
      if (expected && hashTree(project.upliftedTreeDir) === expected) {
        return { dir: project.upliftedTreeDir, source: 'run-snapshot' };
      }
      if (!expected) return { dir: null, source: 'unrecorded', reason: 'the kept uplifted tree has no recorded sha to verify against' };
    }
    const upliftPath = join(repoRoot, 'src/corpus/uplift.mjs');
    if (!existsSync(upliftPath)) {
      const kept = project.upliftedTreeDir && existsSync(project.upliftedTreeDir);
      return {
        dir: null,
        source: 'unavailable',
        reason: kept
          ? 'the kept uplifted tree no longer matches its recorded sha, and the uplift tool (src/corpus/uplift.mjs) is not present in this checkout to regenerate it'
          : 'the uplift tool (src/corpus/uplift.mjs) is not present in this checkout',
      };
    }
    if (!expected) {
      return { dir: null, source: 'unrecorded', reason: 'no uplifted sha is recorded for this pair, so a regenerated tree could not be verified' };
    }
    const cacheKey = `${project.id}-${expected.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;
    const cacheDir = join(stateDir, 'uplifted', cacheKey);
    if (existsSync(cacheDir)) {
      if (hashTree(cacheDir) === expected) return { dir: cacheDir, source: 'regenerated-verified', expected };
      await rm(cacheDir, { recursive: true, force: true });
    }
    mkdirSync(dirname(cacheDir), { recursive: true });
    const { upliftProject } = await import(upliftPath);
    const original = await measuredOriginalTree(project);
    if (!original.dir) return { dir: null, source: 'no-original', reason: original.reason };
    // Manifest-only projects carry no full spec.json on disk; the materialized measured tree
    // includes the generator's own spec, which is the one the recorded uplift was produced from.
    const spec = project.spec?.routes ? project.spec : (readJson(join(original.dir, 'spec.json')) ?? project.spec);
    if (!spec) return { dir: null, source: 'no-spec', reason: 'no spec available to reproduce the uplift with' };
    upliftProject(original.dir, spec, cacheDir);
    const actual = hashTree(cacheDir);
    if (actual !== expected) {
      await rm(cacheDir, { recursive: true, force: true });
      return {
        dir: null,
        source: 'regeneration-mismatch',
        reason: `deterministic regeneration did not reproduce the recorded uplifted sha (expected ${expected}, got ${actual}); refusing to serve an unverified tree`,
      };
    }
    return { dir: cacheDir, source: 'regenerated-verified', expected, actual };
  }

  function verification(project) {
    const result = {};
    const originalExpected = project.decision?.original_sha ?? null;
    if (originalExpected) {
      if (!existsSync(project.originalTreeDir)) {
        result.original = { status: 'not-on-disk' };
      } else {
        result.original = hashTree(project.originalTreeDir) === originalExpected ? { status: 'verified' } : { status: 'drifted' };
      }
    } else {
      result.original = { status: 'unrecorded' };
    }
    const upliftedExpected = project.decision?.uplifted_sha ?? null;
    const upliftedDir = project.upliftedTreeDir ?? null;
    if (upliftedExpected && upliftedDir) {
      result.uplifted = hashTree(upliftedDir) === upliftedExpected ? { status: 'verified' } : { status: 'drifted' };
    } else {
      result.uplifted = { status: upliftedExpected ? 'snapshot-not-kept' : 'unrecorded' };
    }
    return result;
  }

  function findProject(corpus, id) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) return null;
    return corpus.projects.find((project) => project.id === id) ?? null;
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://viewer.internal');
      const path = url.pathname;
      const liveOrigin = liveOriginFor(request, livePort);

      if (path === '/healthz') return textResponse(response, 'ok');

      if (path === '/concepts' && request.method === 'GET') {
        return htmlResponse(response, renderConcepts(listConcepts(repoRoot)));
      }
      const journeyImageMatch = path.match(/^\/concepts\/images\/([a-z0-9-]+)\/(step[1-9][0-9]*-[a-z0-9-]+)\.jpg$/);
      if (journeyImageMatch && request.method === 'GET') {
        const image = conceptJourneyStep(repoRoot, journeyImageMatch[1], journeyImageMatch[2]);
        if (!image) return textResponse(response, 'archetype reference unavailable', 404);
        response.writeHead(200, { 'content-type': image.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return response.end(image.bytes);
      }
      const conceptImageMatch = path.match(/^\/concepts\/images\/([a-z0-9-]+)\.jpg$/);
      if (conceptImageMatch && request.method === 'GET') {
        const image = conceptImage(repoRoot, conceptImageMatch[1]);
        if (!image) return textResponse(response, 'concept image unavailable', 404);
        response.writeHead(200, { 'content-type': image.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return response.end(image.bytes);
      }
      const conceptTargetMatch = path.match(/^\/concepts\/targets\/([a-z0-9-]+)\.png$/);
      if (conceptTargetMatch && request.method === 'GET') {
        const image = conceptTarget(repoRoot, conceptTargetMatch[1]);
        if (!image) return textResponse(response, 'authored target unavailable', 404);
        response.writeHead(200, { 'content-type': image.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return response.end(image.bytes);
      }

      if (path === '/tuning' && request.method === 'GET') {
        const data = loadTuningData(repoRoot);
        return htmlResponse(response, renderTuning({ data, repoRoot,
          familyId: url.searchParams.get('family'), variant: url.searchParams.get('variant'),
          framework: url.searchParams.get('framework') }));
      }
      if (path === '/tuning/client.js' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        return response.end(readFileSync(join(repoRoot, 'src/viewer/tuning-client.js')));
      }
      const tuningTarget = path.match(/^\/tuning\/target\/(tr-\d{2})\.png$/);
      if (tuningTarget && request.method === 'GET') {
        const dir = join(repoRoot, 'data/A1_self_generated/targets', tuningTarget[1]);
        const image = join(dir, 'target.png');
        if (!existsSync(image) || lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory() ||
            lstatSync(image).isSymbolicLink() || !lstatSync(image).isFile() || realpathSync(dir) !== join(realpathSync(join(repoRoot, 'data/A1_self_generated/targets')), tuningTarget[1]) ||
            realpathSync(image) !== join(realpathSync(dir), 'target.png')) {
          return textResponse(response, 'target unavailable', 404);
        }
        response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return response.end(readFileSync(image));
      }
      const tuningReference = path.match(/^\/tuning\/reference\/(tr-\d{2})\.jpg$/);
      if (tuningReference && request.method === 'GET') {
        const dir = join(repoRoot, 'docs/design/training', tuningReference[1]);
        const image = join(dir, 'reference.jpg');
        if (!existsSync(image) || lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory() ||
            lstatSync(image).isSymbolicLink() || !lstatSync(image).isFile() || realpathSync(dir) !== join(realpathSync(join(repoRoot, 'docs/design/training')), tuningReference[1]) ||
            realpathSync(image) !== join(realpathSync(dir), 'reference.jpg')) {
          return textResponse(response, 'reference board unavailable', 404);
        }
        // The extension and the content-type are a CLAIM about the bytes, so check the bytes. The workbench already
        // refuses to render anything whose header is not a JPEG SOI, and this is the same check on the side that
        // actually hands the file to a browser. A file named reference.jpg that is not a JPEG is not a reference
        // board, and would otherwise be served with a content type it does not have and sniffing still permitted.
        const bytes = readFileSync(image);
        if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
          return textResponse(response, 'reference board unavailable', 404);
        }
        response.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return response.end(bytes);
      }

      if (path === '/pipeline' && request.method === 'GET') {
        // The pipeline doc is the source of truth; the viewer renders it so the two cannot drift.
        const docPath = join(repoRoot, 'docs', 'PIPELINE.md');
        if (!existsSync(docPath)) return textResponse(response, 'docs/PIPELINE.md not present in this checkout', 404);
        return htmlResponse(response, page('pipeline', renderMarkdown(readFileSync(docPath, 'utf8'))));
      }

      if (path === '/' && request.method === 'GET') {
        const runId = url.searchParams.get('run') || null;
        const corpus = load(runId);
        const filters = {
          archetype: url.searchParams.get('archetype') || null,
          framework: url.searchParams.get('framework') || null,
          state: url.searchParams.get('state') || null,
          rule: url.searchParams.get('rule') || null,
        };
        const allViews = corpus.projects.map((project) => projectView(project, { scan: scanFor(project) }));
        const views = filterProjects(allViews, filters);
        return htmlResponse(
          response,
          renderIndex({
            views,
            allViews,
            filters,
            runId: corpus.runId,
            runs: corpus.runs,
            yieldReport: corpus.yieldReport,
            scanAvailable: allViews.every((view) => view.scan?.status !== 'ERROR'),
            liveOrigin,
          }),
        );
      }

      const projectMatch = path.match(/^\/project\/([a-z0-9-]+)$/i);
      if (projectMatch && request.method === 'GET') {
        const runId = url.searchParams.get('run') || null;
        const corpus = load(runId);
        const project = findProject(corpus, projectMatch[1]);
        if (!project) return textResponse(response, 'no such project', 404);
        const scan = scanFor(project);
        const view = projectView(project, { scan, verification: verification(project) });
        return htmlResponse(response, renderProject({ view, runId: corpus.runId, runs: corpus.runs, liveOrigin }));
      }

      const evidenceMatch = path.match(/^\/evidence\/([a-z0-9-]+)\/([a-z0-9.-]+)$/i);
      if (evidenceMatch && request.method === 'GET') {
        const runId = url.searchParams.get('run') || null;
        const corpus = load(runId);
        const project = findProject(corpus, evidenceMatch[1]);
        if (!project?.evidenceDir) return textResponse(response, 'no evidence', 404);
        const file = evidenceMatch[2];
        if (!/^[a-z0-9][a-z0-9.-]*$/i.test(file) || file.includes('..')) return textResponse(response, 'bad name', 400);
        const fullPath = resolve(project.evidenceDir, file);
        if (!fullPath.startsWith(resolve(project.evidenceDir))) return textResponse(response, 'confined', 403);
        if (!EVIDENCE_EXTENSIONS.has(extname(file).toLowerCase())) return textResponse(response, 'type not served', 403);
        if (!existsSync(fullPath)) return textResponse(response, 'not found', 404);
        // Symlinks are refused and the real path must stay inside the real evidence directory:
        // an imported run dir must not become a read primitive over the host filesystem.
        if (lstatSync(fullPath).isSymbolicLink()) return textResponse(response, 'symlinks are not served', 403);
        const realFile = realpathSync(fullPath);
        const realDir = realpathSync(project.evidenceDir);
        if (realFile !== join(realDir, file)) return textResponse(response, 'confined', 403);
        const body = await readFile(realFile);
        const type = extname(file).toLowerCase() === '.png' ? 'image/png' : extname(file).toLowerCase() === '.json' ? 'application/json' : 'application/octet-stream';
        response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        return response.end(body);
      }

      // Live sites are served from the LIVE ORIGIN only. A /live path on the viewer origin is a
      // hard 404, so no untrusted bytes are ever same-origin with the evidence pages.
      return textResponse(response, 'not found', 404);
    } catch (error) {
      return textResponse(response, `viewer error: ${error.message}`, 500);
    }
  });

  /** The live origin: only /live/<id>/<version>/... exists here. */
  const liveServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://live.internal');
      const path = url.pathname;

      if (path === '/healthz') return textResponse(response, 'ok');

      // The run is part of the live URL so every in-site link (rewritten under the prefix) keeps
      // browsing the run the owner started: /live/<id>/<version>/run/<runId>/... A URL without a
      // run segment addresses the latest run.
      const liveMatch = path.match(/^\/live\/([a-z0-9-]+)\/(original|uplifted)(?:\/run\/([A-Za-z0-9._-]+))?(\/.*)?$/i);
      if (!liveMatch) {
        if (path === '/' && request.method === 'GET') {
          return htmlResponse(
            response,
            page('live origin', `<h1>mwg-train live site origin</h1><p class="muted">This origin serves only sandboxed corpus sites under <code>/live/&lt;project&gt;/&lt;version&gt;/</code>. It is deliberately a separate origin from the viewer so untrusted site code cannot read the evidence pages. Start sites from the <a href="/">viewer index</a>.</p>`),
          );
        }
        return textResponse(response, 'not found', 404);
      }

      const [, id, version, runSegment, rest] = liveMatch;
      if (!VERSIONS.has(version)) return textResponse(response, 'bad version', 400);
      const requestedRun = runSegment ?? null;
      const corpus = load(requestedRun);
      if (requestedRun && !corpus.runs.includes(requestedRun)) return textResponse(response, 'no such run', 404);
      const project = findProject(corpus, id);
      if (!project) return textResponse(response, 'no such project', 404);

      // The serving gate is pair-level: neither version is served unless everything the pair
      // consists of - both trees (the uplifted one regenerated and hash-verified when not kept)
      // and the run's corpus records - scans clean. A clean tree paired with an owner-bearing
      // record is not served, because serving it would display the pair as inspectable when the
      // record itself fails the rule.
      const scan = scanFor(project);
      if (scan.status === 'ERROR' || scan.status === 'FAIL') {
        return htmlResponse(
          response,
          page('refused', `<h1>live serving refused</h1><p class="danger">The owner-auth scan of this pair is ${escapeHtml(scan.status)}${scan.reason ? ` (${escapeHtml(scan.reason)})` : ''}, and the rule is fail-closed: a pair that cannot be shown clean of owner-identifying material - in its trees AND its records - is not served.</p>`),
          403,
        );
      }

      // Resolve the tree first, then scan exactly the tree that will be served: a regenerated
      // uplifted snapshot is scanned after regeneration and hash verification, before it is
      // reachable.
      let siteDir;
      let treeSource = 'working-tree';
      if (version === 'original') {
        // The measured original is what the pair's evidence describes: serve the committed tree
        // only while it still hashes to the recorded original sha; otherwise reproduce the
        // measured tree from the plan. Refuse when neither reproduces the record.
        const resolved = await measuredOriginalTree(project);
        if (!resolved.dir) {
          return htmlResponse(
            response,
            page('refused', `<h1>live serving refused</h1><p class="danger">${escapeHtml(resolved.reason ?? 'the measured original cannot be reproduced')}</p>`),
            409,
          );
        }
        siteDir = resolved.dir;
        treeSource = resolved.source;
      } else {
        const resolved = await ensureUpliftedTree(project);
        if (!resolved.dir) {
          return htmlResponse(
            response,
            page('snapshot unavailable', `<h1>uplifted snapshot unavailable</h1><p class="notice">${escapeHtml(resolved.reason ?? 'the run did not keep the uplifted tree')}</p>`),
            404,
          );
        }
        siteDir = resolved.dir;
        treeSource = resolved.source;
      }

      const treeScan = scanTreeCached(siteDir);
      if (treeScan.status !== 'PASS') {
        return htmlResponse(
          response,
          page('refused', `<h1>live serving refused</h1><p class="danger">The owner-auth scan of the ${escapeHtml(version)} tree is ${escapeHtml(treeScan.status)}, and the rule is fail-closed: a tree that cannot be shown clean of owner-identifying material is not served.</p>`),
          403,
        );
      }

      // The paired tree of a RECORDED pair must resolve, hash-verify and scan clean before either
      // version serves: a run that measured a pair does not get to serve half of it. A project
      // with no decision yet is unpaired; its original serves on its own clean scan alone.
      if (project.decision) {
        const paired =
          version === 'original' ? await ensureUpliftedTree(project) : await measuredOriginalTree(project);
        const pairedLabel = version === 'original' ? 'uplifted' : 'original';
        if (!paired.dir) {
          return htmlResponse(
            response,
            page('refused', `<h1>live serving refused</h1><p class="danger">This pair's ${pairedLabel} tree cannot be resolved and verified (${escapeHtml(paired.reason ?? 'unknown')}), so the pair is not servable. The pair is served together or not at all.</p>`),
            403,
          );
        }
        if (scanTreeCached(paired.dir).status !== 'PASS') {
          return htmlResponse(
            response,
            page('refused', `<h1>live serving refused</h1><p class="danger">The paired ${pairedLabel} tree fails the owner-auth scan; the pair is served together or not at all.</p>`),
            403,
          );
        }
      }

      let sandbox = pool.get(id, version);
      if (sandbox?.alive && sandbox.runId !== corpus.runId) {
        pool.stop(sandbox);
        sandbox = null;
      }
      if (!sandbox?.alive) {
        try {
          sandbox = await pool.start({ runId: corpus.runId, projectId: id, version, siteDir });
        } catch (error) {
          return htmlResponse(response, page('sandbox failed', `<h1>the sandboxed site did not start</h1><pre>${escapeHtml(error.message)}</pre>`), 502);
        }
      }
      sandbox.touch();

      if (request.method === 'POST' && rest === '/start') {
        const runPath = corpus.runId ? `/run/${corpus.runId}` : '';
        response.writeHead(303, { location: `/live/${id}/${version}${runPath}/` });
        return response.end();
      }

      const runPrefix = runSegment ? `/run/${runSegment}` : '';
      const prefix = `/live/${id}/${version}${runPrefix}`;
      const sitePath = `${rest ?? '/'}${url.search}`;
      const cookieNamespace = `__vw_${id.replace(/[^a-z0-9]/gi, '')}_${version}_`;
      return proxyRequest({
        request,
        response,
        sandbox,
        prefix,
        sitePath,
        cookieNamespace,
      });
    } catch (error) {
      return textResponse(response, `live origin error: ${error.message}`, 500);
    }
  });

  return { server, liveServer, pool };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  const corpusRoot = resolve(arg('corpus', 'pilot'));
  const port = Number(arg('port', '7700'));
  const livePort = Number(arg('live-port', '7701'));
  const host = arg('host', '0.0.0.0');
  const stateDir = resolve(arg('state', '.viewer-state'));
  const { server, liveServer, pool } = createViewer({ corpusRoot, stateDir, livePort });
  const shutdown = () => {
    pool.stopAll();
    server.close();
    liveServer.close();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  server.listen(port, host, () => {
    console.log(`mwg-train corpus viewer on http://${host}:${port}/ reading corpus ${corpusRoot}`);
  });
  liveServer.listen(livePort, host, () => {
    console.log(`mwg-train live site origin on http://${host}:${livePort}/ (sandboxed sites only)`);
  });
}
