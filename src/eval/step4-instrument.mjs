import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Actual bytes used by the scorer, browser driver, rule checks and sandbox matter more
// than HEAD: initial Step 4 receipts were produced before those files were committed.
export const STEP4_INSTRUMENT_FILES = Object.freeze([
  'scripts/default-step4-score.mjs',
  'scripts/default-step4-smoke.mjs',
  'src/corpus/accept.mjs',
  'src/corpus/cdp.mjs',
  'src/corpus/harness.mjs',
  'src/corpus/rules.mjs',
  'src/corpus/sandbox.mjs',
  'src/corpus/search-decoy.mjs',
  'src/eval/default-cordon.mjs',
  'src/eval/default-step4-preflight.mjs',
  'src/eval/default-step4-verdict.mjs',
  'src/eval/step4-instrument.mjs',
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Hash the measurement instrument's named source bytes, not a possibly dirty git commit. */
export function step4InstrumentDigest(root) {
  const lines = STEP4_INSTRUMENT_FILES.map((name) => {
    const file = resolve(join(root, name));
    if (realpathSync(file) !== file || !lstatSync(file).isFile()) throw Error(`INSTRUMENT_UNSAFE_SOURCE: ${name}`);
    return `${name}\0${sha256(readFileSync(file))}`;
  });
  return sha256(`${lines.join('\n')}\n`);
}
