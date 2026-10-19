import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Both browser/scorer entry points, not a hand-picked subset of their imports.
export const STEP4_INSTRUMENT_ENTRYPOINTS = Object.freeze([
  'scripts/default-step4-score.mjs', 'scripts/default-step4-smoke.mjs',
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sourceImports(source, name) {
  let ast;
  try { ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (error) { throw Error(`INSTRUMENT_PARSE_FAILURE: ${name}: ${error.message}`); }
  const specifiers = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const entry of node) walk(entry); return; }
    if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      if (node.source) specifiers.push(node.source.value);
    } else if (node.type === 'ImportExpression') {
      if (node.source?.type !== 'Literal' || typeof node.source.value !== 'string')
        throw Error(`INSTRUMENT_DYNAMIC_IMPORT: ${name}`);
      specifiers.push(node.source.value);
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  walk(ast);
  return specifiers;
}

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
    for (const specifier of sourceImports(bytes.toString('utf8'), name)) {
      if (specifier.startsWith('node:')) continue;
      if (specifier === 'acorn') {
        // The parser itself is executable instrument code. Include its installed bytes and
        // the pinned dependency identity rather than trusting a bare-package import.
        for (const dependency of ['node_modules/acorn/package.json', 'node_modules/acorn/dist/acorn.mjs', 'package-lock.json']) {
          const installed = join(base, dependency);
          if (realpathSync(installed) !== installed || !lstatSync(installed).isFile())
            throw Error(`INSTRUMENT_UNSAFE_SOURCE: ${dependency}`);
          visited.set(dependency, sha256(readFileSync(installed)));
        }
        const installedVersion = JSON.parse(readFileSync(join(base, 'node_modules/acorn/package.json'), 'utf8')).version;
        const lock = JSON.parse(readFileSync(join(base, 'package-lock.json'), 'utf8'));
        if (lock.packages?.['node_modules/acorn']?.version !== installedVersion ||
            !lock.packages?.['']?.dependencies?.acorn)
          throw Error('INSTRUMENT_UNPINNED_DEPENDENCY: acorn version differs from lockfile');
        continue;
      }
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
