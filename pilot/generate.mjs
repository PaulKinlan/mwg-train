/**
 * One implementation of "the corpus on disk".
 *
 * Three scripts used to answer that question differently: the scaffolder generated the tree, the
 * recorder generated it again with its own copy of the loop, and the pilot *read whatever was already
 * in pilot/projects*. That last one is the dangerous one - a stale directory was measured silently and
 * then reported as an unsatisfiable corpus, which is how a run of 25/25 came to mean nothing. The
 * measured tree and the verified tree must be the same tree, and the only way to guarantee that is for
 * both to come from here.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { writeProject } from './frameworks.mjs';
import { buildProject } from './projects.mjs';

/** Read the plan. Kept separate so callers can validate it before anything is written. */
export function readPlan(planPath = 'pilot/plan.json') {
  return JSON.parse(readFileSync(resolve(planPath), 'utf8'));
}

/**
 * Generate every project in the plan into `outDir`, and return them keyed by project id.
 *
 * The result carries the built spec as well as the directory, because the measured difference has to be
 * attributable to the uplift rule and not to project-to-project drift.
 */
export function generateCorpus({ plan, planPath = 'pilot/plan.json', outDir, clean = true }) {
  const resolvedPlan = plan ?? readPlan(planPath);
  const root = resolve(outDir);
  if (clean) rmSync(root, { recursive: true, force: true });
  const projects = [];
  for (const entry of resolvedPlan.projects) {
    const built = buildProject({
      archetypeId: entry.archetype,
      frameworkName: entry.framework,
      defects: entry.defects ?? [],
      flags: entry.flags ?? {},
    });
    const dir = writeProject(join(root, built.projectId), built);
    projects.push({
      projectId: built.projectId,
      archetype: entry.archetype,
      framework: entry.framework,
      defects: entry.defects ?? [],
      spec: built.spec,
      files: built.files,
      dir,
    });
  }
  const byFramework = {};
  for (const project of projects) byFramework[project.framework] = (byFramework[project.framework] ?? 0) + 1;
  return { root, projects, byFramework, plan: resolvedPlan };
}
