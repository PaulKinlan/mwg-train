#!/usr/bin/env node
/**
 * Gate the archetype asset sets: the store must still be an extraction of the accepted targets, and the
 * register must still describe the store.
 *
 *   node scripts/check-archetype-assets.mjs [--store assets/archetypes] [--help]
 *
 * The property being protected is that "build the booking archetype" means one thing to every model
 * asked to build it. If a target's palette changes and its five framework builds still carry the old
 * accent, or if one build invents its own imagery, the difference between two builds stops being
 * attributable to the model that produced it and starts being an input difference. That is why this is a
 * gate and not a convention.
 *
 * Fails closed: it never throws, a missing file is a FAIL rather than a stack trace, and it exits
 * non-zero on any finding. It re-derives every value from the accepted target rather than trusting the
 * stored copy, so a store that has drifted from its target cannot pass by agreeing with itself.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

import { STORE_DIR, archetypeIds, inspectCommitted, renderRegister, renderStoreReadme, setDocument } from './build-archetype-assets.mjs';

function parseArgs(argv) {
  const args = { root: '.' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') args.root = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`check-archetype-assets: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error('usage: node scripts/check-archetype-assets.mjs [--root <repo>]');
    process.exit(0);
  }
  const root = resolve(args.root);
  const findings = [];
  let result;
  try {
    result = inspectCommitted(root);
  } catch (error) {
    console.log(`FINDING ARCHETYPE_ASSET_CHECK_ERROR the check itself failed: ${error.message}`);
    console.error('check-archetype-assets: FAIL - the check could not run');
    process.exit(1);
  }
  findings.push(...result.findings);

  // The register and the generated store pages are themselves checked, because a hand-edited register
  // that disagrees with the bytes it names is worse than no register: it looks like provenance.
  const registerPath = join(root, 'docs/provenance/assets/archetype-asset-sets.md');
  if (!existsSync(registerPath)) findings.push('no register at docs/provenance/assets/archetype-asset-sets.md');
  else if (readFileSync(registerPath, 'utf8') !== renderRegister(result.documents)) {
    findings.push('the register disagrees with the sets it describes; re-run scripts/build-archetype-assets.mjs --register');
  }
  for (const document of result.documents) {
    const readmePath = join(root, STORE_DIR, document.archetype, 'README.md');
    if (!existsSync(readmePath)) {
      findings.push(`${document.archetype}: no store README`);
      continue;
    }
    if (readFileSync(readmePath, 'utf8') !== renderStoreReadme(document, [])) {
      findings.push(`${document.archetype}: the store README disagrees with its set; re-run scripts/build-archetype-assets.mjs --write`);
    }
  }
  // A whole archetype missing from the store is the failure this gate exists for: a build for it would
  // silently have no brand, no palette and no imagery.
  for (const id of archetypeIds(root)) {
    if (!existsSync(join(root, STORE_DIR, id, 'set.json'))) findings.push(`${id}: the archetype has no asset set`);
  }

  for (const finding of findings) console.log(`FINDING ARCHETYPE_ASSET ${finding}`);
  if (findings.length > 0) {
    console.error(`check-archetype-assets: FAIL - ${findings.length} finding(s); the store is not proven to be an extraction of the accepted targets`);
    process.exit(1);
  }
  const boards = result.documents.reduce((total, document) => total + document.images.length, 0);
  const colours = result.documents.reduce((total, document) => total + Object.keys(document.tokens.colors).length, 0);
  console.log(
    `check-archetype-assets: PASS - ${result.documents.length} archetype set(s) match their accepted targets (${boards} state board(s), ${colours} palette token(s)); ${relative(root, registerPath)} describes all of them`,
  );
}

main();
