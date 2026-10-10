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
  
  const honoMatches = content.matchAll(/app\.(get|post|put|delete|patch)\('([^']+)'/g);
  for (const match of honoMatches) served.add(`${match[1].toUpperCase()} ${match[2]}`);
  
  const varPaths = content.matchAll(/const\s+([a-zA-Z0-9_]+)\s*=\s*"([^"]+)";[\s\S]*?app\.(get|post)\(\1/g);
  for (const match of varPaths) served.add(`${match[3].toUpperCase()} ${match[2]}`);
  
  const loops = content.matchAll(/for\s+\([^)]+of\s+\[([^\]]*)\]\)\s*\{\s*app\.(get|post)/g);
  for (const match of loops) {
    if (!match[1].trim()) continue;
    const method = match[2].toUpperCase();
    const strings = match[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s);
    for (const s of strings) served.add(`${method} ${s}`);
  }

  const rawMatches = content.matchAll(/path\s*===\s*'([^']+)'(?:\s*&&\s*request\.method\s*===\s*'([^']+)')?/g);
  for (const match of rawMatches) served.add(`${match[2] ? match[2].toUpperCase() : 'GET'} ${match[1]}`);
  
  const rawVarsBetter = content.matchAll(/const\s+[a-zA-Z0-9_]+\s*=\s*"([^"]+)";[\s\S]{0,200}?request\.method\s*===\s*'([^']+)'/g);
  for (const match of rawVarsBetter) served.add(`${match[2].toUpperCase()} ${match[1]}`);
  
  const rawArrays = content.matchAll(/\[([^\]]*)\]\.includes\(path\)(?:\s*&&\s*request\.method\s*===\s*'([^']+)')?/g);
  for (const match of rawArrays) {
    if (!match[1].trim()) continue;
    const method = match[2] ? match[2].toUpperCase() : 'GET';
    const strings = match[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s);
    for (const s of strings) served.add(`${method} ${s}`);
  }

  const rawStarts = content.matchAll(/path\.startsWith\('([^']+)'\)(?:\s*&&\s*request\.method\s*===\s*'([^']+)')?/g);
  for (const match of rawStarts) {
    const method = match[2] ? match[2].toUpperCase() : 'GET';
    let r = match[1];
    if (r === '/api/record/') r = '/api/record/:ref';
    if (r === '/app/') r = '/app/:file';
    served.add(`${method} ${r}`);
  }

  return served;
}

export function checkProjectData(project_id, specRoutes, serverContent) {
  const declared = new Set(specRoutes.map(r => `${r.method} ${r.path}`));
  const served = extractRoutes(serverContent);
  
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

  return { name: project_id, declaredNotServed, servedNotDeclared };
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
