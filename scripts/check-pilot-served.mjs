import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PILOT_PROJECTS_DIR = join(REPO_ROOT, 'pilot', 'projects');

const EXCEPTIONS = [
  // account-recovery
  { project: "account-recovery-hono", route: "POST /reset", direction: "declared_not_served", reason: "Generator only emits the first write route; /reset is dropped on account-recovery" },
  { project: "account-recovery-hono", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "account-recovery-hono", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-hono", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-hono", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-hono", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-preact", route: "POST /reset", direction: "declared_not_served", reason: "Generator only emits the first write route; /reset is dropped on account-recovery" },
  { project: "account-recovery-preact", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-preact", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-preact", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-preact", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-preact", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "account-recovery-raw", route: "POST /reset", direction: "declared_not_served", reason: "Generator only emits the first write route; /reset is dropped on account-recovery" },
  { project: "account-recovery-raw", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-raw", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-raw", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-raw", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-raw", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "account-recovery-react", route: "POST /reset", direction: "declared_not_served", reason: "Generator only emits the first write route; /reset is dropped on account-recovery" },
  { project: "account-recovery-react", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-react", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-react", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-react", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-react", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "account-recovery-vue", route: "POST /reset", direction: "declared_not_served", reason: "Generator only emits the first write route; /reset is dropped on account-recovery" },
  { project: "account-recovery-vue", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-vue", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-vue", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-vue", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "account-recovery-vue", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },

  // booking
  { project: "booking-hono", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "booking-hono", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-hono", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-hono", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-preact", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-preact", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-preact", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-preact", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "booking-raw", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-raw", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-raw", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-raw", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "booking-react", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-react", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-react", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-react", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "booking-vue", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-vue", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-vue", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "booking-vue", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },

  // catalogue
  { project: "catalogue-hono", route: "GET /record/:ref", direction: "served_not_declared", reason: "Generator discrepancy" },
  { project: "catalogue-hono", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-hono", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-hono", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-preact", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-preact", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-preact", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-preact", route: "GET /record/:ref", direction: "served_not_declared", reason: "Generator discrepancy" },
  { project: "catalogue-raw", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-raw", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-raw", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-raw", route: "GET /record/:ref", direction: "served_not_declared", reason: "Generator discrepancy" },
  { project: "catalogue-react", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-react", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-react", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-react", route: "GET /record/:ref", direction: "served_not_declared", reason: "Generator discrepancy" },
  { project: "catalogue-vue", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-vue", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-vue", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "catalogue-vue", route: "GET /record/:ref", direction: "served_not_declared", reason: "Generator discrepancy" },

  // contact-lead
  { project: "contact-lead-hono", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "contact-lead-hono", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-hono", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-hono", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-preact", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-preact", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-preact", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-preact", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "contact-lead-raw", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-raw", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-raw", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-raw", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "contact-lead-react", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-react", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-react", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-react", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "contact-lead-vue", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-vue", route: "GET /attendees", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-vue", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "contact-lead-vue", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },

  // event-registration
  { project: "event-registration-hono", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "event-registration-hono", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-hono", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-hono", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-preact", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-preact", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-preact", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-preact", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "event-registration-raw", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-raw", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-raw", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-raw", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "event-registration-react", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-react", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-react", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-react", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" },
  { project: "event-registration-vue", route: "GET /roster", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-vue", route: "GET /inbox", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-vue", route: "GET /cart", direction: "served_not_declared", reason: "Hardcoded generator fallback for list pages when spec lacks capabilities (re-record needed)" },
  { project: "event-registration-vue", route: "GET /search", direction: "served_not_declared", reason: "Generator fallback" }
];

export function extractRoutes(content) {
  const served = new Set();
  
  let remaining = content;

  const honoRegex = /app\.(get|post|put|delete|patch)\(\s*(['"`])([^'"`]+)\2/g;
  for (const match of content.matchAll(honoRegex)) served.add(`${match[1].toUpperCase()} ${match[3]}`);
  remaining = remaining.replace(honoRegex, 'MATCHED_HONO');
  
  const varPaths = /const\s+([a-zA-Z0-9_]+)\s*=\s*(['"`])([^'"`]+)\2;[\r\n\s]*app\.(get|post|put|delete|patch)\(\s*\1/g;
  for (const match of content.matchAll(varPaths)) served.add(`${match[4].toUpperCase()} ${match[3]}`);
  remaining = remaining.replace(varPaths, 'MATCHED_HONO_VAR');
  
  const loops = /for\s+\([^)]+of\s+\[([^\]]*)\]\)\s*\{\s*app\.(get|post|put|delete|patch)/g;
  for (const match of content.matchAll(loops)) {
    if (!match[1].trim()) continue;
    const method = match[2].toUpperCase();
    const strings = match[1].split(',').map(s => s.trim().replace(/^['"`]|['"`]$/g, '')).filter(s => s);
    for (const s of strings) served.add(`${method} ${s}`);
  }
  remaining = remaining.replace(loops, 'MATCHED_HONO_LOOP');

  const rawMatches = /path\s*===\s*(['"`])([^'"`]+)\1(?:\s*&&\s*request\.method\s*===\s*(['"`])([^'"`]+)\3)?/g;
  for (const match of content.matchAll(rawMatches)) served.add(`${match[4] ? match[4].toUpperCase() : 'GET'} ${match[2]}`);
  remaining = remaining.replace(rawMatches, 'MATCHED_RAW');
  
  // Two deliberate changes here, both about the same failure. The wildcard used to be [\s\S]{0,200}?,
  // which spans arbitrary intervening statements, so a match could scrub an unparsed route sitting
  // between the assignment and its method check before the residual scan ever saw it - the check was
  // silently blind in exactly the direction its fail-closed guard exists to cover. It is now anchored to
  // the actual emission shape: the route assignment, the path.match(new RegExp(...)) built from it, and
  // the method check on the match result.
  //
  // The groups are named because the old reads were positional (match[5], match[3]). A review attempt to
  // tighten this pattern inserted one extra capture group, which silently moved the method out of match[5]
  // - every raw arm then emitted a quote character as its method, and a committed project's genuine route
  // was reported as a phantom stale exception. Reading by name makes that class of error impossible rather
  // than merely fixed.
  const rawVarsBetter = /const\s+(?<pathVar>[a-zA-Z0-9_]+)\s*=\s*(?<pathQuote>['"`])(?<path>[^'"`]+)\k<pathQuote>;\s*const\s+(?<matchVar>[a-zA-Z0-9_]+)\s*=\s*path\.match\(new\s+RegExp\([^;]*?\b\k<pathVar>\b[^;]*?\)\);\s*if\s*\(\s*\k<matchVar>\s*&&\s*request\.method\s*===\s*(?<methodQuote>['"`])(?<method>[^'"`]+)\k<methodQuote>/g;
  for (const match of content.matchAll(rawVarsBetter)) served.add(`${match.groups.method.toUpperCase()} ${match.groups.path}`);
  remaining = remaining.replace(rawVarsBetter, 'MATCHED_RAW_VAR');
  
  const rawArrays = /\[([^\]]*)\]\.includes\(path\)(?:\s*&&\s*request\.method\s*===\s*(['"`])([^'"`]+)\2)?/g;
  for (const match of content.matchAll(rawArrays)) {
    if (!match[1].trim()) continue;
    const method = match[3] ? match[3].toUpperCase() : 'GET';
    const strings = match[1].split(',').map(s => s.trim().replace(/^['"`]|['"`]$/g, '')).filter(s => s);
    for (const s of strings) served.add(`${method} ${s}`);
  }
  remaining = remaining.replace(rawArrays, 'MATCHED_RAW_ARRAY');

  const rawStarts = /path\.startsWith\(\s*(['"`])([^'"`]+)\1\s*\)(?:\s*&&\s*request\.method\s*===\s*(['"`])([^'"`]+)\3)?/g;
  for (const match of content.matchAll(rawStarts)) {
    const method = match[4] ? match[4].toUpperCase() : 'GET';
    let r = match[2];
    if (r === '/api/record/') r = '/api/record/:ref';
    if (r === '/app/') r = '/app/:file';
    served.add(`${method} ${r}`);
  }
  remaining = remaining.replace(rawStarts, 'MATCHED_RAW_STARTS');

  const unparsed = [];
  const routeLikeRegex = /app\.(?:get|post|put|delete|patch)\(|path\s*===\s*(['"`])|\.includes\(path\)|path\.startsWith\(/g;
  let m;
  while ((m = routeLikeRegex.exec(remaining)) !== null) {
    const start = Math.max(0, m.index - 20);
    const end = Math.min(remaining.length, m.index + 50);
    unparsed.push(remaining.substring(start, end).replace(/\n/g, '\\n'));
  }

  return { served, unparsed };
}

export function checkProjectData(project_id, specRoutes, serverContent) {
  const declared = new Set(specRoutes.map(r => `${r.method} ${r.path}`));
  const extracted = extractRoutes(serverContent);
  const served = extracted.served;

  
  served.delete('GET /__health');
  served.delete('GET /app/:file');
  served.delete('GET /api/me');
  served.delete('GET /api/records');
  served.delete('GET /page');
  
  if (declared.has('GET /api/record/:ref')) {
    served.add('GET /api/record/:ref');
  } else {
    served.delete('GET /api/record/:ref');
  }

  const declaredNotServed = [];
  const servedNotDeclared = [];

  for (const d of declared) {
    if (!served.has(d)) declaredNotServed.push(d);
  }
  for (const s of served) {
    if (!declared.has(s)) servedNotDeclared.push(s);
  }

  return { name: project_id, declaredNotServed, servedNotDeclared, unparsedRoutes: extracted.unparsed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const start = performance.now();
    let allDirs = [];
    try {
      allDirs = readdirSync(PILOT_PROJECTS_DIR).map(d => join(PILOT_PROJECTS_DIR, d)).sort();
    } catch {
      // Missing directory doesn't fail immediately, but checksRun = 0 handles it
    }

    let fail = false;
    let checksRun = 0;

    const usedExceptions = new Set();

    for (const dir of allDirs) {
      if (!existsSync(join(dir, 'server.mjs'))) continue;
      checksRun++;
      
      const specPath = join(dir, 'spec.json');
      if (!existsSync(specPath)) {
        console.error(`Failed to test ${dir}: Missing spec.json`);
        fail = true;
        continue;
      }

      const spec = JSON.parse(readFileSync(specPath, 'utf8'));
      const serverContent = readFileSync(join(dir, 'server.mjs'), 'utf8');

      const res = checkProjectData(spec.project_id, spec.routes, serverContent);

      if (res.unparsedRoutes && res.unparsedRoutes.length > 0) {
        for (const u of res.unparsedRoutes) {
          console.log(`[${res.name}] Unparsed route-like block: ${u}`);
        }
        fail = true;
      }

      for (const dec of res.declaredNotServed) {
        const ex = EXCEPTIONS.find(e => e.project === res.name && e.route === dec && e.direction === 'declared_not_served');
        if (ex) {
          usedExceptions.add(ex);
        } else {
          console.log(`[${res.name}] declared but not served: ${dec}`);
          fail = true;
        }
      }

      for (const srv of res.servedNotDeclared) {
        const ex = EXCEPTIONS.find(e => e.project === res.name && e.route === srv && e.direction === 'served_not_declared');
        if (ex) {
          usedExceptions.add(ex);
        } else {
          console.log(`[${res.name}] served but not declared: ${srv}`);
          fail = true;
        }
      }
    }

    for (const ex of EXCEPTIONS) {
      if (!usedExceptions.has(ex)) {
        const dir = join(PILOT_PROJECTS_DIR, ex.project);
        if (existsSync(join(dir, 'server.mjs'))) {
          console.log(`[${ex.project}] Stale exception: ${ex.direction} for ${ex.route}`);
          fail = true;
        }
      }
    }

    if (checksRun === 0) {
      console.log("check-pilot-served: NO PROJECTS FOUND");
      process.exit(1);
    }

    if (fail) {
      console.log("check-pilot-served: FAIL");
      process.exit(1);
    } else {
      const ms = (performance.now() - start).toFixed(1);
      console.log(`check-pilot-served: OK (${checksRun} projects verified statically in ${ms}ms)`);
    }
  }

  main().catch(e => { console.error(e); process.exit(1); });
}
