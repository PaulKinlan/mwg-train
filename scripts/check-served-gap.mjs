import { readFileSync, realpathSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(import.meta.dirname, '..');

export const DEFAULT_SERVED_MD = join(REPO_ROOT, 'docs', 'train', 'corpus', 'SERVED.md');
export const DEFAULT_BASELINE_JSON = join(REPO_ROOT, 'docs', 'train', 'corpus', 'served-routes-baseline.json');

// Matches list-detail unserved routes however punctuated:
// - Optional leading indentation
// - Optional bullet: -, *, or +
// - 'list-detail' with optional markdown wrappers (*, _, `) and optional colon
// - One or more spaces
// - Route path starting with '/', wrapped in optional markdown delimiters (*, _, `)
// - One or more spaces
// - Project ID inside parentheses with optional archetype after a comma
// - Optional trailing period or colon, and trailing spaces
export const ROUTE_LINE_REGEX = /^\s*(?:[-*+]\s+)?(?:[`*_]*list-detail[`*_]*:?)\s+([`*_]*)\s*(\/[a-zA-Z0-9_/:.-]+?)\s*([`*_]*)\s+\(\s*[`*_]*([a-zA-Z0-9_-]+)[`*_]*\s*(?:,[^)]*)?\)\s*[:.]?\s*$/gm;

export function extractUnservedRoutes(content) {
  const routes = new Set();
  if (typeof content !== 'string') return routes;
  for (const match of content.matchAll(ROUTE_LINE_REGEX)) {
    const route = match[2];
    const projectId = match[4];
    if (route && route.startsWith('/') && projectId) {
      routes.add(`${projectId}:${route}`);
    }
  }
  return routes;
}

export function evaluateServedGap({
  servedMdContent,
  baselineData,
  servedMdPath = 'docs/train/corpus/SERVED.md',
}) {
  const proseRoutes = extractUnservedRoutes(servedMdContent);

  if (proseRoutes.size === 0) {
    return {
      status: 'PARSE_ERROR',
      exitCode: 1,
      errors: [
        `check-served-gap: FAIL - Could not parse unserved route list from ${servedMdPath}: expected list items matching 'list-detail <route> (<project>, ...)', found zero route-shaped entries`,
      ],
      routes: proseRoutes,
    };
  }

  const artefactRoutes = new Set();
  const notServed = baselineData?.not_served_routes ?? [];
  for (const r of notServed) {
    artefactRoutes.add(`${r.project_id}:${r.declared_path}`);
  }

  const errors = [];

  for (const pr of proseRoutes) {
    if (!artefactRoutes.has(pr)) {
      errors.push(`check-served-gap: FAIL - Route ${pr} is in SERVED.md but not in served-routes-baseline.json`);
    }
  }

  for (const ar of artefactRoutes) {
    if (!proseRoutes.has(ar)) {
      errors.push(`check-served-gap: FAIL - Route ${ar} is in served-routes-baseline.json but not in SERVED.md`);
    }
  }

  if (proseRoutes.size < 4) {
    errors.push(`check-served-gap: FAIL - Floor on the list-detail 404 gap count not met (found ${proseRoutes.size}, expected >= 4)`);
  }

  if (errors.length > 0) {
    return {
      status: 'MISMATCH',
      exitCode: 1,
      errors,
      routes: proseRoutes,
    };
  }

  return {
    status: 'PASS',
    exitCode: 0,
    errors: [],
    routes: proseRoutes,
    message: `check-served-gap: PASS - ${proseRoutes.size} unserved routes agree exactly between SERVED.md and served-routes-baseline.json`,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  let servedMdPath = DEFAULT_SERVED_MD;
  let baselineJsonPath = DEFAULT_BASELINE_JSON;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--served' && argv[i + 1]) {
      servedMdPath = resolve(argv[++i]);
    } else if (argv[i] === '--baseline' && argv[i + 1]) {
      baselineJsonPath = resolve(argv[++i]);
    }
  }

  const servedMdContent = readFileSync(servedMdPath, 'utf8');
  const baselineData = JSON.parse(readFileSync(baselineJsonPath, 'utf8'));
  const relPath = relative(REPO_ROOT, servedMdPath) || servedMdPath;

  const result = evaluateServedGap({
    servedMdContent,
    baselineData,
    servedMdPath: relPath,
  });

  if (result.status === 'PASS') {
    console.log(result.message);
    process.exit(0);
  } else {
    for (const err of result.errors) {
      console.error(err);
    }
    process.exit(result.exitCode);
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isDirectExecution()) {
  runCli();
}
