/**
 * The corpus viewer server.
 *
 * Owner-only by construction: the app carries no auth of its own; the exe.dev proxy in front of
 * the port is the gate (Paul, 2026-10-08: the served artefact stays auth-free). What the app does
 * enforce is the other direction - nothing owner-identifying may flow INTO a site.
 *
 * Routes:
 *   GET  /                              index: every project, filters, accept/reject, live links
 *   GET  /project/<id>[?run=]           pair evidence: rules, journeys, security, screenshots
 *   POST /live/<id>/<version>/start     spawn the sandbox, redirect into it
 *   ANY  /live/<id>/<version>/...       the site itself, proxied from its sandbox
 *   GET  /evidence/<id>/<file>[?run=]   screenshots and traces, path-confined
 *   GET  /healthz
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filterProjects, loadCorpus, projectView } from './corpus.mjs';
import { hashTree } from './hashtree.mjs';
import { scanTree, loadScanConfig, buildMatchers } from './owner-auth.mjs';
import { renderIndex, renderProject, escapeHtml, page } from './pages.mjs';
import { proxyRequest } from './proxy.mjs';
import { SandboxPool } from './sandbox.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..');

const EVIDENCE_EXTENSIONS = new Set(['.png', '.json', '.webp', '.jpg', '.jpeg']);
const VERSIONS = new Set(['original', 'uplifted']);

const htmlResponse = (response, body, status = 200) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
};

const textResponse = (response, body, status = 200) => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
};

export function createViewer({ corpusRoot, stateDir, identityConfigPath = join(REPO_ROOT, 'docs/eval/owner-identity.json'), repoRoot = REPO_ROOT }) {
  mkdirSync(stateDir, { recursive: true });
  const pool = new SandboxPool({ stateDir });
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

  /** Scan one tree, cached by its content hash. Result: { status: 'PASS'|'FAIL'|'ERROR', ... } */
  function scanTreeCached(dir) {
    if (!dir || !existsSync(dir)) return { status: 'MISSING', findings: [] };
    if (!matchers) return { status: 'ERROR', reason: matchersError, findings: [] };
    const sha = hashTree(dir);
    if (!scanCache.has(sha)) scanCache.set(sha, scanTree(dir, matchers, scanOptions));
    return scanCache.get(sha);
  }

  /**
   * Pair-level owner-auth status. PASS requires both trees present and clean; PARTIAL means the
   * original is clean but the uplifted snapshot was not kept (the corpus gate scans before the
   * run's cleanup - the viewer reports what it can see); FAIL/ERROR fail closed.
   */
  function scanFor(project) {
    const original = scanTreeCached(project.originalTreeDir);
    const upliftedDir = project.upliftedTreeDir ?? null;
    const uplifted = upliftedDir ? scanTreeCached(upliftedDir) : { status: 'MISSING', findings: [] };
    if (original.status === 'ERROR' || uplifted.status === 'ERROR') return { status: 'ERROR', reason: matchersError, original, uplifted };
    if (original.status === 'FAIL' || uplifted.status === 'FAIL') return { status: 'FAIL', original, uplifted };
    if (uplifted.status === 'MISSING') return { status: 'PARTIAL', original, uplifted };
    return { status: 'PASS', original, uplifted };
  }

  /**
   * Where the uplifted tree comes from, in order: the run's own --keep output; deterministic
   * regeneration with the repo's uplift tool, verified against the recorded sha; unavailable.
   */
  function resolveUpliftedTreeDir() {
    return null;
  }

  async function ensureUpliftedTree(project) {
    if (project.upliftedTreeDir && existsSync(project.upliftedTreeDir)) {
      return { dir: project.upliftedTreeDir, source: 'run-snapshot' };
    }
    const upliftPath = join(repoRoot, 'src/corpus/uplift.mjs');
    if (!existsSync(upliftPath)) {
      return { dir: null, source: 'unavailable', reason: 'the uplift tool (src/corpus/uplift.mjs) is not present in this checkout' };
    }
    const expected = project.decision?.uplifted_sha ?? null;
    const cacheKey = `${project.id}-${(expected ?? 'norecord').replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;
    const cacheDir = join(stateDir, 'uplifted', cacheKey);
    if (existsSync(cacheDir)) return { dir: cacheDir, source: 'regenerated-cache', expected };
    const { upliftProject } = await import(upliftPath);
    mkdirSync(dirname(cacheDir), { recursive: true });
    await rm(cacheDir, { recursive: true, force: true });
    upliftProject(project.originalTreeDir, project.spec, cacheDir);
    const actual = hashTree(cacheDir);
    if (expected && actual !== expected) {
      return { dir: cacheDir, source: 'regenerated-mismatch', expected, actual };
    }
    return { dir: cacheDir, source: 'regenerated-verified', expected, actual };
  }

  function verification(project) {
    const result = {};
    const originalExpected = project.decision?.original_sha ?? null;
    if (originalExpected) {
      result.original = hashTree(project.originalTreeDir) === originalExpected ? { status: 'verified' } : { status: 'drifted' };
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

      if (path === '/healthz') return textResponse(response, 'ok');

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
        return htmlResponse(
          response,
          renderProject({ view, runId: corpus.runId, runs: corpus.runs }),
        );
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
        const body = await readFile(fullPath);
        const type = extname(file).toLowerCase() === '.png' ? 'image/png' : extname(file).toLowerCase() === '.json' ? 'application/json' : 'application/octet-stream';
        response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        return response.end(body);
      }

      const liveMatch = path.match(/^\/live\/([a-z0-9-]+)\/(original|uplifted)(\/.*)?$/i);
      if (liveMatch) {
        const [, id, version, rest] = liveMatch;
        if (!VERSIONS.has(version)) return textResponse(response, 'bad version', 400);
        const corpus = load(null);
        const project = findProject(corpus, id);
        if (!project) return textResponse(response, 'no such project', 404);

        const scan = scanFor(project);
        if (scan.status === 'ERROR') {
          return htmlResponse(
            response,
            page('refused', `<h1>live serving refused</h1><p class="danger">The owner-auth scan cannot run (${escapeHtml(scan.reason ?? 'unknown')}), and the rule is fail-closed: a tree that cannot be shown clean of owner-identifying material is not served.</p>`),
            403,
          );
        }

        // Resolve the tree first, then scan exactly the tree that will be served: a regenerated
        // uplifted snapshot is scanned after regeneration, before it is reachable.
        let siteDir;
        let snapshotNote = null;
        if (version === 'original') {
          siteDir = project.originalTreeDir;
        } else {
          const resolved = await ensureUpliftedTree(project);
          if (!resolved.dir) {
            return htmlResponse(
              response,
              page('snapshot unavailable', `<h1>uplifted snapshot unavailable</h1><p class="notice">${escapeHtml(resolved.reason ?? 'the run did not keep the uplifted tree')}</p><p>Re-run the pilot with <code>--keep</code>, or merge the uplift tool, to serve this version.</p>`),
              404,
            );
          }
          if (resolved.source === 'regenerated-mismatch') {
            snapshotNote = `regenerated tree does NOT match the recorded uplifted sha (expected ${resolved.expected}, got ${resolved.actual}) - serving the regenerated tree and saying so`;
          }
          siteDir = resolved.dir;
        }

        const treeScan = scanTreeCached(siteDir);
        if (treeScan.status !== 'PASS') {
          return htmlResponse(
            response,
            page('refused', `<h1>live serving refused</h1><p class="danger">The owner-auth scan of the ${escapeHtml(version)} tree is ${escapeHtml(treeScan.status)}, and the rule is fail-closed: a tree that cannot be shown clean of owner-identifying material is not served. See the <a href="/project/${escapeHtml(id)}">evidence page</a> for the findings.</p>`),
            403,
          );
        }

        let sandbox = pool.get(id, version);
        if (!sandbox?.alive) {
          try {
            sandbox = await pool.start({ projectId: id, version, siteDir });
          } catch (error) {
            return htmlResponse(response, page('sandbox failed', `<h1>the sandboxed site did not start</h1><pre>${escapeHtml(error.message)}</pre>`), 502);
          }
        }
        sandbox.touch();

        if (request.method === 'POST' && rest === '/start') {
          response.writeHead(303, { location: `/live/${id}/${version}/` });
          return response.end();
        }

        const prefix = `/live/${id}/${version}`;
        const sitePath = `${rest ?? '/'}${url.search}`;
        const cookieNamespace = `__vw_${id.replace(/[^a-z0-9]/gi, '')}_${version}_`;
        return proxyRequest({ request, response, socketPath: sandbox.socketPath, prefix, sitePath, cookieNamespace });
      }

      return textResponse(response, 'not found', 404);
    } catch (error) {
      return textResponse(response, `viewer error: ${error.message}`, 500);
    }
  });

  return { server, pool };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  const corpusRoot = resolve(arg('corpus', 'pilot'));
  const port = Number(arg('port', '7700'));
  const host = arg('host', '0.0.0.0');
  const stateDir = resolve(arg('state', '.viewer-state'));
  const { server, pool } = createViewer({ corpusRoot, stateDir });
  const shutdown = () => {
    pool.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  server.listen(port, host, () => {
    console.log(`mwg-train corpus viewer on http://${host}:${port}/ reading corpus ${corpusRoot}`);
  });
}
