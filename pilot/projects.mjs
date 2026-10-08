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

/** Build a project from an archetype id - the path the scaffolder and the corpus record use. */
export function buildProject({ archetypeId, frameworkName, defects = [], flags = {} }) {
  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) throw new Error(`unknown archetype ${archetypeId}`);
  return buildProjectFor(archetype, { frameworkName, defects, flags });
}
