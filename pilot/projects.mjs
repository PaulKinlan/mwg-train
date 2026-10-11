/**
 * The join between the archetype table and the framework templates.
 *
 * Deliberately a separate module from `frameworks.mjs`: the templates must not depend on the archetype
 * data, so that a durable specification can rebuild a project through `buildProjectFor` on a machine
 * where `archetypes.mjs` (and this file) are gone or unreadable. Nothing that the rebuild path imports
 * reads the archetype table.
 */
import { ARCHETYPES } from './archetypes.mjs';
import { buildProjectFor } from './frameworks.mjs';
import { loadArchetypeSet } from '../src/design/archetype-assets.mjs';

/**
 * Build a project from an archetype id - the path the scaffolder and the corpus record use.
 *
 * The archetype's asset set is loaded here and handed to the builder, so a pilot build carries the
 * target's own brand, palette, font stack and recorded imagery instead of the template's generic
 * palette. It is loaded fail-closed: a missing or unusable store fails the build rather than quietly
 * producing a page whose palette looks like every other archetype's. `purpose` is 'build' because these
 * trees are what the pilot measures - the rights on every set allow that and forbid training.
 */
export function buildProject({ archetypeId, frameworkName, defects = [], flags = {}, withAssets = true }) {
  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) throw new Error(`unknown archetype ${archetypeId}`);
  const set = withAssets ? loadArchetypeSet(archetypeId) : null;
  return buildProjectFor(archetype, { frameworkName, defects, flags, set, purpose: 'build' });
}
