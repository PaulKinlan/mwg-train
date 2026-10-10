#!/usr/bin/env node
/**
 * Measure empirical training-corpus size and derive token counts by scope.
 *
 *   node scripts/train-corpus-tokens.mjs [--corpus pilot|training|all] \
 *     [--plan pilot/plan.json] [--record pilot/TRAINING_CORPUS.json] \
 *     [--out docs/train/corpus/tokens.json] [--epochs 1] [--tokens <int>] \
 *     [--no-timestamp]
 *
 * Measures source trees of accepted projects in the pilot corpus (34 pairs)
 * or the tr-* training corpus (210 pairs across 30 families x 7 frameworks),
 * categorised by scope:
 *   - app_sources: application code the model is trained to write (PRIMARY headline)
 *   - project_manifest: package.json (reported separately)
 *   - harness_metadata: spec.json (harness metadata, explicitly excluded from headline)
 *   - prompt: brief prompt text (measured zero; documented gap)
 *
 * Token counts are derived using the canonical `estimateTokensFromCharacters` in
 * src/eval/cost.mjs.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildProject } from '../pilot/projects.mjs';
import { writeProject } from '../pilot/frameworks.mjs';
import { upliftProject } from '../src/corpus/uplift.mjs';
import { BASELINE_FIELDS } from '../src/eval/ruleset.mjs';
import { estimateTokensFromCharacters } from '../src/eval/cost.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const args = {
    plan: 'pilot/plan.json',
    corpusFile: 'pilot/CORPUS.json',
    corpusMode: 'pilot',
    record: 'pilot/TRAINING_CORPUS.json',
    trees: 'pilot/training-projects',
    out: 'docs/train/corpus/tokens.json',
    epochs: 1,
    tokens: null,
    noTimestamp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plan') {
      args.plan = argv[++i];
    } else if (arg === '--corpus') {
      const val = argv[++i];
      if (val === 'pilot' || val === 'training' || val === 'all' || val === 'both') {
        args.corpusMode = val;
      } else {
        args.corpusFile = val;
      }
    } else if (arg === '--record') {
      args.record = argv[++i];
      args.corpusMode = 'training';
    } else if (arg === '--trees') {
      args.trees = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--epochs') {
      const val = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(val) || val <= 0) {
        throw new Error(`--epochs must be a positive integer, got "${argv[i]}"`);
      }
      args.epochs = val;
    } else if (arg === '--tokens') {
      const val = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(val) || val < 0) {
        throw new Error(`--tokens must be a non-negative integer, got "${argv[i]}"`);
      }
      args.tokens = val;
    } else if (arg === '--no-timestamp') {
      args.noTimestamp = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`train-corpus-tokens: unknown argument "${arg}"`);
    }
  }

  return args;
}

function walkFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function classifyFile(relPath) {
  if (relPath === 'package.json') return 'project_manifest';
  if (relPath === 'spec.json') return 'harness_metadata';
  return 'app_sources';
}

function measureTreeByScope(dir) {
  const scopes = {
    app_sources: 0,
    project_manifest: 0,
    harness_metadata: 0,
  };
  for (const file of walkFiles(dir)) {
    const rel = relative(dir, file);
    const scope = classifyFile(rel);
    const chars = readFileSync(file, 'utf8').length;
    scopes[scope] = (scopes[scope] ?? 0) + chars;
  }
  return scopes;
}

export function ensureTrainingTrees(treesDir, recordPath, root = repoRoot) {
  const absTreesDir = resolve(root, treesDir);
  const absRecordPath = resolve(root, recordPath);
  let missing = false;

  if (!existsSync(absTreesDir)) {
    missing = true;
  } else if (existsSync(absRecordPath)) {
    try {
      const record = JSON.parse(readFileSync(absRecordPath, 'utf8'));
      if (Array.isArray(record.projects)) {
        for (const p of record.projects) {
          if (!existsSync(join(absTreesDir, p.project_id))) {
            missing = true;
            break;
          }
        }
      }
    } catch {
      missing = true;
    }
  }

  if (missing) {
    console.log(`Training trees missing in ${relative(root, absTreesDir)}; regenerating via scripts/scaffold-training-corpus.mjs...`);
    const scaffolder = resolve(root, 'scripts/scaffold-training-corpus.mjs');
    // `--record` is passed through, and that is a fix rather than tidiness (mwg-train-t0d). The scaffolder
    // defaults its record to pilot/TRAINING_CORPUS.json, which is a TRACKED file, so regenerating trees
    // into an isolated directory still rewrote the repository's corpus record: a caller that asked for its
    // trees somewhere else had a tracked file mutated behind its back, and a measurement pointed at a
    // scratch directory could rewrite the record its own comparison is measured against. The caller's
    // record path is now the child's record path.
    execFileSync(process.execPath, [scaffolder, '--out', relative(root, absTreesDir), '--record', relative(root, absRecordPath)], {
      cwd: root,
      timeout: 120_000,
      stdio: 'inherit',
    });
    console.log('Regenerated training trees successfully.');
    return true;
  }
  return false;
}

export function measurePilotCorpusTokens(options = {}) {
  const planPath = resolve(repoRoot, options.plan ?? 'pilot/plan.json');
  if (!existsSync(planPath)) {
    throw new Error(`plan file not found: ${planPath}`);
  }

  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const projectsPlanned = plan.projects?.length ?? 0;
  if (projectsPlanned === 0) {
    throw new Error(`plan at ${planPath} contains no projects`);
  }

  // Load accepted set from CORPUS.json if available
  let corpusAccepted = null;
  const corpusPath = resolve(repoRoot, options.corpusFile ?? options.corpus ?? 'pilot/CORPUS.json');
  if (existsSync(corpusPath)) {
    try {
      const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
      if (Array.isArray(corpus.projects)) {
        corpusAccepted = new Set(
          corpus.projects.filter((p) => p.accepted === true).map((p) => p.project_id),
        );
      }
    } catch (err) {
      console.warn(`warning: failed to parse corpus at ${corpusPath}: ${err.message}`);
    }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'train-corpus-tokens-pilot-'));

  try {
    const projectResults = [];
    const totals = {
      app_sources: { original: 0, uplifted: 0, total: 0 },
      project_manifest: { original: 0, uplifted: 0, total: 0 },
      harness_metadata: { original: 0, uplifted: 0, total: 0 },
      prompt: { original: 0, uplifted: 0, total: 0 },
      full_tree: { original: 0, uplifted: 0, total: 0 },
    };

    for (const project of plan.projects) {
      const projectId = `${project.archetype}-${project.framework}`;
      if (corpusAccepted && !corpusAccepted.has(projectId)) {
        continue;
      }

      const origDir = join(tempDir, `${projectId}-orig`);
      const upliftDir = join(tempDir, `${projectId}-uplift`);

      const built = buildProject({
        archetypeId: project.archetype,
        frameworkName: project.framework,
        defects: project.defects ?? [],
      });

      writeProject(origDir, built);
      const uplift = upliftProject(origDir, built.spec, upliftDir);

      const promptChars = typeof project.prompt === 'string' ? project.prompt.length : 0;
      const origScopes = measureTreeByScope(origDir);
      const upliftScopes = measureTreeByScope(upliftDir);

      const origFull = origScopes.app_sources + origScopes.project_manifest + origScopes.harness_metadata;
      const upliftFull = upliftScopes.app_sources + upliftScopes.project_manifest + upliftScopes.harness_metadata;

      totals.app_sources.original += origScopes.app_sources;
      totals.app_sources.uplifted += upliftScopes.app_sources;
      totals.app_sources.total += origScopes.app_sources + upliftScopes.app_sources;

      totals.project_manifest.original += origScopes.project_manifest;
      totals.project_manifest.uplifted += upliftScopes.project_manifest;
      totals.project_manifest.total += origScopes.project_manifest + upliftScopes.project_manifest;

      totals.harness_metadata.original += origScopes.harness_metadata;
      totals.harness_metadata.uplifted += upliftScopes.harness_metadata;
      totals.harness_metadata.total += origScopes.harness_metadata + upliftScopes.harness_metadata;

      totals.prompt.total += promptChars;

      totals.full_tree.original += origFull;
      totals.full_tree.uplifted += upliftFull;
      totals.full_tree.total += origFull + upliftFull + promptChars;

      projectResults.push({
        project_id: projectId,
        archetype: project.archetype,
        framework: project.framework,
        characters: {
          prompt: promptChars,
          original: origScopes.app_sources,
          uplifted: upliftScopes.app_sources,
          total: origScopes.app_sources + upliftScopes.app_sources + promptChars,
          scopes: {
            app_sources: {
              original: origScopes.app_sources,
              uplifted: upliftScopes.app_sources,
              total: origScopes.app_sources + upliftScopes.app_sources,
            },
            project_manifest: {
              original: origScopes.project_manifest,
              uplifted: upliftScopes.project_manifest,
              total: origScopes.project_manifest + upliftScopes.project_manifest,
            },
            harness_metadata: {
              original: origScopes.harness_metadata,
              uplifted: upliftScopes.harness_metadata,
              total: origScopes.harness_metadata + upliftScopes.harness_metadata,
            },
            full_tree: {
              original: origFull,
              uplifted: upliftFull,
              total: origFull + upliftFull,
            },
          },
        },
        uplift: {
          applied: uplift.applied.length,
          skipped: uplift.skipped.length,
          failed: uplift.failed.length,
        },
      });
    }

    // Headline is app_sources + prompt (sums both sides of pair)
    const headlineChars = totals.app_sources.total + totals.prompt.total;
    const headlineEstimate = estimateTokensFromCharacters(headlineChars);

    const isSupplied = typeof options.tokens === 'number';
    const effectiveTokenCount = isSupplied ? options.tokens : headlineEstimate.tokens;
    const epochs = options.epochs ?? 1;
    const totalTrainingTokens = effectiveTokenCount * epochs;

    const buildScopeReport = (charTotals, desc) => {
      const est = charTotals.total > 0 ? estimateTokensFromCharacters(charTotals.total) : { tokens: 0, band: [0, 0] };
      return {
        description: desc,
        characters: {
          prompt: charTotals.prompt ?? 0,
          original: charTotals.original ?? 0,
          uplifted: charTotals.uplifted ?? 0,
          total: charTotals.total,
        },
        tokens: {
          derived: est.tokens,
          band: est.band,
        },
      };
    };

    const scopesPayload = {
      app_sources: {
        description: 'Application source files the model is trained to write (server logic, client runtime, markup, styles, enhance); PRIMARY headline figure',
        characters: {
          prompt: totals.prompt.total,
          original: totals.app_sources.original,
          uplifted: totals.app_sources.uplifted,
          total: headlineChars,
        },
        tokens: {
          derived: headlineEstimate.tokens,
          band: headlineEstimate.band,
          source: isSupplied ? 'supplied' : 'derived',
          note: isSupplied
            ? 'Supplied count from training tokenizer on app_sources.'
            : headlineEstimate.note,
        },
      },
      project_manifest: buildScopeReport(
        totals.project_manifest,
        'Project package.json manifests (pinned dependencies and scripts)',
      ),
      harness_metadata: buildScopeReport(
        totals.harness_metadata,
        'Generator and harness spec.json metadata (strictly excluded from headline training token sizing)',
      ),
      prompt: {
        description: 'Brief prompt text (measured zero for pilot plan; documented gap; see README)',
        characters: totals.prompt.total,
        tokens: {
          derived: 0,
          band: [0, 0],
        },
      },
      full_tree: buildScopeReport(
        totals.full_tree,
        'Total filesystem tree including app sources, manifests, and harness metadata',
      ),
    };

    const outPayload = {
      // The report measures the UPLIFTED variant of every project, so it states a floor measurement and
      // attributes it like the other floor artifacts (bead mwg-train-6ek).
      ...BASELINE_FIELDS,
      plan: relative(repoRoot, planPath),
      headline_scope: 'app_sources',
      counts: {
        projects_planned: projectsPlanned,
        projects_accepted: corpusAccepted ? corpusAccepted.size : projectResults.length,
        pairs_measured: projectResults.length,
      },
      characters: {
        prompt: totals.prompt.total,
        original: totals.app_sources.original,
        uplifted: totals.app_sources.uplifted,
        total: headlineChars,
      },
      tokens: {
        tokens: effectiveTokenCount,
        derived: headlineEstimate.tokens,
        band: headlineEstimate.band,
        source: isSupplied ? 'supplied' : 'derived',
        scope: 'app_sources',
        note: isSupplied
          ? 'Supplied count from training tokenizer on app_sources.'
          : headlineEstimate.note,
      },
      epochs,
      total_training_tokens: totalTrainingTokens,
      scopes: scopesPayload,
      projects: projectResults,
    };

    if (!options.noTimestamp) {
      outPayload.generated_at = new Date().toISOString();
    }

    return outPayload;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function measureTrCorpusTokens(options = {}) {
  const recordPath = resolve(repoRoot, options.record ?? 'pilot/TRAINING_CORPUS.json');
  if (!existsSync(recordPath)) {
    throw new Error(`training record file not found: ${recordPath}`);
  }

  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  const projectsPlanned = record.projects?.length ?? 0;
  if (projectsPlanned === 0) {
    throw new Error(`record at ${recordPath} contains no projects`);
  }

  const treesDir = resolve(repoRoot, options.trees ?? 'pilot/training-projects');
  ensureTrainingTrees(treesDir, recordPath, repoRoot);

  const tempDir = mkdtempSync(join(tmpdir(), 'train-corpus-tokens-tr-'));

  try {
    const projectResults = [];
    const totals = {
      app_sources: { original: 0, uplifted: 0, total: 0 },
      project_manifest: { original: 0, uplifted: 0, total: 0 },
      harness_metadata: { original: 0, uplifted: 0, total: 0 },
      prompt: { original: 0, uplifted: 0, total: 0 },
      full_tree: { original: 0, uplifted: 0, total: 0 },
    };

    for (const project of record.projects) {
      const origDir = join(treesDir, project.project_id);
      if (!existsSync(origDir)) {
        throw new Error(`project tree not found: ${origDir}`);
      }

      const specPath = join(origDir, 'spec.json');
      if (!existsSync(specPath)) {
        throw new Error(`spec.json not found in ${origDir}`);
      }
      const spec = JSON.parse(readFileSync(specPath, 'utf8'));

      const upliftDir = join(tempDir, `${project.project_id}-uplift`);
      const uplift = upliftProject(origDir, spec, upliftDir);

      const promptChars = typeof project.prompt === 'string' ? project.prompt.length : 0;
      const origScopes = measureTreeByScope(origDir);
      const upliftScopes = measureTreeByScope(upliftDir);

      const origFull = origScopes.app_sources + origScopes.project_manifest + origScopes.harness_metadata;
      const upliftFull = upliftScopes.app_sources + upliftScopes.project_manifest + upliftScopes.harness_metadata;

      totals.app_sources.original += origScopes.app_sources;
      totals.app_sources.uplifted += upliftScopes.app_sources;
      totals.app_sources.total += origScopes.app_sources + upliftScopes.app_sources;

      totals.project_manifest.original += origScopes.project_manifest;
      totals.project_manifest.uplifted += upliftScopes.project_manifest;
      totals.project_manifest.total += origScopes.project_manifest + upliftScopes.project_manifest;

      totals.harness_metadata.original += origScopes.harness_metadata;
      totals.harness_metadata.uplifted += upliftScopes.harness_metadata;
      totals.harness_metadata.total += origScopes.harness_metadata + upliftScopes.harness_metadata;

      totals.prompt.total += promptChars;

      totals.full_tree.original += origFull;
      totals.full_tree.uplifted += upliftFull;
      totals.full_tree.total += origFull + upliftFull + promptChars;

      projectResults.push({
        project_id: project.project_id,
        family_id: project.family_id,
        brief_id: project.brief_id,
        archetype: project.archetype,
        framework: project.framework,
        task: project.task,
        characters: {
          prompt: promptChars,
          original: origScopes.app_sources,
          uplifted: upliftScopes.app_sources,
          total: origScopes.app_sources + upliftScopes.app_sources + promptChars,
          scopes: {
            app_sources: {
              original: origScopes.app_sources,
              uplifted: upliftScopes.app_sources,
              total: origScopes.app_sources + upliftScopes.app_sources,
            },
            project_manifest: {
              original: origScopes.project_manifest,
              uplifted: upliftScopes.project_manifest,
              total: origScopes.project_manifest + upliftScopes.project_manifest,
            },
            harness_metadata: {
              original: origScopes.harness_metadata,
              uplifted: upliftScopes.harness_metadata,
              total: origScopes.harness_metadata + upliftScopes.harness_metadata,
            },
            full_tree: {
              original: origFull,
              uplifted: upliftFull,
              total: origFull + upliftFull,
            },
          },
        },
        uplift: {
          applied: uplift.applied.length,
          skipped: uplift.skipped.length,
          failed: uplift.failed.length,
        },
      });
    }

    // Headline is app_sources only (sums both sides of pair)
    const headlineChars = totals.app_sources.total;
    const headlineEstimate = estimateTokensFromCharacters(headlineChars);

    const isSupplied = typeof options.tokens === 'number';
    const effectiveTokenCount = isSupplied ? options.tokens : headlineEstimate.tokens;
    const epochs = options.epochs ?? 1;
    const totalTrainingTokens = effectiveTokenCount * epochs;

    const buildScopeReport = (charTotals, desc) => {
      const est = charTotals.total > 0 ? estimateTokensFromCharacters(charTotals.total) : { tokens: 0, band: [0, 0] };
      return {
        description: desc,
        characters: {
          prompt: charTotals.prompt ?? 0,
          original: charTotals.original ?? 0,
          uplifted: charTotals.uplifted ?? 0,
          total: charTotals.total,
        },
        tokens: {
          derived: est.tokens,
          band: est.band,
        },
      };
    };

    const scopesPayload = {
      app_sources: {
        description: 'Application source files the model is trained to write (server logic, client runtime, markup, styles, enhance); PRIMARY headline figure',
        characters: {
          prompt: totals.prompt.total,
          original: totals.app_sources.original,
          uplifted: totals.app_sources.uplifted,
          total: headlineChars,
        },
        tokens: {
          derived: headlineEstimate.tokens,
          band: headlineEstimate.band,
          source: isSupplied ? 'supplied' : 'derived',
          note: isSupplied
            ? 'Supplied count from training tokenizer on app_sources.'
            : headlineEstimate.note,
        },
      },
      project_manifest: buildScopeReport(
        totals.project_manifest,
        'Project package.json manifests (pinned dependencies and scripts)',
      ),
      harness_metadata: buildScopeReport(
        totals.harness_metadata,
        'Generator and harness spec.json metadata (strictly excluded from headline training token sizing)',
      ),
      prompt: {
        description: 'Brief prompt text (measured zero for training record; documented gap; see README)',
        characters: totals.prompt.total,
        tokens: {
          derived: 0,
          band: [0, 0],
        },
      },
      full_tree: buildScopeReport(
        totals.full_tree,
        'Total filesystem tree including app sources, manifests, and harness metadata',
      ),
    };

    const outPayload = {
      record: relative(repoRoot, recordPath),
      trees: relative(repoRoot, treesDir),
      headline_scope: 'app_sources',
      counts: {
        families: record.summary?.families ?? new Set(record.projects.map((p) => p.family_id)).size,
        frameworks: record.summary?.frameworks ?? new Set(record.projects.map((p) => p.framework)).size,
        projects_planned: projectsPlanned,
        projects_accepted: projectsPlanned,
        pairs_measured: projectResults.length,
      },
      characters: {
        prompt: totals.prompt.total,
        original: totals.app_sources.original,
        uplifted: totals.app_sources.uplifted,
        total: headlineChars,
      },
      tokens: {
        tokens: effectiveTokenCount,
        derived: headlineEstimate.tokens,
        band: headlineEstimate.band,
        source: isSupplied ? 'supplied' : 'derived',
        scope: 'app_sources',
        note: isSupplied
          ? 'Supplied count from training tokenizer on app_sources.'
          : headlineEstimate.note,
      },
      epochs,
      total_training_tokens: totalTrainingTokens,
      scopes: scopesPayload,
      projects: projectResults,
    };

    if (!options.noTimestamp) {
      outPayload.generated_at = new Date().toISOString();
    }

    return outPayload;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function measureTrainingCorpusTokens(options = {}) {
  const mode = options.corpusMode ?? (options.record && !options.plan ? 'training' : 'pilot');
  if (mode === 'training') {
    return measureTrCorpusTokens(options);
  }
  if (mode === 'all' || mode === 'both') {
    return {
      pilot: measurePilotCorpusTokens(options),
      training: measureTrCorpusTokens(options),
    };
  }
  return measurePilotCorpusTokens(options);
}

function hasSections(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return data && typeof data === 'object' && ('pilot' in data || 'training' in data);
  } catch {
    return false;
  }
}

export function writeTokensJson(outPath, mode, result, options = {}) {
  const resolvedOut = resolve(repoRoot, outPath);
  mkdirSync(dirname(resolvedOut), { recursive: true });

  const isCanonical = resolvedOut === resolve(repoRoot, 'docs/train/corpus/tokens.json');

  if (isCanonical || (existsSync(resolvedOut) && hasSections(resolvedOut))) {
    let existing = {};
    if (existsSync(resolvedOut)) {
      try {
        existing = JSON.parse(readFileSync(resolvedOut, 'utf8'));
      } catch {
        existing = {};
      }
    }
    // If existing was the legacy flat pilot object:
    if (existing.plan && !existing.pilot) {
      existing = {
        pilot: existing,
        training: null,
      };
    }

    const output = {
      $comment:
        existing.$comment ??
        'Empirical character measurements and derived token sizing for the pilot corpus (34 accepted pairs) and the tr-* training corpus (210 pairs across 30 families x 7 frameworks). Figures are derived estimates (characters/4), not tokenizer-measured. Primary headline sizing is app_sources only, summing both sides of each pair (serialized pair-volume estimate).',
      pilot: existing.pilot ?? null,
      training: existing.training ?? null,
      // The document states a corpus-wide token floor, so it attributes itself. BASELINE_FIELDS was
      // imported here and never used, so every regeneration wrote the measurement WITHOUT the
      // attribution and `label:baseline --check` went red again - the committed file carried none of the
      // three fields (mwg-train-jjl). Placed last to match the order the repair tool appends them in.
      ...BASELINE_FIELDS,
    };

    if (mode === 'pilot') {
      output.pilot = result;
    } else if (mode === 'training') {
      output.training = result;
    } else if (mode === 'all' || mode === 'both') {
      output.pilot = result.pilot;
      output.training = result.training;
    }

    writeFileSync(resolvedOut, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  } else {
    // Standalone file write (e.g. /tmp/t1.json)
    writeFileSync(resolvedOut, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
}

function printReport(result) {
  const isTr = !result.plan && (result.record || result.trees);
  const title = isTr
    ? 'Training Corpus Token Measurement (tr-* Training Corpus):'
    : 'Training Corpus Token Measurement:';
  console.log(title);
  if (isTr) {
    console.log(`  Record: ${result.record}`);
    console.log(`  Projects: ${result.counts.pairs_measured} measured (${result.counts.families} families x ${result.counts.frameworks} frameworks)`);
  } else {
    console.log(`  Plan: ${result.plan}`);
    console.log(`  Projects: ${result.counts.pairs_measured} measured (${result.counts.projects_accepted} accepted / ${result.counts.projects_planned} planned)`);
  }
  console.log('');
  console.log('Headline Sizing (app_sources only; excludes spec.json harness metadata):');
  console.log(`  Characters: ${result.characters.total.toLocaleString()} total`);
  console.log(`    - Original app sources: ${result.characters.original.toLocaleString()}`);
  console.log(`    - Uplifted app sources: ${result.characters.uplifted.toLocaleString()}`);
  console.log(`    - Brief prompts:        ${result.characters.prompt.toLocaleString()}`);
  console.log(`  Tokens: ${result.tokens.tokens.toLocaleString()} (${result.tokens.source})`);
  console.log(`    - Derived: ${result.tokens.derived.toLocaleString()} (band: [${result.tokens.band[0].toLocaleString()}, ${result.tokens.band[1].toLocaleString()}])`);
  console.log(`    - Note: ${result.tokens.note}`);
  console.log(`  Epochs: ${result.epochs}`);
  console.log(`  Total training tokens: ${result.total_training_tokens.toLocaleString()}`);
  console.log('');
  console.log('Per-Scope Measurement Breakdown:');
  console.log('  Scope               Original    Uplifted       Total     Derived Tokens  Band (±25%)');
  console.log('  --------------------------------------------------------------------------------------------------');
  const printRow = (label, orig, up, tot, tok, lo, hi, note = '') => {
    const sLabel = label.padEnd(18);
    const sOrig = orig.toLocaleString().padStart(10);
    const sUp = up.toLocaleString().padStart(11);
    const sTot = tot.toLocaleString().padStart(11);
    const sTok = tok.toLocaleString().padStart(18);
    const sBand = `[${lo.toLocaleString()}, ${hi.toLocaleString()}]`.padEnd(25);
    console.log(`  ${sLabel} ${sOrig} ${sUp} ${sTot} ${sTok}  ${sBand} ${note}`);
  };

  const sc = result.scopes;
  printRow('app_sources', sc.app_sources.characters.original, sc.app_sources.characters.uplifted, sc.app_sources.characters.total, sc.app_sources.tokens.derived, sc.app_sources.tokens.band[0], sc.app_sources.tokens.band[1], '(PRIMARY headline)');
  printRow('project_manifest', sc.project_manifest.characters.original, sc.project_manifest.characters.uplifted, sc.project_manifest.characters.total, sc.project_manifest.tokens.derived, sc.project_manifest.tokens.band[0], sc.project_manifest.tokens.band[1], '(package.json)');
  printRow('harness_metadata', sc.harness_metadata.characters.original, sc.harness_metadata.characters.uplifted, sc.harness_metadata.characters.total, sc.harness_metadata.tokens.derived, sc.harness_metadata.tokens.band[0], sc.harness_metadata.tokens.band[1], '(spec.json; EXCLUDED)');
  printRow('prompt', 0, 0, sc.prompt.characters, sc.prompt.tokens.derived, sc.prompt.tokens.band[0], sc.prompt.tokens.band[1], '(measured zero; see README)');
  console.log('  --------------------------------------------------------------------------------------------------');
  printRow('full_tree (all)', sc.full_tree.characters.original, sc.full_tree.characters.uplifted, sc.full_tree.characters.total, sc.full_tree.tokens.derived, sc.full_tree.tokens.band[0], sc.full_tree.tokens.band[1]);
  console.log('');
}

export function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (args.help) {
    console.log(`Usage: node scripts/train-corpus-tokens.mjs [options]

Options:
  --corpus <name>     Corpus to measure: pilot | training | all (default: pilot)
  --plan <path>       Pilot corpus plan JSON (default: pilot/plan.json)
  --record <path>     Training corpus record JSON (default: pilot/TRAINING_CORPUS.json)
  --trees <path>      Training projects directory (default: pilot/training-projects)
  --out <path>        Output JSON path (default: docs/train/corpus/tokens.json)
  --epochs <int>      Epochs multiplier (default: 1)
  --tokens <int>      Supplied real tokenizer measurement
  --no-timestamp      Omit generated_at timestamp for deterministic output comparison
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  const result = measureTrainingCorpusTokens(args);
  const outPath = resolve(repoRoot, args.out);

  writeTokensJson(args.out, args.corpusMode, result, args);

  if (args.corpusMode === 'all' || args.corpusMode === 'both') {
    printReport(result.pilot);
    printReport(result.training);
  } else {
    printReport(result);
  }

  console.log(`  Output written to: ${relative(repoRoot, outPath)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
