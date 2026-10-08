#!/usr/bin/env node
/**
 * Extract the MWG rule vocabulary (category ids and guide ids) from an installed modern-web-guidance
 * skill, so that evaluation briefs reference real rules instead of invented ones.
 *
 *   node scripts/extract-mwg-rules.mjs --skill-dir ~/.agents/skills/modern-web-guidance \
 *     --out docs/eval/rules.json
 *
 * Only ids and the category structure are recorded - no guide text is copied - because the briefs
 * only need to name rules. The guide text is CC-BY-4.0 (see docs/provenance/assets/
 * mwg-modern-web-guidance.md) and lives in the pinned package.
 *
 * The output records a sha256 over the sorted `category/guide` list. If the vocabulary changes
 * (a skill update, a different pin), that hash changes, which is what the brief validator compares
 * against: a brief that references a rule outside the pinned snapshot fails, rather than silently
 * naming a rule that does not exist.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { extractVocabulary, ruleSetHash } from '../src/eval/ruleset.mjs';

function parseArgs(argv) {
  const args = { skillDir: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--skill-dir') args.skillDir = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`extract-mwg-rules: unknown argument '${argv[i]}'`);
      process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.skillDir || !args.out) {
  console.error('usage: node scripts/extract-mwg-rules.mjs --skill-dir <installed skill dir> --out <rules.json>');
  process.exit(args.help ? 0 : 2);
}

const skillDir = realpathSync(resolve(args.skillDir));
const categories = extractVocabulary(skillDir);

const ruleSetHashValue = ruleSetHash(categories);

let skillVersion = '';
try {
  const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  skillVersion = skill.match(/--skill-version\s+(\S+)/)?.[1] ?? '';
} catch {
  skillVersion = '';
}

const out = {
  source: 'modern-web-guidance',
  skill_version: skillVersion,
  skill_dir: skillDir,
  generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  generator: 'scripts/extract-mwg-rules.mjs',
  note: 'Ids only: no guide text is reproduced. Guide text is CC-BY-4.0; see docs/provenance/assets/mwg-modern-web-guidance.md.',
  counts: { categories: Object.keys(categories).length, guides: Object.values(categories).flat().length },
  rule_set_hash: ruleSetHashValue,
  categories,
};

writeFileSync(resolve(args.out), `${JSON.stringify(out, null, 2)}\n`);
console.log(`extract-mwg-rules: ${out.counts.categories} categories, ${out.counts.guides} guides, ${ruleSetHashValue} -> ${args.out}`);
if (!skillVersion) console.error('extract-mwg-rules: warning: no --skill-version found in SKILL.md');
