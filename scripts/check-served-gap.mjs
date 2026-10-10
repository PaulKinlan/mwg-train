import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import process from 'node:process';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const SERVED_MD = join(REPO_ROOT, 'docs', 'train', 'corpus', 'SERVED.md');
const BASELINE_JSON = join(REPO_ROOT, 'docs', 'train', 'corpus', 'served-routes-baseline.json');

const servedMdContent = readFileSync(SERVED_MD, 'utf8');
const baselineData = JSON.parse(readFileSync(BASELINE_JSON, 'utf8'));

// Parse the expected list of list-detail routes from SERVED.md prose
const routeMatches = [...servedMdContent.matchAll(/list-detail `([^`]+)`\s+\(([^,]+),/g)];

const proseRoutes = new Set();
for (const match of routeMatches) {
  proseRoutes.add(`${match[2]}:${match[1]}`);
}

const artefactRoutes = new Set();
for (const r of baselineData.not_served_routes) {
  artefactRoutes.add(`${r.project_id}:${r.declared_path}`);
}

let fail = false;

for (const pr of proseRoutes) {
  if (!artefactRoutes.has(pr)) {
    console.error(`check-served-gap: FAIL - Route ${pr} is in SERVED.md but not in served-routes-baseline.json`);
    fail = true;
  }
}

for (const ar of artefactRoutes) {
  if (!proseRoutes.has(ar)) {
    console.error(`check-served-gap: FAIL - Route ${ar} is in served-routes-baseline.json but not in SERVED.md`);
    fail = true;
  }
}

if (proseRoutes.size < 4) {
  console.error(`check-served-gap: FAIL - Floor on the list-detail 404 gap count not met (found ${proseRoutes.size}, expected >= 4)`);
  fail = true;
}

if (fail) {
  process.exit(1);
} else {
  console.log(`check-served-gap: PASS - ${proseRoutes.size} unserved routes agree exactly between SERVED.md and served-routes-baseline.json`);
}
