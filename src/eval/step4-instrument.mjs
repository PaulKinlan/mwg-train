import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Both browser/scorer entry points, not a hand-picked subset of their imports.
export const STEP4_INSTRUMENT_ENTRYPOINTS = Object.freeze([
  'scripts/default-step4-score.mjs', 'scripts/default-step4-smoke.mjs',
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const staticImports = /(?:^|\n)[ \t]*(?:import|export)\s+(?:[^'";]*?\bfrom\s*)?['"]([^'"\n]+)['"]/g;
const dynamicImports = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

/** Resolve all locally imported source bytes. Reject packages, unknown dynamic imports and outside paths. */
function collectStep4Sources(root) {
  const base = resolve(root);
  const visited = new Map();
  const visit = (file) => {
    const path = resolve(file);
    const name = relative(base, path).split(sep).join('/');
    if (name.startsWith('../') || name === '..' || name.startsWith('/') || !name.endsWith('.mjs'))
      throw Error(`INSTRUMENT_UNSAFE_SOURCE: ${name}`);
    if (visited.has(name)) return;
    if (realpathSync(path) !== path || !lstatSync(path).isFile()) throw Error(`INSTRUMENT_UNSAFE_SOURCE: ${name}`);
    const bytes = readFileSync(path);
    visited.set(name, sha256(bytes));
    const source = bytes.toString('utf8');
    const statics = [...source.matchAll(staticImports)];
    const dynamics = [...source.matchAll(dynamicImports)];
    if (dynamics.length !== [...source.matchAll(/\bimport\s*\(/g)].length)
      throw Error(`INSTRUMENT_DYNAMIC_IMPORT: ${name}`);
    for (const [, specifier] of [...statics, ...dynamics]) {
      if (specifier.startsWith('node:')) continue;
      if (!specifier.startsWith('./') && !specifier.startsWith('../'))
        throw Error(`INSTRUMENT_UNPINNED_DEPENDENCY: ${name}`);
      visit(resolve(dirname(path), specifier));
    }
  };
  for (const name of STEP4_INSTRUMENT_ENTRYPOINTS) visit(join(base, name));
  return visited;
}

export function step4InstrumentFiles(root) {
  return [...collectStep4Sources(root).keys()].sort();
}

/** Pin named bytes from the entire local module import closure, not a possibly dirty HEAD. */
export function step4InstrumentDigest(root) {
  const sources = collectStep4Sources(root);
  const lines = [...sources.keys()].sort().map((name) => `${name}\0${sources.get(name)}`);
  return sha256(`${lines.join('\n')}\n`);
}

/** Receipt publication and the end-of-run guard are one inseparable operation. */
export function writeStep4Receipt({ root, instrumentSha256, destination, receipt }) {
  if (step4InstrumentDigest(root) !== instrumentSha256) throw Error('INSTRUMENT_MUTATED_DURING_RUN');
  const output = { ...receipt, instrument_sha256: instrumentSha256 };
  writeFileSync(join(destination, 'receipt.json'), `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
