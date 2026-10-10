/**
 * Probe real servers across tr-* training projects to measure which declared routes are actually served.
 *
 * This corpus has claimed that projects emit every route their brief lists, but that
 * is a claim about `spec.json`. The generated servers hardcode listing routes to
 * `/roster`, `/inbox`, `/attendees`, `/cart`, `/search`, meaning declared list routes
 * like `/courses` 404. This check starts project servers on ephemeral ports, polls `/`
 * until ready, issues GET requests for each declared route in `spec.json`, and records
 * which routes are actually served versus 404/405/5xx.
 *
 * Usage:
 *   node scripts/check-served-routes.mjs [--limit <N>] [--families tr-01,tr-05] [--out <file>] [--json] [--expect-all]
 *
 * Scope:
 *   By default, takes one project per distinct archetype ordered by family id, capped
 *   at --limit (default 7). Never defaults to all 210 projects since this starts real servers.
 *
 * Convention:
 *   Each route is probed with its DECLARED method.
 *   HTTP status < 400 counts as SERVED, as does another 4xx such as 422 where the handler ran
 *   and rejected the request.
 *   HTTP status 404 or 405 counts as NOT SERVED.
 *   HTTP status >= 500 or connection failure counts as ERROR.
 *   Write routes are probed with POST, and read-by-reference routes with a record the server
 *   itself created - a 404 for a ref that was never written is the correct answer, not a gap.
 *
 * Verdict (mwg-train-xku). A run that could not MEASURE is not a run that measured everything and found it
 * fine. This script used to print "MEASURED - 0/0 declared route(s) served across 7 project(s) (0 not
 * served)" and exit 0 in a tree where every project failed, so it reported a measurement it had not made
 * and could never fail. Now:
 *   - the projects are GENERATED (pilot/training-projects is gitignored), so if they are absent and the
 *     caller did not name a path, the run is a labelled SKIP naming the command that produces them, and it
 *     exits 0. A clean checkout legitimately lacks them, and failing there would be red for a reason that is
 *     not a defect - which is how a gate stops being read.
 *   - a projects path the caller NAMED that does not exist is fatal, not a skip: a typo must not look clean.
 *   - a project that could not be measured, or a route probe that errored, fails the run. An unmeasured
 *     route is not a served one.
 *   - routes that ARE measured and are NOT served are reported and gate only under --expect-all, because
 *     that divergence is the documented gap this tool exists to measure.
 */
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PROJECT_TIMEOUT_MS = 25000;
const SERVER_POLL_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;

const CANONICAL_KINDS = [
  'page',
  'write',
  'read-by-reference',
  'read-session',
  'list',
  'list-detail',
  'search',
];

const CONVENTION_DESCRIPTION =
  'served = status < 400, or another 4xx that means the handler ran (422); 404 and 405 = NOT SERVED; >= 500 or network failure = ERROR. Write routes are probed with POST and read-by-reference routes with a record the server created';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
};
const hasFlag = (name) => args.includes(name);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`Usage: node scripts/check-served-routes.mjs [options]

Measures which declared routes across tr-* training projects are actually served by real servers.

Options:
  --limit <N>             Maximum number of projects to test (default: 7)
  --families <list>       Comma-separated list of families to test (e.g. tr-01,tr-05)
  --out <file>            Write JSON results to file
  --json                  Output JSON results to stdout
  --expect-all            Also exit 1 if a declared route is not served. Unmeasurable projects and route
                          probe errors fail the run with or without this flag.
  --corpus <file>         Path to TRAINING_CORPUS.json (default: pilot/TRAINING_CORPUS.json)
  --manifest <file>       Path to briefs manifest.jsonl (default: docs/train/briefs/manifest.jsonl)
  --projects <dir>        Path to projects dir (default: pilot/training-projects). Naming a path that does
                          not exist is a fatal error; the default being absent is a labelled skip.
  -h, --help              Show this help message
`);
  process.exit(0);
}

