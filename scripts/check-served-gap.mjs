import { readFileSync, realpathSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(import.meta.dirname, '..');

export const DEFAULT_SERVED_MD = join(REPO_ROOT, 'docs', 'train', 'corpus', 'SERVED.md');
export const DEFAULT_BASELINE_JSON = join(REPO_ROOT, 'docs', 'train', 'corpus', 'served-routes-baseline.json');

// Exact heading of the unserved routes section in SERVED.md.
// This is a copy of the document's heading and must move with it if renamed or restructured.
export const GAP_SECTION_HEADING = '## What the gap is, precisely';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractGapSectionBody(content, heading = GAP_SECTION_HEADING) {
  if (typeof content !== 'string') return null;

  const headingLevel = heading.match(/^\s*(#{1,6})\s+/)?.[1]?.length ?? 2;
  // Match the heading line exactly (permitting optional leading/trailing whitespace on that line)
  const headingRegex = new RegExp(`^[ \\t]*${escapeRegex(heading.trim())}[ \\t]*(?:\\r?\\n|$)`, 'm');
  const match = headingRegex.exec(content);
  if (!match) {
    return null;
  }

  const afterHeading = content.slice(match.index + match[0].length);
  const lines = afterHeading.split(/\r?\n/);
  const bodyLines = [];
  let inCodeBlock = false;
  let codeFenceChar = '';
  let codeFenceLen = 0;

  const nextHeadingRegex = new RegExp(`^[ \\t]*#{1,${headingLevel}}\\s+`);

  for (const line of lines) {
    const fenceMatch = line.match(/^[ \\t]*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const char = fence[0];
      const len = fence.length;
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeFenceChar = char;
        codeFenceLen = len;
      } else if (char === codeFenceChar && len >= codeFenceLen) {
        inCodeBlock = false;
        codeFenceChar = '';
        codeFenceLen = 0;
      }
    } else if (!inCodeBlock && nextHeadingRegex.test(line)) {
      break;
    }
    bodyLines.push(line);
  }

  return bodyLines.join('\n');
}

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

  const sectionBody = extractGapSectionBody(content, GAP_SECTION_HEADING);
  if (sectionBody === null) {
    return routes;
  }

  for (const match of sectionBody.matchAll(ROUTE_LINE_REGEX)) {
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
  const sectionBody = extractGapSectionBody(servedMdContent, GAP_SECTION_HEADING);
  if (sectionBody === null) {
    return {
      status: 'SECTION_NOT_FOUND',
      exitCode: 1,
      errors: [
        `check-served-gap: FAIL - Could not locate section '${GAP_SECTION_HEADING}' in ${servedMdPath}`,
      ],
      routes: new Set(),
    };
  }

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
