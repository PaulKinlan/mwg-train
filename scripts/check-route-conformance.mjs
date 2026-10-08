/**
 * Check that every tr-* project declares the routes its brief lists.
 *
 * This is the check the corpus never had. `route_conformed` in the corpus record compares only
 * the WRITE route, which is why it read `true` for tr-05 while that project had no `/login` and
 * no `/volunteer/profile` at all. The whole-set comparison lives here instead, so "emits every
 * route its brief lists" is a measured claim rather than prose.
 *
 * Placeholders are compared insensitively: a brief that says `/bookings/:id` and a server that
 * serves `/bookings/:ref` are the same route, and treating them as different would report a gap
 * that no user could observe.
 *
 * Usage:
 *   node scripts/check-route-conformance.mjs [--corpus <record.json>] [--projects <dir>] [--json]
 *
 * Exit 1 when any family is missing a route. What it does NOT check is whether the route is
 * SERVEable: a declared route that 404s is conformant here and dishonest everywhere else, so
 * `scripts/check-served-routes.mjs` probes real servers for that, and the two belong together.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const norm = (path) => path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':x');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const asJson = args.includes('--json');
const corpusPath = flag('--corpus', 'pilot/TRAINING_CORPUS.json');
const projectsRoot = flag('--projects', 'pilot/training-projects');
const manifestPath = flag('--manifest', 'docs/train/briefs/manifest.jsonl');

const readJson = (path) => JSON.parse(readFileSync(isAbsolute(path) ? path : join(REPO_ROOT, path), 'utf8'));
const readJsonl = (path) =>
  readFileSync(isAbsolute(path) ? path : join(REPO_ROOT, path), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

const briefs = readJsonl(manifestPath);
const byFamily = new Map();
for (const brief of briefs) if (!byFamily.has(brief.family_id)) byFamily.set(brief.family_id, brief);

/**
 * Routes a family is known not to declare, with the reason. Empty is the goal.
 *
 * A waiver here is not a way to pass: it names the exact routes and is checked BOTH ways, so a
 * family that starts declaring them fails as a stale waiver until it is removed. Without that, an
 * exception silently outlives the thing it excused - which is how `route_conformed` came to read
 * `true` for a family with no login route.
 */
const KNOWN_BLOCKED = new Map([
  [
    'tr-05',
    {
      routes: ['/login', '/volunteer/profile'],
      reason:
        'needs a functional login route and a session profile page; the shared builder has no login page, ' +
        'no login POST and no logout, and the accounts table it creates is unused. Builder work is a separate bead.',
    },
  ],
]);

const corpus = readJson(corpusPath);
const mismatches = [];
const waived = [];
const staleWaivers = [];
const checked = new Set();
const missingByFamily = new Map();

for (const project of corpus.projects) {
  if (checked.has(project.project_id)) continue;
  checked.add(project.project_id);
  const brief = byFamily.get(project.family_id);
  if (!brief) {
    mismatches.push({ project_id: project.project_id, missing: [], unknown_family: true });
    continue;
  }
  const spec = readJson(join(projectsRoot, project.project_id, 'spec.json'));
  const declared = new Set((spec.routes ?? []).map((route) => norm(route.path)));
  const missing = (brief.routes ?? []).filter((route) => !declared.has(norm(route)));
  if (missing.length === 0) continue;
  missingByFamily.set(project.family_id, missing);
  const waiver = KNOWN_BLOCKED.get(project.family_id);
  const excused = waiver ? missing.filter((route) => waiver.routes.includes(route)) : [];
  const unexplained = waiver ? missing.filter((route) => !waiver.routes.includes(route)) : missing;
  if (excused.length > 0) waived.push({ project_id: project.project_id, family_id: project.family_id, missing: excused, reason: waiver.reason });
  if (unexplained.length > 0) mismatches.push({ project_id: project.project_id, family_id: project.family_id, missing: unexplained });
}

// A waiver for routes the family now declares is stale, and must be removed rather than left to
// quietly excuse something that no longer needs excusing.
for (const [family, waiver] of KNOWN_BLOCKED) {
  const missing = missingByFamily.get(family) ?? [];
  const nowDeclared = waiver.routes.filter((route) => !missing.includes(route));
  if (nowDeclared.length > 0) staleWaivers.push({ family_id: family, now_declared: nowDeclared });
}

const families = [...new Set(corpus.projects.map((project) => project.family_id))];

if (asJson) {
  console.log(
    JSON.stringify({ checked: checked.size, families: families.length, waived: [...new Set(waived.map((w) => w.family_id))], stale_waivers: staleWaivers, mismatches }, null, 2),
  );
} else {
  for (const entry of mismatches) {
    console.log(`FINDING ${entry.project_id}${entry.unknown_family ? ' has no brief' : ` does not declare: ${entry.missing.join(', ')}`}`);
  }
  for (const entry of staleWaivers) {
    console.log(`FINDING ${entry.family_id} now declares ${entry.now_declared.join(', ')} - remove its waiver from KNOWN_BLOCKED`);
  }
  const waivedFamilies = [...new Set(waived.map((entry) => entry.family_id))];
  if (waivedFamilies.length > 0) {
    console.log(
      `check-route-conformance: ${waivedFamilies.length} family(s) excused by an explicit waiver: ${waivedFamilies.join(', ')} - ` +
        `${[...new Set(waived.map((w) => w.reason))].join('; ')}`,
    );
  }
}
const stale = staleWaivers.length > 0;
if (mismatches.length > 0 || stale) {
  console.error(
    `check-route-conformance: FAIL - ${mismatches.length} project(s) missing routes with no waiver${stale ? `, and ${staleWaivers.length} stale waiver(s)` : ''}`,
  );
  process.exit(1);
}
console.log(
  `check-route-conformance: PASS - ${checked.size} project(s) across ${families.length} families declare every route their brief lists` +
    `${waived.length > 0 ? `, ${[...new Set(waived.map((w) => w.family_id))].length} excused by waiver` : ''}`,
);