const limitArg = flag('--limit', '7');
const limit = Number.parseInt(limitArg, 10) || 7;
const familiesArg = flag('--families', null);
const outPath = flag('--out', null);
const asJson = hasFlag('--json');
const expectAll = hasFlag('--expect-all');
const corpusPath = flag('--corpus', 'pilot/TRAINING_CORPUS.json');
const manifestPath = flag('--manifest', 'docs/train/briefs/manifest.jsonl');
const projectsRoot = flag('--projects', 'pilot/training-projects');
// Whether the caller NAMED the path, which decides whether its absence is an error or a skip.
const projectsRootNamed = hasFlag('--projects');

const readJson = (path) => JSON.parse(readFileSync(isAbsolute(path) ? path : join(REPO_ROOT, path), 'utf8'));
const readJsonl = (path) =>
  readFileSync(isAbsolute(path) ? path : join(REPO_ROOT, path), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

const allUsedPorts = new Set();
const allCreatedDbs = new Set();
const activeServers = new Map();

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function findListenerPid(port) {
  try {
    const out = execFileSync('ss', ['-ltnp', `( sport = :${port} )`], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const match = out.match(/pid=(\d+)/);
    return match ? Number.parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function killProcessGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (err) {
    if (err.code !== 'ESRCH') {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

function stopServer(child, port) {
  if (child?.pid) {
    killProcessGroup(child.pid);
  }
  const listenerPid = findListenerPid(port);
  if (listenerPid) {
    killProcessGroup(listenerPid);
  }
  for (let i = 0; i < 5; i++) {
    const remaining = findListenerPid(port);
    if (!remaining) break;
    killProcessGroup(remaining);
    sleepSync(100);
  }
}

function cleanupDb(dbPath) {
  if (!dbPath) return;
  for (const ext of ['', '-wal', '-shm', '-journal']) {
    try {
      if (existsSync(dbPath + ext)) unlinkSync(dbPath + ext);
    } catch {}
  }
}

function emergencyCleanup() {
  for (const [port, { child, dbPath }] of activeServers) {
    try { stopServer(child, port); } catch {}
    try { cleanupDb(dbPath); } catch {}
  }
  for (const port of allUsedPorts) {
    try {
      const pid = findListenerPid(port);
      if (pid) killProcessGroup(pid);
    } catch {}
  }
  for (const dbPath of allCreatedDbs) {
    try { cleanupDb(dbPath); } catch {}
  }
}

process.on('SIGINT', () => {
  emergencyCleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  emergencyCleanup();
  process.exit(143);
});

function fillParams(routePath) {
  return routePath
    .replace(/:ref\b/g, 'missing-ref')
    .replace(/:id\b/g, '1')
    .replace(/:eventId\b/g, '1')
    .replace(/:slug\b/g, 'sample-item')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '1');
}

function classifyStatus(status) {
  if (status >= 200 && status < 400) return 'served';
  if (status === 404 || status === 405) return 'not-served';
  if (status >= 500 || status === 0) return 'error';
  // Any other 4xx means the handler ran and rejected the request (422 on a validation failure, say),
  // which proves the route exists. Counting it as not served was how a route that answers POST with
  // 422 - and a read route that answers 404 for a record that was never created - came to look absent.
  return 'served';
}

/** A body the write route will accept as far as shape goes, so a 4xx means "handler ran", not "no route". */
function bodyForFields(fields) {
  const form = new URLSearchParams();
  for (const field of fields ?? []) {
    if (!field?.name) continue;
    // A select always submits a value, and the servers never require one, so a placeholder is enough.
    const value = field.type === 'email' ? 'probe@example.test' : field.type === 'number' ? '1' : field.type === 'date' ? '2026-01-01' : field.type === 'time' ? '09:00' : 'probe';
    form.set(field.name, value);
  }
  return form;
}

async function waitForServer(port, deadlineMs = SERVER_POLL_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(500),
      });
      if (res.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function selectProjects(corpus, options) {
  const { limit, familiesArg } = options;
  const projects = corpus.projects ?? [];

  if (familiesArg) {
    const requested = familiesArg.split(',').map((s) => s.trim()).filter(Boolean);
    const filtered = projects.filter((p) => requested.includes(p.family_id));
    const byFamily = new Map();
    for (const p of filtered) {
      if (!byFamily.has(p.family_id)) {
        byFamily.set(p.family_id, p);
      }
    }
    return [...byFamily.values()].slice(0, limit);
  }

  const byArchetype = new Map();
  for (const p of projects) {
    if (!byArchetype.has(p.archetype)) {
      byArchetype.set(p.archetype, p);
    }
  }
  return [...byArchetype.values()].slice(0, limit);
}

async function probeProject(project, projectsRoot) {
  const projectDir = isAbsolute(projectsRoot)
    ? join(projectsRoot, project.project_id)
    : join(REPO_ROOT, projectsRoot, project.project_id);

  const specPath = join(projectDir, 'spec.json');
  if (!existsSync(specPath)) {
    return {
      project_id: project.project_id,
      family_id: project.family_id,
      archetype: project.archetype,
      framework: project.framework,
      error: 'spec.json not found',
      routes: [],
      served: 0,
      not_served: 0,
      errors: 1,
    };
  }

  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const declaredRoutes = spec.routes ?? [];
  // A read-by-reference route cannot be probed with a made-up ref: 404 for a record that was never
  // created is the CORRECT answer, and reading it as "the route is missing" is how every tr-* project
  // came to look as though it served no read route at all. Create a record through the write route
  // first and read the reference the server itself handed back.
  let recordUrl = null;
  const writeRoute = declaredRoutes.find((route) => (route.method ?? 'GET') === 'POST');
  const specFields = spec.fields ?? [];
  const port = await getFreePort();
  const dbPath = join('/tmp', `check-served-${project.project_id}-${Date.now()}-${randomUUID().slice(0, 8)}.sqlite`);

  allUsedPorts.add(port);
  allCreatedDbs.add(dbPath);

  let child = null;
  const routeResults = [];
  const projectDeadline = Date.now() + PROJECT_TIMEOUT_MS;

  try {
    child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    activeServers.set(port, { child, dbPath });

    const maxWaitMs = Math.min(SERVER_POLL_TIMEOUT_MS, Math.max(1000, projectDeadline - Date.now()));
    const isReady = await waitForServer(port, maxWaitMs);
    if (!isReady) {
      for (const r of declaredRoutes) {
        routeResults.push({
          declared_path: r.path,
          probed_path: fillParams(r.path),
          declared_method: r.method ?? 'GET',
          kind: r.kind ?? 'unknown',
          status: 0,
          outcome: 'error',
          is_served: false,
          error: 'server did not answer on /',
        });
      }
      return {
        project_id: project.project_id,
        family_id: project.family_id,
        archetype: project.archetype,
        framework: project.framework,
        server_ready: false,
        error: 'server failed to start or poll / timed out',
        routes: routeResults,
        served: 0,
        not_served: 0,
        errors: declaredRoutes.length,
      };
    }

    for (const r of declaredRoutes) {
      if (Date.now() > projectDeadline) {
        routeResults.push({
          declared_path: r.path,
          probed_path: fillParams(r.path),
          declared_method: r.method ?? 'GET',
          kind: r.kind ?? 'unknown',
          status: 0,
          outcome: 'error',
          is_served: false,
          error: 'project testing timed out',
        });
        continue;
      }

      const probePath = fillParams(r.path);
      const method = r.method ?? 'GET';
      // Probe each route with its DECLARED method. A POST-only route answering 404 to a GET says
      // nothing about whether it is served, and the earlier baseline wrongly reported every write
      // route as missing on exactly that mistake.
      let url = `http://127.0.0.1:${port}${probePath}`;
      if (method === 'GET' && (r.kind ?? '') === 'read-by-reference' && recordUrl) {
        url = recordUrl.startsWith('http') ? recordUrl : `http://127.0.0.1:${port}${recordUrl}`;
      }

      try {
        const res = await fetch(url, {
          method,
          redirect: 'manual',
          headers: method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
          body: method === 'POST' ? bodyForFields(specFields).toString() : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const status = res.status;
        if (method === 'POST' && status >= 300 && status < 400) {
          const location = res.headers.get('location');
          if (location) recordUrl = location;
        }
        const outcome = classifyStatus(status);
        const isServed = outcome === 'served';

        routeResults.push({
          declared_path: r.path,
          probed_path: url === `http://127.0.0.1:${port}${probePath}` ? probePath : 'the reference the server returned',
          declared_method: method,
          kind: r.kind ?? 'unknown',
          status,
          outcome,
          is_served: isServed,
          probed_with_created_record: Boolean(recordUrl) && (r.kind ?? '') === 'read-by-reference',
        });
      } catch (err) {
        routeResults.push({
          declared_path: r.path,
          probed_path: probePath,
          declared_method: method,
          kind: r.kind ?? 'unknown',
          status: 0,
          outcome: 'error',
          is_served: false,
          error: err.name === 'TimeoutError' ? 'request timed out' : err.message,
        });
      }
    }
  } finally {
    stopServer(child, port);
    cleanupDb(dbPath);
    activeServers.delete(port);
  }

  const servedCount = routeResults.filter((r) => r.is_served).length;
  const notServedCount = routeResults.filter((r) => r.outcome === 'not-served').length;
  const errorCount = routeResults.filter((r) => r.outcome === 'error').length;

  return {
    project_id: project.project_id,
    family_id: project.family_id,
    archetype: project.archetype,
    framework: project.framework,
    server_ready: true,
    routes: routeResults,
    served: servedCount,
    not_served: notServedCount,
    errors: errorCount,
  };
}

/**
 * What a finished run should do. Pure, so the verdict is tested without starting a server.
 *
 * The distinction this encodes is the whole of mwg-train-xku: a run that could not measure is not a run that
 * measured everything and found it fine. See the Verdict note at the top of this file for why the absent
 * default and the absent named path are deliberately different.
 */
export function runVerdict({
  projectsRootExists = true,
  projectsRootNamed = false,
  unmeasuredProjects = [],
  totalErrors = 0,
  totalNotServed = 0,
  expectAll = false,
} = {}) {
  if (!projectsRootExists) {
    return projectsRootNamed ? { status: 'FATAL', code: 2 } : { status: 'SKIPPED', code: 0 };
  }
  if (unmeasuredProjects.length > 0 || totalErrors > 0) return { status: 'FAIL', code: 1 };
  if (expectAll && totalNotServed > 0) return { status: 'FAIL', code: 1 };
  return { status: 'MEASURED', code: 0 };
}

async function main() {
  // The projects are generated, so whether they exist decides what the run can mean BEFORE anything is read.
  const projectsRootAbs = isAbsolute(projectsRoot) ? projectsRoot : join(REPO_ROOT, projectsRoot);
  const projectsRootExists = existsSync(projectsRootAbs);
  const rootVerdict = runVerdict({ projectsRootExists, projectsRootNamed });
  if (rootVerdict.status === 'FATAL') {
    console.error(
      `check-served-routes: FATAL - the projects directory you named does not exist: ${projectsRootAbs}\n` +
        '  A named path that is not there is an error rather than a skip, so that a typo cannot look like a clean run.',
    );
    return rootVerdict.code;
  }
  if (rootVerdict.status === 'SKIPPED') {
    console.log(
      `check-served-routes: SKIPPED - ${projectsRootAbs} does not exist, so no route was measured.\n` +
        '  These projects are generated and deliberately not committed, so a clean checkout never has them.\n' +
        '  This is NOT a served-routes result and says nothing about whether any route is served.\n' +
        '  Run `npm run pilot:scaffold` to produce the projects, then run this again.\n' +
        '  (Naming the path with --projects makes its absence a fatal error instead.)',
    );
    return rootVerdict.code;
  }

  const corpus = readJson(corpusPath);
  const briefs = readJsonl(manifestPath);
  const briefsByFamily = new Map();
  for (const b of briefs) {
    if (!briefsByFamily.has(b.family_id)) briefsByFamily.set(b.family_id, b);
  }

  const selectedProjects = selectProjects(corpus, { limit, familiesArg });

  if (selectedProjects.length === 0) {
    console.error('check-served-routes: no projects selected');
    process.exit(1);
  }

  const projectReports = [];
  for (const project of selectedProjects) {
    const report = await probeProject(project, projectsRoot);
    projectReports.push(report);
  }

  const byKind = {};
  for (const k of CANONICAL_KINDS) {
    byKind[k] = { declared: 0, served: 0, not_served: 0, errors: 0 };
  }

  let totalDeclared = 0;
  let totalServed = 0;
  let totalNotServed = 0;
  let totalErrors = 0;
  const notServedRoutes = [];

  for (const proj of projectReports) {
    for (const r of proj.routes) {
      totalDeclared++;
      if (!byKind[r.kind]) {
        byKind[r.kind] = { declared: 0, served: 0, not_served: 0, errors: 0 };
      }
      byKind[r.kind].declared++;

      if (r.is_served) {
        totalServed++;
        byKind[r.kind].served++;
      } else if (r.outcome === 'not-served') {
        totalNotServed++;
        byKind[r.kind].not_served++;
        notServedRoutes.push({
          project_id: proj.project_id,
          family_id: proj.family_id,
          archetype: proj.archetype,
          kind: r.kind,
          declared_path: r.declared_path,
          probed_path: r.probed_path,
          declared_method: r.declared_method,
          status: r.status,
        });
      } else {
        totalErrors++;
        byKind[r.kind].errors++;
      }
    }
  }

  // A project that never yielded a route result was not measured at all - its spec was missing, or
  // its server never answered - so it must not pass --expect-all by contributing no 404s. Counting
  // only per-route errors let a project that produced nothing at all look like a clean run.
  const unmeasuredProjects = projectReports.filter((proj) => proj.error || (proj.errors ?? 0) > 0).map((proj) => proj.project_id);

  const verdict = runVerdict({ projectsRootExists: true, unmeasuredProjects, totalErrors, totalNotServed, expectAll });
  // Say WHICH failure it was: "could not measure" and "measured, but not served" are different problems with
  // different fixes, and the old message could not express the first at all while exiting 0 over it.
  const failMessage = () =>
    unmeasuredProjects.length > 0 || totalErrors > 0
      ? `check-served-routes: FAIL - ${unmeasuredProjects.length} project(s) not measured and ${totalErrors} route probe error(s) across ${selectedProjects.length} project(s): an unmeasured route is not a served one`
      : `check-served-routes: FAIL - ${totalNotServed} declared route(s) not served across ${selectedProjects.length} project(s) (--expect-all requested)`;

  // End-of-run cleanup verification
  const lingeringPorts = [];
  for (const p of allUsedPorts) {
    const pid = findListenerPid(p);
    if (pid) {
      lingeringPorts.push({ port: p, pid });
      killProcessGroup(pid);
    }
  }

  const remainingDbs = [];
  for (const p of allCreatedDbs) {
    for (const ext of ['', '-wal', '-shm', '-journal']) {
      if (existsSync(p + ext)) {
        remainingDbs.push(p + ext);
        try { unlinkSync(p + ext); } catch {}
      }
    }
  }

  const report = {
    convention: CONVENTION_DESCRIPTION,
    timestamp: new Date().toISOString(),
    scope: {
      limit,
      families: familiesArg ? familiesArg.split(',').map((s) => s.trim()) : null,
      projects_checked: selectedProjects.length,
    },
    summary: {
      declared_routes: totalDeclared,
      served: totalServed,
      not_served: totalNotServed,
      errors: totalErrors,
      by_kind: byKind,
    },
    not_served_routes: notServedRoutes,
    verification: {
      tested_ports: [...allUsedPorts],
      lingering_listeners: lingeringPorts.length,
      remaining_temp_dbs: remainingDbs.length,
    },
    projects: projectReports,
  };

  if (outPath) {
    const resolvedOut = isAbsolute(outPath) ? outPath : join(REPO_ROOT, outPath);
    mkdirSync(dirname(resolvedOut), { recursive: true });
    writeFileSync(resolvedOut, JSON.stringify(report, null, 2), 'utf8');
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const proj of projectReports) {
      const summaryParts = [`${proj.served}/${proj.routes.length} served`];
      if (proj.not_served > 0) summaryParts.push(`${proj.not_served} not served`);
      if (proj.errors > 0) summaryParts.push(`${proj.errors} error(s)`);
      console.log(`  ${proj.project_id} (${proj.archetype}, ${proj.framework}): ${summaryParts.join(', ')}`);
    }

    console.log('');
    console.log(`check-served-routes: Convention: ${CONVENTION_DESCRIPTION}`);
    console.log(`Checked ${selectedProjects.length} project(s): ${totalDeclared} declared routes total`);
    console.log(`  Served:     ${totalServed} / ${totalDeclared}${totalDeclared ? ` (${((totalServed / totalDeclared) * 100).toFixed(1)}%)` : ''}`);
    console.log(`  Not served: ${totalNotServed} / ${totalDeclared}${totalDeclared ? ` (${((totalNotServed / totalDeclared) * 100).toFixed(1)}%)` : ''}`);
    if (totalErrors > 0) {
      console.log(`  Errors:     ${totalErrors} / ${totalDeclared}`);
    }

    console.log('');
    console.log('Breakdown by declared route kind:');
    const allKinds = [...new Set([...CANONICAL_KINDS, ...Object.keys(byKind)])];
    for (const kind of allKinds) {
      const k = byKind[kind] ?? { declared: 0, served: 0, not_served: 0, errors: 0 };
      const errStr = k.errors > 0 ? `, ${k.errors} errors` : '';
      console.log(`  ${kind.padEnd(20)}: ${String(k.served).padStart(3)} / ${String(k.declared).padEnd(3)} served (${k.not_served} not served${errStr})`);
    }

    if (notServedRoutes.length > 0) {
      console.log('');
      console.log(`Not-served declared routes (${notServedRoutes.length} total):`);
      for (const nr of notServedRoutes) {
        const probeNote = nr.probed_path !== nr.declared_path ? ` (probe: ${nr.probed_path})` : '';
        console.log(`  ${nr.project_id.padEnd(14)} [${nr.kind}]`.padEnd(38) + ` ${nr.declared_path}${probeNote} [${nr.declared_method}] -> ${nr.status || 'ERR'}`);
      }
    }

    console.log('');
    console.log('Server cleanup verification:');
    console.log(`  Tested ports: ${[...allUsedPorts].join(', ')}`);
    console.log(`  Lingering server listeners: ${lingeringPorts.length}`);
    console.log(`  Temporary databases remaining in /tmp: ${remainingDbs.length}`);
    if (lingeringPorts.length === 0 && remainingDbs.length === 0) {
      console.log('  Verified: no test servers lingering, no temporary databases remain.');
    }
    console.log('');

    if (verdict.status === 'FAIL') {
      console.error(failMessage());
    } else {
      console.log(
        `check-served-routes: MEASURED - ${totalServed}/${totalDeclared} declared route(s) served across ${selectedProjects.length} project(s) (${totalNotServed} not served)`,
      );
    }
  }

  // The verdict already covers the JSON path, where no summary is printed but the exit code still decides
  // whether a caller can tell a real measurement from a run that measured nothing.
  return verdict.code;
}

// Import-safe: runVerdict is a pure exported function that the tests exercise, so importing this module
// must not start probing servers.
//
// Resolved through realpath, unlike the `file://${resolve(argv[1])}` form the other scripts use. Node
// resolves symlinks when it loads a module, so under that form a symlinked invocation makes import.meta.url
// the real path and argv[1] the link, the guard concludes "imported", and the CLI exits 0 having done
// NOTHING. For a check, exiting 0 having done nothing is the exact defect this file was fixed for, so it is
// not a form worth copying. A test drives the CLI through a symlink to keep it that way.
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      emergencyCleanup();
      console.error('check-served-routes: FATAL -', err);
      process.exitCode = 1;
    });
}
