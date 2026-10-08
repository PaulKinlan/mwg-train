/**
 * Corpus discovery for the viewer.
 *
 * The corpus layout the viewer reads (produced by the pilot, bead mwg-train-sk1):
 *
 *   <corpus>/projects/<project_id>/spec.json
 *   <corpus>/projects/<project_id>/...            (the original tree, immutable once scaffolded)
 *   <corpus>/out/<run_id>/yield.json
 *   <corpus>/out/<run_id>/<project_id>/decision.json
 *   <corpus>/out/<run_id>/<project_id>/original.json
 *   <corpus>/out/<run_id>/<project_id>/uplifted.json
 *   <corpus>/out/<run_id>/<project_id>/evidence/*.png|*.json
 *   <repo>/.pilot-uplifted/<run_id>/<project_id>/...   (uplifted trees, kept runs; an earlier
    *   layout used <corpus>/out/<run_id>/uplifted/<project_id> - both are discovered)
 *
 * The viewer never invents state: a project with no run record is shown as "no run recorded", a
 * missing record field is shown as absent, and a reject is rendered with the same prominence as an
 * accept. Acceptance bias is only inspectable if the rejects are as visible as the winners.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** List run ids, newest first (run ids are ISO timestamps, so lexical order is chronological). */
export function listRuns(corpusRoot) {
  const outDir = join(corpusRoot, 'out');
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

/**
 * Load the corpus view for one run (or all projects without a run). Returns:
 * { runId, runs, projects: [ { id, spec, decision, original, uplifted, evidenceDir, runDir,
 *   upliftedTreeDir } ], yieldReport }
 */
export function loadCorpus(corpusRoot, runId = null) {
  const projectsRoot = join(corpusRoot, 'projects');
  const runs = listRuns(corpusRoot);
  const selectedRun = runId ?? runs[0] ?? null;
  const runDir = selectedRun ? join(corpusRoot, 'out', selectedRun) : null;

  const projectIds = existsSync(projectsRoot)
    ? readdirSync(projectsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];

  const projects = [];
  for (const id of projectIds) {
    const projectDir = join(projectsRoot, id);
    const spec = readJson(join(projectDir, 'spec.json'));
    const projectRunDir = runDir && existsSync(join(runDir, id)) ? join(runDir, id) : null;
    const decision = projectRunDir ? readJson(join(projectRunDir, 'decision.json')) : null;
    const original = projectRunDir ? readJson(join(projectRunDir, 'original.json')) : null;
    const uplifted = projectRunDir ? readJson(join(projectRunDir, 'uplifted.json')) : null;
    // Uplifted trees: the pilot keeps them at <repo>/.pilot-uplifted/<runId>/<id> (the corpus root
    // is usually <repo>/pilot); an earlier layout put them under the run dir. Check both.
    const siblingUplifted = runDir ? join(dirname(corpusRoot), '.pilot-uplifted', selectedRun, id) : null;
    const legacyUplifted = runDir ? join(runDir, 'uplifted', id) : null;
    const upliftedTreeDir =
      (siblingUplifted && existsSync(siblingUplifted) && siblingUplifted) ||
      (legacyUplifted && existsSync(legacyUplifted) && legacyUplifted) ||
      null;
    projects.push({
      id,
      spec,
      decision,
      original,
      uplifted,
      originalTreeDir: projectDir,
      upliftedTreeDir,
      runDir: projectRunDir,
      evidenceDir: projectRunDir && existsSync(join(projectRunDir, 'evidence')) ? join(projectRunDir, 'evidence') : null,
    });
  }

  const yieldReport = runDir ? readJson(join(runDir, 'yield.json')) : null;
  return { corpusRoot, runId: selectedRun, runs, projects, yieldReport };
}

/**
 * The per-project view model for the index and evidence pages. `scan` is the owner-auth scan
 * result (see owner-auth.mjs); `verification` compares the trees on disk against the recorded SHAs.
 */
export function projectView(project, { scan = null, verification = null } = {}) {
  const spec = project.spec ?? {};
  const decision = project.decision ?? null;
  return {
    id: project.id,
    archetype: spec.archetype ?? decision?.archetype ?? 'unknown',
    archetypeTitle: spec.archetype_title ?? null,
    framework: spec.framework?.name ?? decision?.framework ?? 'unknown',
    frameworkVersion: spec.framework?.version ?? null,
    frameworkFamily: spec.framework?.family ?? decision?.framework_family ?? null,
    requiredRules: spec.required_rules ?? [],
    seededDefects: spec.seeded_defects ?? decision?.seeded_defects ?? [],
    hasRun: decision !== null,
    accepted: decision?.accepted ?? null,
    category: decision?.category ?? null,
    decisionDetail: decision?.detail ?? [],
    improvedRules: decision?.improved_rules ?? [],
    regressedRules: decision?.regressed_rules ?? [],
    newSecurityFindings: decision?.new_security_findings ?? [],
    upliftEdits: decision?.uplift_edits ?? null,
    upliftApplied: decision?.uplift_applied ?? [],
    upliftSkipped: decision?.uplift_skipped ?? [],
    upliftFailed: decision?.uplift_failed ?? [],
    originalSha: decision?.original_sha ?? null,
    upliftedSha: decision?.uplifted_sha ?? null,
    original: project.original,
    uplifted: project.uplifted,
    evidenceDir: project.evidenceDir,
    runDir: project.runDir,
    originalTreeDir: project.originalTreeDir,
    upliftedTreeDir: project.upliftedTreeDir,
    scan,
    verification,
  };
}

/** Index filters: archetype, framework, accept state (incl. per-category rejects), and rule. */
export function filterProjects(views, { archetype = null, framework = null, state = null, rule = null } = {}) {
  return views.filter((view) => {
    if (archetype && view.archetype !== archetype) return false;
    if (framework && view.framework !== framework) return false;
    if (state) {
      if (state === 'accepted' && view.accepted !== true) return false;
      if (state === 'rejected' && (view.accepted !== false || !view.hasRun)) return false;
      if (state === 'no-run' && view.hasRun) return false;
      if (!['accepted', 'rejected', 'no-run'].includes(state) && view.category !== state) return false;
    }
    if (rule) {
      const inRequired = view.requiredRules.includes(rule);
      const inImproved = view.improvedRules.includes(rule);
      if (!inRequired && !inImproved) return false;
    }
    return true;
  });
}
